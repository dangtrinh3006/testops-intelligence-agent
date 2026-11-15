"""Acceptance 4-8 and 11: golden expectations for the three demo questions (no model involved)."""

import pytest

from app.domain import flaky, gate
from app.tools import CostArgs, RunArgs, estimate_triage_cost, evaluate_release_gate


# ---- Scenario A: latest checkout run ----
def test_scenario_a_blocks_on_unresolved_product_failure(ds):
    g = gate.evaluate(ds, "run-chk-main-0418")
    assert (g.verdict, g.deciding_rule) == ("BLOCK", "R2")
    unresolved = next(c for c in g.checks if c.condition == "unresolved_failure")
    assert unresolved.evidence == ["att-chk-main-0418-T-CHK-004-1", "att-chk-main-0418-T-CHK-004-2"]
    # The infra retry is a warning, not a second blocker.
    retry = next(c for c in g.checks if c.condition == "retry_pass_in_gating")
    assert retry.triggered and "INFRA" in retry.detail
    # Expired quarantine puts T-CHK-011 back in the gate.
    assert g.quarantined[0]["test_id"] == "T-CHK-011" and g.quarantined[0]["active"] is False


def test_previous_checkout_run_was_clean(ds):
    assert gate.evaluate(ds, "run-chk-main-0417").verdict == "SHIP"


# ---- Scenario C: CI says PASS, raw data disagrees ----
def test_scenario_c_holds_when_summary_conflicts_with_unresolved_attempt(ds):
    g = gate.evaluate(ds, "run-pay-main-0233")
    assert (g.verdict, g.deciding_rule) == ("HOLD_MANUAL_REVIEW", "R5")
    assert g.summary_status == "PASS"
    triggered = {c.condition for c in g.checks if c.triggered}
    assert triggered == {"incomplete_gating_test", "summary_conflict"}
    conflict = next(c for c in g.checks if c.condition == "summary_conflict")
    assert "ci:run.summary:run-pay-main-0233" in conflict.evidence
    assert "att-pay-main-0233-T-PAY-004-2" in conflict.evidence


def test_scenario_c_twin_resolved_retry_does_not_force_hold(ds):
    """Same test, same pipeline, previous commit: intermediate failure resolved by a terminal retry."""
    g = gate.evaluate(ds, "run-pay-main-0232")
    assert g.verdict == "SHIP_WITH_WARNINGS"
    assert not any(c.triggered for c in g.checks if c.condition in ("summary_conflict", "incomplete_gating_test", "unresolved_failure"))


def test_release_candidate_ids_resolve_to_runs(ds):
    out = evaluate_release_gate(ds, RunArgs(run_id="rc-pay-2.14.0"))
    assert out["run_id"] == "run-pay-main-0233" and out["verdict"] == "HOLD_MANUAL_REVIEW"


def test_missing_summary_holds(ds):
    g = gate.evaluate(ds, "run-inv-main-0144")
    assert (g.verdict, g.deciding_rule) == ("HOLD_MANUAL_REVIEW", "R6")


# ---- Scenario B: flaky tests and effort ----
@pytest.fixture(scope="module")
def flaky_report(ds):
    return {t.test_id: t for t in flaky.analyze(ds)["tests"]}


def test_scenario_b_levels(flaky_report):
    levels = {k: v.level for k, v in flaky_report.items()}
    assert levels == {
        "T-INV-005": "proven",  # same commit b5e3f16 has final PASS and final FAIL
        "T-SUP-003": "suspected",
        "T-CHK-006": "suspected",
        "T-CHK-004": "consistent_failure",
        "T-CHK-011": "infra_only",
        "T-PAY-004": "infra_only",
    }


def test_retry_pass_is_a_signal_not_a_verdict(flaky_report):
    t = flaky_report["T-CHK-006"]
    assert t.retry_passes_test == 2 and t.final_failures == 0 and t.mixed_outcome_commits == []
    assert t.level == "suspected"  # never "proven" without same-commit evidence


def test_infra_retries_do_not_count_as_flakiness_and_duplicates_count_once(flaky_report):
    t = flaky_report["T-CHK-011"]
    assert (t.retry_passes_test, t.retry_passes_infra) == (0, 7)  # 9 raw result events, 2 are duplicates


def test_incomplete_runs_are_excluded_not_guessed(flaky_report):
    assert flaky_report["T-PAY-004"].incomplete_runs_excluded == 1


def test_effort_estimate_is_deterministic_and_shows_assumptions(ds):
    a = estimate_triage_cost(ds, CostArgs())
    b = estimate_triage_cost(ds, CostArgs())
    assert a == b
    assert a["measured"]["investigations"] == 25
    assert a["scenarios"]["base"] == {"minutes_per_investigation": 20, "usd_per_hour": 60, "engineer_hours": 8.3, "usd": 500}
    assert "not measured" in a["caveat"] and "x" in a["formula"]
    custom = estimate_triage_cost(ds, CostArgs(minutes_per_investigation=30, usd_per_hour=100))
    assert custom["scenarios"]["base"]["engineer_hours"] == 12.5 and custom["scenarios"]["base"]["usd"] == 1250


def test_every_gate_evidence_id_points_to_a_real_record(ds):
    for rid in ds.runs:
        for c in gate.evaluate(ds, rid).checks:
            for e in c.evidence:
                assert ds.record_exists(e), (rid, c.condition, e)
