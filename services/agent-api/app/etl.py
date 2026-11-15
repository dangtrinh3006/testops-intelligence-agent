"""Raw event log -> normalised records, with provenance and data-quality findings.

Raw events are never modified. Every normalised record keeps the raw value it came from and the
event/ingest ids that produced it, so any number in an answer can be traced back to source.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATUS_MAP = {
    "pass": "PASS", "passed": "PASS", "success": "PASS",
    "fail": "FAIL", "failed": "FAIL", "failure": "FAIL",
    "error": "ERROR",
}
EPOCH_MS_THRESHOLD = 10**12


@dataclass(frozen=True)
class Stamp:
    raw: Any
    utc: datetime | None
    fmt: str  # iso-offset | iso-z | epoch-s | epoch-ms | naive-assumed-utc | missing | unparseable

    def iso(self) -> str | None:
        return self.utc.isoformat().replace("+00:00", "Z") if self.utc else None


def parse_ts(value: Any) -> Stamp:
    """Normalise a source timestamp to UTC without guessing silently: the format used is recorded."""
    if value is None or value == "":
        return Stamp(value, None, "missing")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value >= EPOCH_MS_THRESHOLD:
            return Stamp(value, datetime.fromtimestamp(value / 1000, tz=timezone.utc), "epoch-ms")
        return Stamp(value, datetime.fromtimestamp(value, tz=timezone.utc), "epoch-s")
    if isinstance(value, str):
        s = value.strip()
        try:
            if s.endswith("Z"):
                return Stamp(value, datetime.fromisoformat(s[:-1] + "+00:00"), "iso-z")
            dt = datetime.fromisoformat(s)
        except ValueError:
            return Stamp(value, None, "unparseable")
        if dt.tzinfo is None:
            # Source contract (artifact store): naive times are UTC. Recorded as an assumption, not a fact.
            return Stamp(value, dt.replace(tzinfo=timezone.utc), "naive-assumed-utc")
        return Stamp(value, dt.astimezone(timezone.utc), "iso-offset")
    return Stamp(value, None, "unparseable")


def norm_status(raw: Any) -> str | None:
    if raw is None:
        return None
    return STATUS_MAP.get(str(raw).strip().lower(), "UNKNOWN")


@dataclass
class Summary:
    run_id: str
    status: str | None
    status_raw: Any
    started: Stamp
    finished: Stamp
    event_id: str
    ingest_id: int
    received_at: str


@dataclass
class Run:
    run_id: str
    pipeline_id: str
    service_id: str
    run_number: int
    commit: str
    branch: str
    trigger: str
    queued: Stamp
    event_id: str
    summary: Summary | None = None


@dataclass
class Attempt:
    attempt_id: str
    run_id: str
    test_id: str
    attempt_no: int
    status: str | None  # None: started but never reported a result
    started: Stamp
    finished: Stamp
    environment: str | None
    worker: str | None
    error_class: str | None
    message: str | None
    started_event_id: str | None
    result_event_id: str | None
    result_ingest_ids: list[int] = field(default_factory=list)

    @property
    def terminal(self) -> bool:
        return self.status is not None

    @property
    def duration_s(self) -> float | None:
        if self.started.utc is None or self.finished.utc is None:
            return None  # never imputed
        return (self.finished.utc - self.started.utc).total_seconds()


@dataclass
class LogLine:
    event_id: str
    run_id: str
    attempt_id: str | None
    ts: Stamp
    level: str
    message: str


@dataclass
class Finding:
    id: str
    kind: str
    severity: str  # info | warning | critical
    detail: str
    record_ids: list[str]
    count: int = 1


@dataclass
class Dataset:
    catalog: dict
    runs: dict[str, Run]
    attempts: list[Attempt]
    logs: list[LogLine]
    findings: list[Finding]
    raw_event_count: int
    unique_event_count: int

    # --- convenience lookups ---
    def test(self, test_id: str) -> dict | None:
        return next((t for t in self.catalog["tests"] if t["id"] == test_id), None)

    def pipeline(self, pipeline_id: str) -> dict | None:
        return next((p for p in self.catalog["pipelines"] if p["id"] == pipeline_id), None)

    def attempts_of(self, run_id: str) -> list[Attempt]:
        return [a for a in self.attempts if a.run_id == run_id]

    def record_exists(self, rid: str) -> bool:
        return (
            rid in self.runs
            or any(a.attempt_id == rid for a in self.attempts)
            or any(r.summary and r.summary.event_id == rid for r in self.runs.values())
            or any(line.event_id == rid for line in self.logs)
            or any(f.id == rid for f in self.findings)
            or any(t["id"] == rid for t in self.catalog["tests"])
            or rid == self.catalog["release_policy"]["id"]
            or any(rc["id"] == rid for rc in self.catalog["release_candidates"])
        )


def load_raw(data_dir: Path) -> tuple[dict, list[dict]]:
    catalog = json.loads((data_dir / "catalog.json").read_text(encoding="utf-8"))
    with (data_dir / "raw_events.jsonl").open(encoding="utf-8") as f:
        events = [json.loads(line) for line in f if line.strip()]
    return catalog, events


def build(catalog: dict, events: list[dict]) -> Dataset:
    findings: list[Finding] = []
    pipelines = {p["id"]: p for p in catalog["pipelines"]}

    # 1. Deduplicate by source event identity; keep the first ingest, record the rest.
    first: dict[str, dict] = {}
    dup_ingests: dict[str, list[int]] = defaultdict(list)
    for e in sorted(events, key=lambda x: x["ingest_id"]):
        if e["event_id"] in first:
            dup_ingests[e["event_id"]].append(e["ingest_id"])
        else:
            first[e["event_id"]] = e
    for eid, extra in sorted(dup_ingests.items()):
        findings.append(Finding(
            f"DQ-DUP-{len(findings) + 1:03d}", "DUPLICATE_EVENT", "warning",
            f"Event {eid} ingested {1 + len(extra)} times (ingest ids {[first[eid]['ingest_id'], *extra]}); counted once, all copies kept in raw log.",
            [eid], 1 + len(extra),
        ))

    runs: dict[str, Run] = {}
    attempts: dict[str, Attempt] = {}
    logs: list[LogLine] = []
    vocab: dict[str, set[str]] = defaultdict(set)
    naive_samples: list[str] = []
    fmt_counts: dict[str, int] = defaultdict(int)

    def stamp(v: Any) -> Stamp:
        s = parse_ts(v)
        fmt_counts[s.fmt] += 1
        return s

    for e in sorted(first.values(), key=lambda x: x["ingest_id"]):
        p, et = e["payload"], e["event_type"]
        if et == "run.created":
            runs[p["run_id"]] = Run(
                p["run_id"], p["pipeline_id"], pipelines[p["pipeline_id"]]["service_id"], p["run_number"],
                p["commit"], p["branch"], p["trigger"], stamp(p["queued_at"]), e["event_id"],
            )
        elif et == "run.summary":
            vocab[p["run_id"].split("-")[1] + "-" + p["run_id"].split("-")[2]].add(str(p["status"]))
            summary = Summary(p["run_id"], norm_status(p["status"]), p["status"], stamp(p["started"]), stamp(p["finished"]), e["event_id"], e["ingest_id"], e["received_at"])
            if p["run_id"] in runs:
                runs[p["run_id"]].summary = summary
        elif et == "attempt.started":
            a = attempts.get(p["attempt_id"])
            if a is None:
                attempts[p["attempt_id"]] = Attempt(p["attempt_id"], p["run_id"], p["test_id"], p["attempt"], None, stamp(p["started_at"]), Stamp(None, None, "missing"), None, None, None, None, e["event_id"], None)
            else:
                a.started_event_id = e["event_id"]
        elif et == "attempt.result":
            a = attempts.get(p["attempt_id"])
            if a is None:
                a = Attempt(p["attempt_id"], p["run_id"], p["test_id"], p["attempt"], None, stamp(p["started_at"]), Stamp(None, None, "missing"), None, None, None, None, None, None)
                attempts[p["attempt_id"]] = a
            a.status = norm_status(p["status"])
            a.started = stamp(p["started_at"])
            a.finished = stamp(p.get("finished_at"))
            a.environment, a.worker = p.get("environment"), p.get("worker")
            a.error_class, a.message = p.get("error_class"), p.get("message")
            a.result_event_id = e["event_id"]
            a.result_ingest_ids = [e["ingest_id"], *dup_ingests.get(e["event_id"], [])]
        elif et == "log.line":
            ts = stamp(p["ts"])
            if ts.fmt == "naive-assumed-utc" and len(naive_samples) < 5:
                naive_samples.append(e["event_id"])
            logs.append(LogLine(e["event_id"], p["run_id"], p.get("attempt_id"), ts, p.get("level", "INFO"), p["message"]))

    # 2. Record-level findings.
    for a in sorted(attempts.values(), key=lambda x: x.attempt_id):
        if a.status is None:
            findings.append(Finding(f"DQ-INC-{len(findings) + 1:03d}", "INCOMPLETE_ATTEMPT", "critical",
                                    f"{a.attempt_id} started at {a.started.iso()} but never reported a result; final status unknown.", [a.attempt_id]))
        elif a.finished.utc is None:
            findings.append(Finding(f"DQ-MIS-{len(findings) + 1:03d}", "MISSING_FINISHED_AT", "warning",
                                    f"{a.attempt_id} reported {a.status} without finished_at; duration left unknown (not imputed).", [a.attempt_id]))
    for r in sorted(runs.values(), key=lambda x: x.run_id):
        if r.summary is None:
            findings.append(Finding(f"DQ-SUM-{len(findings) + 1:03d}", "MISSING_CI_SUMMARY", "warning",
                                    f"{r.run_id} has no CI summary event; release gate cannot cross-check it.", [r.run_id]))
    for key, values in sorted(vocab.items()):
        if any(v != v.upper() or v not in ("PASS", "FAIL") for v in values):
            findings.append(Finding(f"DQ-VOC-{len(findings) + 1:03d}", "STATUS_VOCABULARY", "info",
                                    f"Pipeline {key} reports summary status as {sorted(values)}; normalised to PASS/FAIL.", [key]))
    if fmt_counts.get("naive-assumed-utc"):
        findings.append(Finding(f"DQ-TZ-{len(findings) + 1:03d}", "NAIVE_TIMESTAMP", "info",
                                f"{fmt_counts['naive-assumed-utc']} artifact-store timestamps have no offset; treated as UTC per source contract (assumption).",
                                naive_samples, fmt_counts["naive-assumed-utc"]))
    mixed = {k: v for k, v in fmt_counts.items() if k not in ("missing",)}
    findings.append(Finding(f"DQ-FMT-{len(findings) + 1:03d}", "MIXED_TIMESTAMP_FORMATS", "info",
                            "Timestamp formats seen and normalised to UTC: " + ", ".join(f"{k}={v}" for k, v in sorted(mixed.items())),
                            [], sum(mixed.values())))

    return Dataset(
        catalog=catalog,
        runs=runs,
        attempts=sorted(attempts.values(), key=lambda a: (a.run_id, a.test_id, a.attempt_no)),
        logs=logs,
        findings=findings,
        raw_event_count=len(events),
        unique_event_count=len(first),
    )


def attempt_dict(a: Attempt) -> dict:
    d = asdict(a)
    for k in ("started", "finished"):
        s = getattr(a, k)
        d[k] = {"raw": s.raw, "utc": s.iso(), "format": s.fmt}
    d["duration_s"] = a.duration_s
    return d
