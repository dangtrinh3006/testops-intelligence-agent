"""Deterministic release gate. The model can request it and explain it, but never sets the verdict."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.etl import Dataset

from .evidence import TestOutcome, run_outcomes
from .knowledge import knowledge, quarantine_entry

VERDICTS = ("SHIP", "SHIP_WITH_WARNINGS", "HOLD_MANUAL_REVIEW", "BLOCK")
# CI config: scored LLM evals are allow_failure, so the CI summary does not cover them.
ALLOW_FAILURE_SUITES = {"eval"}


@dataclass
class Check:
    condition: str
    triggered: bool
    rule: str
    detail: str
    evidence: list[str] = field(default_factory=list)


@dataclass
class GateResult:
    run_id: str
    policy_id: str
    rules_version: str
    verdict: str
    deciding_rule: str
    checks: list[Check]
    outcomes: list[TestOutcome]
    summary_status: str | None
    summary_event_id: str | None
    quarantined: list[dict]


def _ids(outcomes: list[TestOutcome]) -> list[str]:
    return [a.attempt_id for o in outcomes for a in o.attempts]


def evaluate(ds: Dataset, run_id: str) -> GateResult:
    run = ds.runs[run_id]
    k = knowledge()
    gate = k["release_gate"]
    as_of = date.fromisoformat(ds.catalog["as_of"][:10])

    outcomes = run_outcomes(ds, run)
    quarantined, gating = [], []
    for o in outcomes:
        q = quarantine_entry(o.test_id, as_of)
        if q and q["active"]:
            quarantined.append({"test_id": o.test_id, **q})
            continue
        if q and not q["active"]:
            quarantined.append({"test_id": o.test_id, **q, "note": "expired: test is back in the gate"})
        if o.suite in gate["gating_suites"]:
            gating.append(o)

    unresolved = [o for o in gating if o.final_status == "FAIL"]
    incomplete = [o for o in gating if o.final_status == "INCOMPLETE"]
    retried = [o for o in gating if o.resolution == "passed_on_retry"]
    summary = run.summary
    # The CI summary claims to cover every non-allow-failure suite; compare against that same scope.
    covered = [o for o in outcomes if o.suite not in ALLOW_FAILURE_SUITES]
    covered_ok = all(o.final_status == "PASS" for o in covered)
    conflict_detail, conflict_evidence = "", []
    if summary and summary.status == "PASS" and not covered_ok:
        bad = [o for o in covered if o.final_status != "PASS"]
        conflict_detail = (
            f"CI summary {summary.event_id} says PASS (raw '{summary.status_raw}'), but "
            + ", ".join(f"{o.test_id} final={o.final_status} ({o.final_attempt_id})" for o in bad)
        )
        conflict_evidence = [summary.event_id, *_ids(bad)]
    elif summary and summary.status == "FAIL" and covered_ok:
        conflict_detail = f"CI summary {summary.event_id} says FAIL, but every covered test's final attempt passed."
        conflict_evidence = [summary.event_id]

    checks = [
        Check("unresolved_failure", bool(unresolved), "R2",
              "; ".join(f"{o.test_id} failed on all {len(o.attempts)} attempt(s), final {o.final_attempt_id}" for o in unresolved) or "No gating test has a failing final attempt.",
              _ids(unresolved)),
        Check("incomplete_gating_test", bool(incomplete), "R5",
              "; ".join(f"{o.test_id}: attempt {o.attempts[-1].attempt_no} ({o.final_attempt_id}) started but never reported a result" for o in incomplete) or "Every gating test has a terminal attempt.",
              _ids(incomplete)),
        Check("summary_conflict", bool(conflict_detail), "R5", conflict_detail or "CI summary agrees with final attempt results.", conflict_evidence),
        Check("missing_ci_summary", summary is None, "R6",
              "No CI summary event for this run." if summary is None else f"CI summary present ({summary.event_id}).",
              [run_id] if summary is None else [summary.event_id]),
        Check("retry_pass_in_gating", bool(retried), "R2",
              "; ".join(f"{o.test_id} failed then passed on attempt {o.attempts[-1].attempt_no} ({', '.join(o.failure_categories) or 'uncategorised'})" for o in retried) or "No retries were needed.",
              _ids(retried)),
    ]
    verdict, deciding = "SHIP", "R2"
    triggered = {c.condition for c in checks if c.triggered}
    for step in gate["precedence"]:
        if step["when"] == "otherwise" or step["when"] in triggered:
            verdict, deciding = step["verdict"], step["rule"]
            break

    return GateResult(
        run_id=run_id, policy_id=gate["policy_id"], rules_version=k["version"], verdict=verdict, deciding_rule=deciding,
        checks=checks, outcomes=outcomes, summary_status=summary.status if summary else None,
        summary_event_id=summary.event_id if summary else None, quarantined=quarantined,
    )
