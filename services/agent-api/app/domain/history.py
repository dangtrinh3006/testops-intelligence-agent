"""Test x run outcome matrix for one service: the history view behind flake and gate decisions."""

from __future__ import annotations

from app.etl import Dataset

from . import gate
from .evidence import run_outcomes
from .knowledge import NON_TEST_CATEGORIES, category, triage

MAX_RUNS = 60


def _cell(o) -> dict:
    last = o.attempts[-1]
    if o.final_status == "INCOMPLETE":
        state = "incomplete"
    elif o.resolution == "passed_first":
        state = "pass"
    elif o.resolution == "passed_on_retry":
        state = "retry_pass_infra" if set(o.failure_categories) <= NON_TEST_CATEGORIES else "retry_pass"
    else:
        state = "fail_infra" if category(last.error_class) in NON_TEST_CATEGORIES else "fail"
    failing = next((a for a in reversed(o.attempts) if a.status in ("FAIL", "ERROR")), None)
    return {
        "state": state,
        "attempts": len(o.attempts),
        "attempt_id": last.attempt_id,
        "error_class": failing.error_class if failing else None,
        "triage": triage(failing.error_class) if failing else None,
    }


def test_history(ds: Dataset, service_id: str, limit: int = 40) -> dict:
    """Most recent `limit` runs of a service, oldest first; every cell is derived from raw attempts (R2), never the CI summary."""
    limit = max(1, min(limit, MAX_RUNS))
    runs = sorted((r for r in ds.runs.values() if r.service_id == service_id), key=lambda r: (r.queued.iso() or "", r.run_id))[-limit:]
    tests = sorted((t for t in ds.catalog["tests"] if t["service_id"] == service_id), key=lambda t: (t["suite"] != "critical", t["id"]))
    cells: dict[str, list[dict | None]] = {t["id"]: [None] * len(runs) for t in tests}
    columns = []
    for i, run in enumerate(runs):
        for o in run_outcomes(ds, run):
            if o.test_id in cells:
                cells[o.test_id][i] = _cell(o)
        g = gate.evaluate(ds, run.run_id)
        columns.append({
            "run_id": run.run_id, "run_number": run.run_number, "pipeline_id": run.pipeline_id, "commit": run.commit,
            "branch": run.branch, "queued_utc": run.queued.iso(),
            "summary_status": run.summary.status if run.summary else None,
            "verdict": g.verdict, "deciding_rule": g.deciding_rule,
        })
    return {
        "service_id": service_id,
        "services": [s["id"] for s in ds.catalog["services"]],
        "runs": columns,
        "tests": [{"test_id": t["id"], "name": t["name"], "suite": t["suite"], "kind": t.get("kind")} for t in tests],
        "cells": cells,
        "states": {
            "pass": "passed on the first attempt",
            "retry_pass": "failed, then passed on retry (test signal, R3)",
            "retry_pass_infra": "failed on infrastructure, then passed (platform signal, R1)",
            "fail": "failed on the final attempt",
            "fail_infra": "final attempt failed on infrastructure (R1)",
            "incomplete": "last attempt never reported a result (R2, R6)",
        },
    }
