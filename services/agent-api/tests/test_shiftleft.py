"""Shift-left surfaces: release check, commit attribution, QE triage queue, gate CLI and MCP server."""

import asyncio
import importlib.util
import io
import json
import sys
import urllib.error
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
CLI = Path(__file__).resolve().parents[1] / "scripts" / "testops_gate.py"


def test_scenario_c_check_needs_action_on_incomplete_test():
    c = client.get("/api/checks/rc-pay-2.14.0").json()
    assert c["run_id"] == "run-pay-main-0233"
    assert (c["verdict"], c["conclusion"], c["deciding_rule"]) == ("HOLD_MANUAL_REVIEW", "action_required", "R5")
    f = {x["test_id"]: x for x in c["failures"]}
    assert f["T-PAY-004"]["state"] == "incomplete"
    assert c["counts"]["incomplete"] == 1
    md = c["summary_markdown"]
    assert "HOLD_MANUAL_REVIEW" in md and "att-pay-main-0233-T-PAY-004-2" in md and "not from a language model" in md
    assert c["rules_version"] in md


def test_scenario_a_check_fails_with_product_bug():
    c = client.get("/api/checks/run-chk-main-0418").json()
    assert (c["verdict"], c["conclusion"]) == ("BLOCK", "failure")
    f = {x["test_id"]: x for x in c["failures"]}
    assert f["T-CHK-004"]["state"] == "fail" and f["T-CHK-004"]["defect"]["code"] == "PB"
    assert f["T-CHK-011"]["state"] == "retry_pass_infra"  # infra retry is listed, never counted against the test
    assert client.get("/api/checks/run-nope-0001").status_code == 404


def test_commit_attribution_separates_the_change_from_infrastructure():
    # Verified in the data: run-chk-main-0417 (previous chk-main run) passed T-CHK-004 on its first attempt.
    a = client.get("/api/commits/9f3c2e1").json()
    by_test = {x["test_id"]: x for x in a["assessment"]}
    assert by_test["T-CHK-004"]["attribution"] == "likely_this_change"
    assert "att-pay" not in "".join(by_test["T-CHK-004"]["evidence"])
    assert any(e.startswith("att-chk-main-0417-T-CHK-004") for e in by_test["T-CHK-004"]["evidence"])
    assert by_test["T-CHK-011"]["attribution"] == "infrastructure"
    assert a["summary"] == {"likely_this_change": 1, "known_flaky": 0, "infrastructure": 1, "unknown": 0}
    assert [r["verdict"] for r in a["runs"]] == ["BLOCK"]
    assert client.get("/api/commits/9f3c").status_code == 404  # prefix shorter than 7
    assert client.get("/api/commits/0000000").status_code == 404


def test_commit_list_is_newest_first_and_bounded():
    rows = client.get("/api/commits", params={"limit": 5}).json()
    assert len(rows) == 5
    times = [r["latest_queued_utc"] for r in rows]
    assert times == sorted(times, reverse=True)
    assert client.get("/api/commits", params={"limit": 51}).status_code == 422


def test_triage_queue_counts_and_actions():
    t = client.get("/api/triage").json()
    assert sum(t["counts_by_defect"].values()) == len(t["items"]) > 0
    actions = {i["test_id"]: i["suggested_action"] for i in t["items"]}
    assert actions["T-CHK-011"] == "platform_ticket"  # infra only (R1)
    assert actions["T-INV-005"] == "propose_quarantine"  # proven flaky (R3, R4)
    assert actions["T-CHK-004"] == "fix_product"
    sev = ["fix_product", "propose_quarantine", "fix_test", "investigate", "platform_ticket"]
    assert [sev.index(i["suggested_action"]) for i in t["items"]] == sorted(sev.index(i["suggested_action"]) for i in t["items"])
    assert client.get("/api/triage", params={"lookback_days": 31}).status_code == 422


def _load_cli():
    spec = importlib.util.spec_from_file_location("testops_gate", CLI)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.mark.parametrize(("run", "code"), [("rc-pay-2.14.0", 2), ("run-chk-main-0418", 1), ("rc-pay-2.13.4", 0)])
def test_gate_cli_exit_codes(monkeypatch, capsys, run, code):
    cli = _load_cli()

    def fake_urlopen(req, timeout=0):
        path = req.full_url.split("://", 1)[1].split("/", 1)[1]
        r = client.get("/" + path)
        if r.status_code != 200:
            raise urllib.error.HTTPError(req.full_url, r.status_code, "err", {}, None)
        return _Resp(r.content)

    monkeypatch.setattr(cli.urllib.request, "urlopen", fake_urlopen)
    assert cli.main(["--run", run, "--api", "http://testserver"]) == code
    assert cli.main(["--run", "run-nope-0001", "--api", "http://testserver"]) == 3
    assert cli.main(["--run", run, "--api", "http://testserver", "--format", "json"]) == code
    out = capsys.readouterr().out
    assert json.loads(out[out.rindex("\n{") + 1:])["run_id"]


def test_mcp_server_exposes_read_only_tools():
    pytest.importorskip("mcp")
    from app.mcp_server import server

    async def go():
        tools = await server.list_tools()
        res = await server.call_tool("release_check", {"run_id": "rc-pay-2.14.0"})
        return tools, res

    tools, res = asyncio.run(go())
    assert {t.name for t in tools} == {
        "find_pipeline_runs", "get_run_details", "inspect_failure_evidence", "evaluate_release_gate", "analyze_flaky_tests",
        "estimate_triage_cost", "get_data_quality_report", "get_record", "release_check",
    }
    assert all(t.annotations and t.annotations.read_only_hint and not t.annotations.destructive_hint for t in tools)
    assert json.loads(res.content[0].text)["conclusion"] == "action_required"
    assert sys.modules["app.mcp_server"]
