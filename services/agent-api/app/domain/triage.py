"""QE triage queue: every test that failed an attempt in the window, with a defect type and a suggested next step.

Suggested action, first match wins:
- propose_quarantine: flake level proven or suspected and the defect is not a System Issue (R3, R4). A proposal with
  an owner and expiry for a person to accept; the agent never writes the quarantine list.
- fix_product (PB), fix_test (AB), platform_ticket (SI), investigate (TI): from the ReportPortal defect type.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from app.etl import Dataset

from .checks import flake_levels
from .evidence import run_outcomes
from .knowledge import quarantine_entry, triage

# Most urgent first: a product bug outranks a flaky test, which outranks a broken test, then platform and unknowns.
SEVERITY = {"fix_product": 0, "propose_quarantine": 1, "fix_test": 2, "investigate": 3, "platform_ticket": 4}
ACTION_FOR_DEFECT = {"PB": "fix_product", "AB": "fix_test", "SI": "platform_ticket", "TI": "investigate"}


def triage_queue(ds: Dataset, lookback_days: int = 30) -> dict:
    as_of = datetime.fromisoformat(ds.catalog["as_of"].replace("Z", "+00:00"))
    since = as_of - timedelta(days=lookback_days)
    levels = flake_levels(ds, lookback_days)
    per_test: dict[str, dict] = {}
    for run in sorted(ds.runs.values(), key=lambda r: (r.queued.iso() or "", r.run_id)):
        if not run.queued.utc or run.queued.utc < since:
            continue
        for o in run_outcomes(ds, run):
            failing = [a for a in o.attempts if a.status in ("FAIL", "ERROR")]
            if not failing:
                continue
            t = per_test.setdefault(o.test_id, {"name": o.name, "suite": o.suite, "service_id": run.service_id, "runs": 0, "last": None, "evidence": []})
            t["runs"] += 1
            last = failing[-1]
            stamp = (last.finished.utc or last.started.utc)
            if stamp and (t["last"] is None or stamp > t["last"][0]):
                t["last"] = (stamp, last)
            t["evidence"].append(last.attempt_id)

    items = []
    as_of_day = date.fromisoformat(ds.catalog["as_of"][:10])
    counts = {"PB": 0, "AB": 0, "SI": 0, "TI": 0}
    for test_id, t in per_test.items():
        latest = t["last"][1] if t["last"] else None
        defect = triage(latest.error_class) if latest else None
        defect = defect or {"code": "TI", "label": "To Investigate"}
        level = levels.get(test_id)
        if level in ("proven", "suspected") and defect["code"] != "SI":
            action = "propose_quarantine"
            rationale = (f"Flake level {level} (R3) with a {defect['label']} signature: propose a time-boxed quarantine "
                         "with an owner (R4); a person accepts it, the agent never writes it.")
        else:
            action = ACTION_FOR_DEFECT[defect["code"]]
            rationale = {
                "fix_product": "Latest failure is a product assertion: route to the owning dev team.",
                "fix_test": "Latest failure is a locator or harness error: route to the test owner.",
                "platform_ticket": "Latest failure is infrastructure or a dependency: platform reliability, not the test (R1).",
                "investigate": "Evidence does not settle the cause: a person decides.",
            }[action]
        counts[defect["code"]] += 1
        items.append({
            "test_id": test_id, "name": t["name"], "service_id": t["service_id"], "suite": t["suite"], "flake_level": level,
            "failures": t["runs"], "last_failure_utc": t["last"][0].isoformat().replace("+00:00", "Z") if t["last"] else None,
            "defect": defect, "suggested_action": action, "rationale": rationale, "evidence": t["evidence"][-6:],
            "quarantine": quarantine_entry(test_id, as_of_day),
        })
    items.sort(key=lambda i: (SEVERITY[i["suggested_action"]], -i["failures"], i["test_id"]))
    return {"lookback_days": lookback_days, "items": items, "counts_by_defect": counts}
