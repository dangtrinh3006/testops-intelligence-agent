"""Turns a question into an AskResponse in one of three honest modes: live model, replayed trace, offline rules."""

from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path

from app.etl import Dataset
from app.schemas import AskResponse, Claim, EvidenceRef, GateView, ToolCall, Validation
from app.store import DATA_DIR
from app.tools import ToolError, run_tool

from .llm import model_config
from .validator import validate

REPLAY_DIR = DATA_DIR.parent / "replays"

PRESETS = {
    "A": "Why did the latest checkout pipeline fail, and should we block the release?",
    "B": "Which tests appear flaky, and how much engineering time might they be costing us?",
    "C": "The CI summary for payments-api 2.14.0 says PASS, but the raw execution data contains failures. Can we ship?",
}
NEXT_ACTION = {
    "BLOCK": "Do not release. Assign the failing gating test to its owning team and rerun after a fix.",
    "HOLD_MANUAL_REVIEW": "Hold the release. A release manager should rerun or inspect the unresolved test, then re-evaluate the gate.",
    "SHIP_WITH_WARNINGS": "Release is policy-eligible. Review the retried tests listed as warnings before promoting.",
    "SHIP": "Release is policy-eligible; no gating issues found.",
}


def _kind(ds: Dataset, rid: str) -> tuple[str, str]:
    if rid in ds.runs:
        r = ds.runs[rid]
        return "run", f"{r.pipeline_id} #{r.run_number} ({r.commit})"
    if rid.startswith("att-"):
        a = next((x for x in ds.attempts if x.attempt_id == rid), None)
        return "attempt", f"{a.test_id} attempt {a.attempt_no}: {a.status or 'NO_RESULT'}" if a else rid
    if rid.startswith("ci:run.summary:"):
        r = ds.runs.get(rid.split(":")[-1])
        return "ci_summary", f"CI summary {r.summary.status_raw if r and r.summary else '?'}"
    if rid.startswith("artifacts:"):
        return "log", "artifact log line"
    if rid.startswith("runner:"):
        return "raw_event", "runner event"
    if rid.startswith("DQ-"):
        f = next((x for x in ds.findings if x.id == rid), None)
        return "finding", f.kind if f else rid
    if rid.startswith("T-"):
        t = ds.test(rid)
        return "test", t["name"] if t else rid
    if rid.startswith("rc-"):
        return "release_candidate", rid
    if rid.startswith("release-policy"):
        return "policy", "release policy"
    return "record", rid


def _evidence(ds: Dataset, ids: list[str]) -> list[EvidenceRef]:
    out, seen = [], set()
    for i in ids:
        if i in seen:
            continue
        seen.add(i)
        kind, label = _kind(ds, i)
        out.append(EvidenceRef(id=i, kind=kind, label=label, exists=ds.record_exists(i)))
    return out[:40]


def _dq_warnings(results: list[dict]) -> list[str]:
    warns = []
    for r in results:
        for f in r.get("data_quality_findings", []) or []:
            warns.append(f"{f['id']} {f['kind']}: {f['detail']}")
        for line in r.get("data_handling", []) or []:
            warns.append(line)
        for log in r.get("logs", []) or []:
            if log.get("possible_prompt_injection"):
                warns.append(f"{log['event_id']}: log line contains instructions aimed at an AI assistant; treated as untrusted data and ignored.")
    return list(dict.fromkeys(warns))[:12]


def _gate_view(gates: dict[str, dict], prefer: str | None = None) -> GateView | None:
    if not gates:
        return None
    g = gates.get(prefer) if prefer else None
    g = g or list(gates.values())[-1]
    return GateView(run_id=g["run_id"], verdict=g["verdict"], deciding_rule=g["deciding_rule"], policy_id=g["policy_id"],
                    rules_version=g["rules_version"], checks=g["checks"])


def _response(rid: str, mode: str, model: str | None, question: str, draft: dict, trace: list[dict], results: list[dict],
              gates: dict, validation: dict, revisions: int, t0: float, ds: Dataset, notice: str | None = None) -> AskResponse:
    gate = _gate_view(gates)
    cited = [e for c in draft.get("claims", []) for e in c.get("evidence", [])]
    gate_ids = [e for c in (gate.checks if gate else []) if c.get("triggered") for e in c.get("evidence", [])]
    assumptions = list(draft.get("assumptions", []))
    for r in results:
        if "assumed" in r:
            assumptions.append(f"Effort model: {r['formula']}. Minutes/investigation {r['assumed']['minutes_per_investigation']}, "
                               f"USD/hour {r['assumed']['loaded_cost_per_engineer_hour_usd']} (illustrative, not measured).")
    return AskResponse(
        request_id=rid, mode=mode, model=model, question=question, answer=draft.get("answer", ""),
        recommendation=(f"{gate.verdict}: {NEXT_ACTION[gate.verdict]}" if gate else draft.get("recommended_next_action")),
        gate=gate, claims=[Claim(**c) for c in draft.get("claims", [])],
        evidence=_evidence(ds, [*cited, *gate_ids]),
        data_quality_warnings=_dq_warnings(results), assumptions=list(dict.fromkeys(assumptions)),
        uncertainty=draft.get("uncertainty", ""), tool_trace=[ToolCall(**t) for t in trace],
        validation=Validation(passed=validation["passed"], checks=validation["checks"], revisions=revisions),
        latency_ms=int((time.perf_counter() - t0) * 1000), notice=notice,
    )


# ---------------- offline deterministic mode ----------------
def _service_in(q: str) -> str | None:
    for key, sid in (("checkout", "checkout-web"), ("payment", "payments-api"), ("inventory", "inventory-svc"), ("support", "support-assistant"), ("assistant", "support-assistant")):
        if key in q:
            return sid
    return None


def offline(ds: Dataset, question: str) -> tuple[dict, list[dict], list[dict], dict]:
    """Keyword planner + templates. Clearly labelled; it demonstrates the tools, not model reasoning."""
    q = question.lower()
    trace, results, gates = [], [], {}

    def call(name: str, args: dict) -> dict:
        t0 = time.perf_counter()
        try:
            out, ok = run_tool(ds, name, args), True
        except ToolError as e:
            out, ok = {"error": e.code, "message": e.message, "evidence": []}, False
        trace.append({"step": len(trace) + 1, "tool": name, "args": args, "ok": ok, "ms": int((time.perf_counter() - t0) * 1000),
                      "summary": out.get("summary") or out.get("message", ""), "evidence": out.get("evidence", [])[:30]})
        results.append(out)
        if name == "evaluate_release_gate" and ok:
            gates[out["run_id"]] = out
        return out

    sid = _service_in(q)
    rc = re.search(r"(\d+\.\d+\.\d+)", q)
    known = {sv["id"] for sv in ds.catalog["services"]}
    named = [w for w in re.findall(r"\b([a-z]+-(?:service|svc|api|web))\b", q) if w not in known]
    if named and not sid:
        draft = {"answer": f"I have no data for **{named[0]}**. Known services: {', '.join(sorted(known))}. I will not guess a run for an unknown service.",
                 "recommended_next_action": "Check the service name, or connect that pipeline's CI source first.", "claims": [], "assumptions": [],
                 "uncertainty": "Unknown entity: nothing to analyse."}
        return draft, trace, results, gates
    write_request = bool(re.search(r"\b(delete|drop|remove|update|insert|truncate|approve|mark)\b", q))
    run_no = re.search(r"\brun\s*#?(\d{2,4})\b", q)
    if any(w in q for w in ("flaky", "flake", "costing", "engineering time", "nondetermin")):
        fl = call("analyze_flaky_tests", {"service_id": sid} if sid else {})
        est = call("estimate_triage_cost", {"service_id": sid} if sid else {})
        lines = [f"- **{t['test_id']}** ({t['name']}): {t['level']}, test retry-passes {t['retry_passes_test']}, infra retry-passes {t['retry_passes_infra']}, final failures {t['final_failures']}" for t in fl["tests"][:6]]
        base = est["scenarios"]["base"]
        answer = ("Flakiness by evidence level (last 30 days):\n" + "\n".join(lines) +
                  f"\n\nIllustrative effort: {est['measured']['investigations']} investigations x {base['minutes_per_investigation']} min = "
                  f"{base['engineer_hours']} engineer-hours (~${base['usd']} at ${base['usd_per_hour']}/h, assumed).")
        claims = [{"text": f"{t['test_id']} is {t['level']}", "evidence": [t["test_id"], *t["evidence"][:2]]} for t in fl["tests"][:5]]
        if write_request:
            dq = call("get_data_quality_report", {"kind": "DUPLICATE_EVENT"})
            answer = ("This agent is **read-only**: it cannot delete or change CI data. Duplicates are already handled without deleting evidence: "
                      + "; ".join(f["detail"] for f in dq["findings"]) + "\n\n" + answer)
            claims = [{"text": "Duplicate events are counted once and kept", "evidence": [f["id"] for f in dq["findings"]]}, *claims]
        draft = {"answer": answer, "recommended_next_action": "Confirm the 'suspected' tests with controlled reruns; route infra_only retries to the platform team.",
                 "claims": claims, "assumptions": [], "uncertainty": "Only 'proven' tests have same-commit evidence; others are signals from history."}
    else:
        explicit = next((r.run_id for r in ds.runs.values() if run_no and r.run_number == int(run_no.group(1)) and (sid is None or r.service_id == sid)), None)
        if explicit:
            target = explicit
        elif rc or "summary" in q or "ship" in q and "payment" in q:
            target = next((r["id"] for r in ds.catalog["release_candidates"] if rc and r["version"] == rc.group(1)), None) or "rc-pay-2.14.0"
        else:
            runs = call("find_pipeline_runs", {"service_id": sid or "checkout-web", "limit": 3})
            target = runs["runs"][0]["run_id"] if runs.get("runs") else "run-chk-main-0418"
        call("get_run_details", {"run_id": target})
        insp = call("inspect_failure_evidence", {"run_id": target})
        g = call("evaluate_release_gate", {"run_id": target})
        checks = [c for c in g.get("checks", []) if c["triggered"]]
        bullets = "\n".join(f"- {c['condition']} (rule {c['rule']}): {c['detail']}" for c in checks) or "- No gate check triggered."
        hyps = [h for t in insp.get("tests", []) for h in t["hypotheses"]]
        answer = (f"**{g['run_id']}: {g['verdict']}** (rule {g['deciding_rule']}, {g['policy_id']}).\n\nObserved:\n{bullets}"
                  + ("\n\nHypotheses (not proven):\n" + "\n".join(f"- {h}" for h in hyps[:3]) if hyps else ""))
        claims = [{"text": c["detail"], "evidence": c["evidence"][:4]} for c in checks] or [{"text": "Gate evaluated", "evidence": [g["run_id"]]}]
        draft = {"answer": answer, "recommended_next_action": NEXT_ACTION[g["verdict"]], "claims": claims, "assumptions": [],
                 "uncertainty": "Root cause is a hypothesis: commit diffs and application logs are not in this dataset."}
    return draft, trace, results, gates


# ---------------- entry point ----------------
def ask(ds: Dataset, question: str, mode: str = "live", scenario: str | None = None) -> AskResponse:
    t0 = time.perf_counter()
    rid = f"req_{uuid.uuid4().hex[:12]}"
    if mode == "replay":
        path = REPLAY_DIR / f"scenario-{(scenario or '').upper()}.json"
        if not path.exists():
            mode = "offline"
        else:
            rec = json.loads(path.read_text(encoding="utf-8"))
            resp = AskResponse.model_validate(rec)
            # Re-check the recorded evidence against today's data so a stale replay cannot pass silently.
            for e in resp.evidence:
                e.exists = ds.record_exists(e.id)
            resp.request_id, resp.mode = rid, "replay"
            resp.notice = f"Replayed trace recorded from a live {rec.get('model')} run (request {rec.get('request_id')}). Evidence re-checked against current data."
            resp.latency_ms = int((time.perf_counter() - t0) * 1000)
            return resp

    cfg = model_config() if mode == "live" else None
    if mode == "live" and cfg is None:
        mode, notice = "offline", "No model credentials configured: answered by the offline deterministic planner."
    else:
        notice = None

    if mode == "live":
        from .graph import run_live

        last_err = None
        for model in [cfg.model, cfg.fallback_model]:
            if not model:
                continue
            try:
                st = run_live(cfg, ds, question, model)
                return _response(rid, "live", model, question, st["draft"], st.get("trace", []), st.get("results", []),
                                 st.get("gates", {}), st["validation"], st.get("revisions", 0), t0, ds,
                                 None if model == cfg.model else f"Primary model failed ({last_err}); answered by fallback {model}.")
            except Exception as e:  # noqa: BLE001 - model/provider errors degrade to the next option
                last_err = f"{type(e).__name__} {getattr(e, 'status', '') or ''}".strip()
        mode, notice = "offline", f"Model unavailable ({last_err}); answered by the offline deterministic planner. Tools and policy are unchanged."

    draft, trace, results, gates = offline(ds, question)
    v = validate(draft["answer"] + " " + draft["recommended_next_action"], draft["claims"], results, ds, {k: g["verdict"] for k, g in gates.items()})
    return _response(rid, "offline", None, question, draft, trace, results, gates, v, 0, t0, ds,
                     notice or "Offline deterministic mode: keyword planner and templates, no language model.")
