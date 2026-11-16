"""Audit log: agent answers, human triage decisions, fleet control-plane entries; and /api/integrations."""

import json

import pytest
from fastapi.testclient import TestClient

from app.domain import audit, fleet
from app.main import app

client = TestClient(app)
DECISION = {"test_id": "T-CHK-004", "attempt_id": "att-chk-main-0418-T-CHK-004-2", "suggested_action": "fix_product",
            "chosen_action": "fix_product", "status": "accepted"}


@pytest.fixture(autouse=True)
def fresh():
    audit.reset()
    fleet.reset()
    yield
    audit.reset()
    fleet.reset()


def _feed(**params):
    r = client.get("/api/audit", params=params)
    assert r.status_code == 200
    return r.json()


def test_answer_recorded_after_ask():
    body = client.post("/api/ask", json={"question": "Why did the latest checkout pipeline fail? mail me at qa@kestrel.example",
                                         "mode": "offline"}).json()
    entries = _feed(kind="agent.answer")["entries"]
    assert len(entries) == 1
    d = entries[0]["detail"]
    assert d["request_id"] == body["request_id"] and d["mode"] == "offline" and entries[0]["actor"] == audit.OFFLINE_ACTOR
    assert d["validation_passed"] == body["validation"]["passed"] and d["tool_calls"] == len(body["tool_trace"])
    assert d["verdicts"] == [{"run_id": body["gate"]["run_id"], "verdict": body["gate"]["verdict"], "rule": body["gate"]["deciding_rule"]}]
    assert "@" not in d["question"] and "[redacted-email]" in d["question"]


def test_stream_answer_recorded_and_question_truncated():
    r = client.post("/api/ask/stream", json={"question": "Which tests are flaky? " + "x" * 400, "mode": "replay", "scenario": "B"})
    assert r.status_code == 200
    entries = _feed(kind="agent.answer")["entries"]
    assert len(entries) == 1 and entries[0]["detail"]["mode"] == "replay"
    assert len(entries[0]["detail"]["question"]) <= audit.QUESTION_CHARS


def test_triage_decisions_accepted_and_validated():
    override = {**DECISION, "chosen_action": "fix_test", "status": "overridden", "note": "Selector drift, ping dev@kestrel.example"}
    r = client.post("/api/audit/triage-decisions", json={"decisions": [DECISION, override]})
    assert r.status_code == 200 and r.json()["recorded"] == 2
    rows = _feed(kind="human.triage_decision")["entries"]
    assert [e["detail"]["status"] for e in rows] == ["overridden", "accepted"]
    assert rows[0]["actor"] == "reviewer (sandbox)" and rows[0]["detail"]["note"] == "Selector drift, ping [redacted-email]"

    bad = [
        {"decisions": [{**DECISION, "extra": 1}]},                   # unknown field
        {"decisions": [{**DECISION, "chosen_action": "fix_test"}]},  # accepted but the action changed
        {"decisions": [{**DECISION, "status": "overridden"}]},       # override without a change
        {"decisions": [{**DECISION, "note": "n" * 201}]},            # note too long
        {"decisions": [{**DECISION, "test_id": "DROP TABLE"}]},      # id pattern
        {"decisions": []},
        {"decisions": [DECISION], "actor": "admin"},                 # unknown top-level field
    ]
    for b in bad:
        assert client.post("/api/audit/triage-decisions", json=b).status_code == 422, b
    assert len(_feed(kind="human.triage_decision")["entries"]) == 2


def test_triage_batch_size_cap():
    assert client.post("/api/audit/triage-decisions", json={"decisions": [DECISION] * 100}).status_code == 200
    assert client.post("/api/audit/triage-decisions", json={"decisions": [DECISION] * 101}).status_code == 422


def test_ring_buffer_is_bounded():
    log = audit.log()
    batch = audit.TriageDecisionBatch(decisions=[DECISION] * 100)
    for _ in range(6):
        log.record_decisions(batch)
    assert len(log.entries) == audit.MAX_ENTRIES and log.feed()["counts"]["human.triage_decision"] == audit.MAX_ENTRIES


def test_kind_filter_limit_and_unified_feed():
    client.post("/api/ask", json={"question": "Which tests appear flaky?", "mode": "offline"})
    client.post("/api/audit/triage-decisions", json={"decisions": [DECISION]})
    assert client.post("/api/fleet/con-rp-bridge/pause").status_code == 200
    feed = _feed(limit=200)
    assert {e["kind"] for e in feed["entries"]} == {"agent.answer", "human.triage_decision", "control_plane"}
    assert feed["counts"]["control_plane"] == len(fleet.store().audit)
    ts = [e["ts"] for e in feed["entries"]]
    assert ts == sorted(ts, reverse=True)
    pause = [e for e in feed["entries"] if e["kind"] == "control_plane" and e["detail"]["action"] == "connector.paused"]
    assert pause and pause[0]["actor"] == fleet.OPERATOR
    assert all(e["kind"] == "control_plane" for e in _feed(kind="control_plane")["entries"])
    assert len(_feed(limit=2)["entries"]) == 2
    assert client.get("/api/audit", params={"kind": "nope"}).status_code == 422
    assert client.get("/api/audit", params={"limit": 201}).status_code == 422


def test_recording_failure_does_not_break_ask(monkeypatch):
    def boom(_self, _resp):
        raise RuntimeError("audit store down")

    monkeypatch.setattr(audit.AuditLog, "record_answer", boom)
    r = client.post("/api/ask", json={"question": "Why did the latest checkout pipeline fail?", "mode": "offline"})
    assert r.status_code == 200 and r.json()["answer"]
    s = client.post("/api/ask/stream", json={"question": "Why did the latest checkout pipeline fail?", "mode": "offline"})
    assert s.status_code == 200 and "event: final" in s.text


# ---------- /api/integrations ----------
CANARY_VARS = ("LLM_API_KEY", "GROQ_API_KEY", "LLM_BASE_URL", "AI_GATEWAY_API_KEY")


def test_integrations_reports_state_without_values(monkeypatch):
    values = {}
    for i, name in enumerate(CANARY_VARS):
        values[name] = f"canary{i}" + "q" * 12
        monkeypatch.setenv(name, values[name])
    r = client.get("/api/integrations")
    assert r.status_code == 200
    text = json.dumps(r.json())
    for v in values.values():
        assert v not in text
    body = r.json()
    chain = body["models"]["chain"]
    assert body["models"]["configured"] is True and chain[0]["role"] == "primary"
    assert chain[-1]["model"] == "offline deterministic planner" and chain[-1]["role"] == "last resort"
    assert {p["provider"]: p["configured"] for p in body["models"]["providers"]}["groq"] is True
    status = {i["id"]: i["status"] for i in body["integrations"]}
    assert status["jira"] == status["slack"] == status["reportportal"] == status["github-checks"] == "not_connected"
    assert status["cli-gate"] == "available" and status["github-action"] == "example"
    assert status["mcp"] in ("available", "documented")
    assert body["governance"]["agent_read_only"] is True and body["data_source"]["source"] == "fixtures"


def test_integrations_offline_only(monkeypatch):
    for name in (*CANARY_VARS, "VERCEL_OIDC_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    body = client.get("/api/integrations").json()
    assert body["models"]["configured"] is False
    assert [m["model"] for m in body["models"]["chain"]] == ["offline deterministic planner"]
    assert body["data_source"]["runs"] == 120
