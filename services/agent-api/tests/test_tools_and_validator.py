"""Acceptance 8-10: tool bounds, graceful errors, prompt-injection handling, and the answer validator."""

import pytest

from app.agent.validator import validate
from app.tools import MAX_RUNS, ToolError, run_tool


def test_unknown_run_and_service_fail_gracefully(ds):
    with pytest.raises(ToolError) as e:
        run_tool(ds, "get_run_details", {"run_id": "run-nope-0001"})
    assert e.value.code == "not_found" and "find_pipeline_runs" in e.value.hint
    with pytest.raises(ToolError) as e:
        run_tool(ds, "analyze_flaky_tests", {"service_id": "billing"})
    assert e.value.code == "not_found"


def test_tool_arguments_are_validated_and_bounded(ds):
    with pytest.raises(ToolError) as e:
        run_tool(ds, "find_pipeline_runs", {"limit": 500})
    assert e.value.code == "invalid_arguments"
    with pytest.raises(ToolError):
        run_tool(ds, "analyze_flaky_tests", {"lookback_days": 365})
    with pytest.raises(ToolError):
        run_tool(ds, "drop_table", {})
    out = run_tool(ds, "find_pipeline_runs", {"limit": MAX_RUNS})
    assert out["returned"] <= MAX_RUNS and out["total_matching"] == 120


def test_latest_checkout_run_is_found_first(ds):
    out = run_tool(ds, "find_pipeline_runs", {"service_id": "checkout-web", "pipeline_id": "chk-main", "limit": 2})
    assert out["runs"][0]["run_id"] == "run-chk-main-0418" and out["runs"][0]["gate_verdict"] == "BLOCK"


def test_log_injection_is_flagged_as_untrusted(ds):
    out = run_tool(ds, "get_run_details", {"run_id": "run-chk-main-0418"})
    flagged = [row for row in out["logs"] if row["possible_prompt_injection"]]
    assert len(flagged) == 1 and "ignore all previous instructions" in flagged[0]["untrusted_text"].lower()
    assert "untrusted" in out["logs_note"]


def test_every_tool_evidence_id_resolves(ds):
    calls = [("get_run_details", {"run_id": "rc-pay-2.14.0"}), ("inspect_failure_evidence", {"run_id": "run-chk-main-0418"}),
             ("evaluate_release_gate", {"run_id": "run-pay-main-0232"}), ("analyze_flaky_tests", {}), ("estimate_triage_cost", {}),
             ("get_data_quality_report", {}), ("find_pipeline_runs", {"limit": 10})]
    for name, args in calls:
        for e in run_tool(ds, name, args)["evidence"]:
            assert ds.record_exists(e), (name, e)


def _results(ds):
    return [run_tool(ds, "evaluate_release_gate", {"run_id": "run-pay-main-0233"})]


def test_validator_accepts_grounded_answer(ds):
    r = _results(ds)
    claims = [{"text": "T-PAY-004 attempt 2 never reported", "evidence": ["att-pay-main-0233-T-PAY-004-2"]}]
    v = validate("HOLD_MANUAL_REVIEW under rule R5.", claims, r, ds, {"run-pay-main-0233": "HOLD_MANUAL_REVIEW"})
    assert v["passed"], v


def test_validator_rejects_invented_ids_numbers_and_verdicts(ds):
    r = _results(ds)
    claims = [{"text": "made up", "evidence": ["att-fake-9999"]}, {"text": "no evidence", "evidence": []}]
    v = validate("We can SHIP: 93% of tests passed and it saves 412 hours.", claims, r, ds, {"run-pay-main-0233": "HOLD_MANUAL_REVIEW"})
    failed = {c["name"] for c in v["checks"] if not c["passed"]}
    assert failed == {"evidence_ids_resolve", "claims_have_evidence", "verdict_matches_policy", "numbers_grounded"}
    assert claims[0]["supported"] is False and claims[1]["supported"] is False


def test_offline_mode_answers_all_presets_with_valid_evidence(ds):
    from app.agent.service import PRESETS, ask

    expected = {"A": "BLOCK", "B": None, "C": "HOLD_MANUAL_REVIEW"}
    for key, q in PRESETS.items():
        r = ask(ds, q, "live")  # no credentials in tests: must degrade to offline, labelled
        assert r.mode == "offline" and r.notice
        assert (r.gate.verdict if r.gate else None) == expected[key]
        assert r.validation.passed, r.validation.checks
        assert all(e.exists for e in r.evidence)


def test_validator_ignores_negated_verdict_words_and_accepts_listed_policy_verdicts(ds):
    r = _results(ds)
    claims = [{"text": "T-PAY-004 attempt 2 never reported", "evidence": ["att-pay-main-0233-T-PAY-004-2"]}]
    v = validate("We cannot SHIP today: the gate says HOLD_MANUAL_REVIEW.", claims, r, ds, {"run-pay-main-0233": "HOLD_MANUAL_REVIEW"})
    assert v["passed"], v
    listing = [run_tool(ds, "find_pipeline_runs", {"service_id": "checkout-web", "limit": 1})]
    claims = [{"text": "latest checkout run", "evidence": ["run-chk-main-0418"]}]
    v = validate("The latest checkout run has a BLOCK verdict.", claims, listing, ds, {})
    assert v["passed"], v


def test_failures_carry_a_reportportal_defect_type(ds):
    from app.domain.knowledge import triage
    assert triage("AssertionError") == {"code": "PB", "label": "Product Bug"}
    assert triage("SessionProvisioningTimeout")["code"] == "SI"
    assert triage("NoSuchElement")["code"] == "AB"
    assert triage("SomethingNew")["code"] == "TI"  # unknown classes are never guessed into a bucket
    assert triage(None) is None
    out = run_tool(ds, "get_run_details", {"run_id": "run-chk-main-0418"})
    attempts = [a for t in out["tests_needing_attention"] for a in t["attempts"] if a["error_class"]]
    assert attempts and all(a["triage"]["code"] in {"PB", "AB", "SI", "TI"} for a in attempts)


def test_flaky_output_is_transparent_about_flips_and_sample_size(ds):
    tests = run_tool(ds, "analyze_flaky_tests", {})["tests"]
    assert tests
    for t in tests:
        assert 0.0 <= t["flip_rate"] <= 1.0
        assert t["confidence"] == ("ok" if t["runs_observed"] >= t["min_runs"] else "insufficient_data")
