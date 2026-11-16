"""Fleet control plane: enrolment, heartbeat status, kill switches, ingest validation and audit."""

import pytest
from fastapi.testclient import TestClient

from app.domain import fleet
from app.main import app

client = TestClient(app)
CODE = fleet.SANDBOX_ENROL_CODE
EVENT = {"run_id": "run-x-1", "service_id": "checkout-web", "test_id": "T-CHK-001", "status": "FAIL", "attempt": 1,
         "error_class": "AssertionError", "message": "expected 200", "ts": "2026-11-17T08:00:00Z"}


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0

    def __call__(self):
        return self.t


@pytest.fixture(autouse=True)
def clock():
    c = Clock()
    fleet.reset(c)
    yield c
    fleet.reset()


def _enrol(name="acme-ci-test", version=fleet.TARGET_VERSION):
    r = client.post("/api/fleet/enrol", json={"code": CODE, "name": name, "adapters": ["junit-xml"], "version": version,
                                              "host": {"os": "linux", "arch": "amd64"}})
    assert r.status_code == 200, r.text
    return r.json()


def _hdr(cred):
    return {"authorization": f"Bearer {cred}"}


def _conn(cid):
    return next(c for c in client.get("/api/fleet").json()["connectors"] if c["id"] == cid)


def test_seeded_statuses_and_version_states():
    body = client.get("/api/fleet").json()
    rows = {c["name"]: c for c in body["connectors"]}
    assert {n: c["status"] for n, c in rows.items()} == {
        "kestrel-ci-eu-1": "connected", "kestrel-jenkins-dc2": "stale", "kestrel-rp-bridge": "connected", "kestrel-legacy-qa": "lost"}
    assert {n: c["version_state"] for n, c in rows.items()} == {
        "kestrel-ci-eu-1": "current", "kestrel-jenkins-dc2": "behind", "kestrel-rp-bridge": "current", "kestrel-legacy-qa": "unsupported"}
    assert all(c["sandbox"] for c in rows.values()) and body["policy"]["read_only"] is True
    assert body["workspace"]["kill_switch"] is False and body["policy"]["lost_after_s"] == 240


def test_status_thresholds_and_version_state():
    assert [fleet.status_for_age(a) for a in (0, 89, 90, 239, 240)] == ["connected", "connected", "stale", "stale", "lost"]
    assert fleet.version_state("1.4.2") == "current" and fleet.version_state("1.10.0") == "current"
    assert fleet.version_state("1.2.0") == "behind" and fleet.version_state("1.1.9") == "unsupported"


def test_enrol_rejects_bad_code_and_bad_input():
    r = client.post("/api/fleet/enrol", json={"code": "wrong-code", "name": "acme-ci", "adapters": ["jenkins"]})
    assert r.status_code == 403 and r.json()["detail"]["error"] == "invalid_enrolment_code"
    assert client.post("/api/fleet/enrol", json={"code": CODE, "name": "acme-ci", "adapters": ["svn"]}).status_code == 422
    assert client.post("/api/fleet/enrol", json={"code": CODE, "name": "Bad Name!", "adapters": ["jenkins"]}).status_code == 422


def test_enrol_heartbeat_ingest_happy_path(clock):
    e = _enrol(version="1.3.1")
    assert e["credential"].startswith("tcon_") and e["version_state"] == "behind"
    clock.t += 200
    assert _conn(e["connector_id"])["status"] == "stale"
    hb = client.post(f"/api/fleet/{e['connector_id']}/heartbeat", json={"version": "1.4.2"}, headers=_hdr(e["credential"]))
    assert hb.status_code == 200 and hb.json()["paused"] is False and hb.json()["policy"]["read_only"] is True
    row = _conn(e["connector_id"])
    assert row["status"] == "connected" and row["version_state"] == "current" and row["sandbox"] is False

    batch = [EVENT, {**EVENT, "status": "PASS", "message": "ping ops.lead@kestrel.example now"}, {**EVENT, "stack_trace": "x"},
             {**EVENT, "status": "BROKEN"}]
    r = client.post("/api/ingest/events", json=batch, headers=_hdr(e["credential"])).json()
    assert r["accepted"] == 2 and r["rejected"] == 2 and r["redacted"] == 1
    assert any("stack_trace: field not in schema" in x for x in r["reasons"])
    assert _conn(e["connector_id"])["events_ingested_24h"] == 2
    stored = fleet.store().events
    assert len(stored) == 2 and "@" not in stored[-1]["message"] and "[redacted-email]" in stored[-1]["message"]
    assert e["credential"] not in str(list(fleet.store().audit))


def test_credential_required_and_bound_to_connector():
    a, b = _enrol("acme-a"), _enrol("acme-b")
    assert client.post("/api/ingest/events", json=[EVENT]).status_code == 401
    assert client.post("/api/ingest/events", json=[EVENT], headers=_hdr("not-a-real-one")).status_code == 401
    assert client.post(f"/api/fleet/{a['connector_id']}/heartbeat", headers=_hdr(b["credential"])).status_code == 401
    assert client.post(f"/api/fleet/{a['connector_id']}/heartbeat").status_code == 401
    assert client.post("/api/fleet/con-nope/heartbeat", headers=_hdr(a["credential"])).status_code == 404


def test_paused_connector_and_workspace_kill_switch_return_423():
    e = _enrol()
    hdr = _hdr(e["credential"])
    assert client.post(f"/api/fleet/{e['connector_id']}/pause").json()["paused"] is True
    r = client.post("/api/ingest/events", json=[EVENT], headers=hdr)
    assert r.status_code == 423 and r.json()["detail"]["error"] == "connector_paused"
    assert client.post(f"/api/fleet/{e['connector_id']}/heartbeat", headers=hdr).json()["paused"] is True
    client.post(f"/api/fleet/{e['connector_id']}/resume")
    assert client.post("/api/ingest/events", json=[EVENT], headers=hdr).status_code == 200

    client.post("/api/fleet/workspace/kill-switch", json={"enabled": True})
    r = client.post("/api/ingest/events", json=[EVENT], headers=hdr)
    assert r.status_code == 423 and r.json()["detail"]["error"] == "workspace_paused"
    assert client.get("/api/fleet").json()["workspace"]["kill_switch"] is True
    client.post("/api/fleet/workspace/kill-switch", json={"enabled": False})
    assert client.post("/api/ingest/events", json=[EVENT], headers=hdr).status_code == 200


def test_batch_cap():
    e = _enrol()
    r = client.post("/api/ingest/events", json=[EVENT] * (fleet.MAX_BATCH + 1), headers=_hdr(e["credential"]))
    assert r.status_code == 413
    r = client.post("/api/ingest/events", json=[EVENT] * fleet.MAX_BATCH, headers=_hdr(e["credential"]))
    assert r.status_code == 200 and r.json()["accepted"] == fleet.MAX_BATCH
    assert len(fleet.store().events) == 50


def test_audit_records_operator_actions_newest_first():
    e = _enrol()
    client.post("/api/fleet/con-ci-eu-1/pause")
    client.post("/api/fleet/con-ci-eu-1/pause")  # idempotent: no second entry
    client.post("/api/fleet/workspace/kill-switch", json={"enabled": True})
    audit = client.get("/api/fleet").json()["audit"]
    assert [a["action"] for a in audit[:3]] == ["workspace.kill_switch_on", "connector.paused", "connector.enrolled"]
    assert audit[0]["actor"] == audit[1]["actor"] == "operator (sandbox)"
    assert audit[2]["target"] == e["connector_id"] and e["credential"] not in audit[2]["detail"]
    assert client.post("/api/fleet/con-nope/pause").status_code == 404


def test_fleet_controls_are_not_agent_tools():
    from app.agent.graph import tool_specs

    names = " ".join(str(t) for t in tool_specs()).lower()
    assert "fleet" not in names and "pause" not in names and "kill" not in names
