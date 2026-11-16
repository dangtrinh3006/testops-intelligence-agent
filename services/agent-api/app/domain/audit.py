"""Unified audit feed: agent answers, human triage decisions and fleet control-plane actions.

Agent answers and decisions live in a process-local ring buffer (in memory per instance, like the fleet): it resets on
restart or a serverless cold start and instances do not share it. Control-plane entries are read from the fleet's own
audit at query time, so they are never stored twice. A production install writes to an append-only store.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import fleet

MAX_ENTRIES = 500
MAX_LIMIT = 200
MAX_DECISIONS = 100
QUESTION_CHARS = 200
NOTE_CHARS = 200
REVIEWER = "reviewer (sandbox)"
OFFLINE_ACTOR = "offline planner"

Kind = Literal["agent.answer", "human.triage_decision", "control_plane"]
KINDS: tuple[str, ...] = ("agent.answer", "human.triage_decision", "control_plane")
Action = Literal["fix_product", "fix_test", "platform_ticket", "propose_quarantine", "investigate"]


class TriageDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    test_id: str = Field(min_length=3, max_length=40, pattern=r"^T-[A-Z]+-\d+$")
    attempt_id: str | None = Field(None, max_length=160, pattern=r"^[A-Za-z0-9:._-]+$")
    suggested_action: Action
    chosen_action: Action
    status: Literal["accepted", "overridden"]
    note: str | None = Field(None, max_length=NOTE_CHARS)

    @model_validator(mode="after")
    def _consistent(self) -> TriageDecision:
        # An "accepted" decision that changes the action would make the audit trail lie about who decided what.
        if (self.status == "accepted") != (self.chosen_action == self.suggested_action):
            raise ValueError("accepted requires chosen_action == suggested_action; overridden requires a different action")
        return self


class TriageDecisionBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[TriageDecision] = Field(min_length=1, max_length=MAX_DECISIONS)


def _iso(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def _clean(text: str | None, limit: int) -> str | None:
    if not text:
        return None
    return fleet.EMAIL.sub("[redacted-email]", text.strip())[:limit] or None


class AuditLog:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.Lock()
        self.entries: deque = deque(maxlen=MAX_ENTRIES)
        self.seq = 0

    def _append(self, kind: str, actor: str, summary: str, detail: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            self.seq += 1
            entry = {"id": f"aud-{self.seq:05d}", "ts": _iso(self.clock()), "kind": kind, "actor": actor,
                     "summary": summary, "detail": detail}
            self.entries.append(entry)
            return entry

    def record_answer(self, resp: dict[str, Any]) -> dict[str, Any]:
        """resp is an AskResponse as a dict (the /api/ask body or the stream's final event)."""
        validation = resp.get("validation") or {}
        gate = resp.get("gate")
        verdicts = [{"run_id": gate["run_id"], "verdict": gate["verdict"], "rule": gate.get("deciding_rule")}] if gate else []
        failed = [c.get("name", "?") for c in validation.get("checks", []) if not c.get("passed")]
        question = _clean(resp.get("question"), QUESTION_CHARS) or ""
        detail = {
            "request_id": resp.get("request_id"), "question": question, "mode": resp.get("mode"), "model": resp.get("model"),
            "verdicts": verdicts, "validation_passed": bool(validation.get("passed")), "failed_checks": failed,
            "revisions": int(validation.get("revisions") or 0), "tool_calls": len(resp.get("tool_trace") or []),
            "latency_ms": int(resp.get("latency_ms") or 0), "notice": _clean(resp.get("notice"), 240),
        }
        verdict = f" → {verdicts[0]['verdict']} ({verdicts[0]['run_id']})" if verdicts else ""
        return self._append("agent.answer", resp.get("model") or OFFLINE_ACTOR, f"Answered: {question[:120]}{verdict}", detail)

    def record_decisions(self, batch: TriageDecisionBatch) -> list[dict[str, Any]]:
        out = []
        for d in batch.decisions:
            note = _clean(d.note, NOTE_CHARS)
            detail = {**d.model_dump(exclude={"note"}), "note": note}
            verb = "accepted" if d.status == "accepted" else f"overrode {d.suggested_action} →"
            out.append(self._append("human.triage_decision", REVIEWER, f"{d.test_id}: {verb} {d.chosen_action}", detail))
        return out

    def feed(self, kind: str | None = None, limit: int = 50) -> dict[str, Any]:
        with self.lock:
            own = list(self.entries)
        fs = fleet.store()
        with fs.lock:
            fleet_audit = list(fs.audit)
        control = [
            {"id": f"fleet-{i:05d}", "ts": a["ts"], "kind": "control_plane", "actor": a["actor"],
             "summary": f"{a['action']} · {a['target']} · {a['detail']}",
             "detail": {"action": a["action"], "target": a["target"], "note": a["detail"]}}
            for i, a in enumerate(fleet_audit)
        ]
        counts = {"agent.answer": 0, "human.triage_decision": 0, "control_plane": len(control)}
        for e in own:
            counts[e["kind"]] += 1
        rows = [e for e in [*control, *own] if kind is None or e["kind"] == kind]
        # Stable sort keeps insertion order for entries in the same second; reversed gives newest first.
        rows.sort(key=lambda e: e["ts"])
        rows.reverse()
        return {"entries": rows[: max(1, min(limit, MAX_LIMIT))], "counts": counts, "total": sum(counts.values()),
                "capacity": MAX_ENTRIES, "storage": "in_memory", "as_of_utc": _iso(self.clock())}


_log = AuditLog()


def log() -> AuditLog:
    return _log


def reset(clock=time.time) -> AuditLog:
    global _log
    _log = AuditLog(clock)
    return _log
