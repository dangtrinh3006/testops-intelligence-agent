"""API contract and input validation (acceptance 9-10)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_and_overview():
    h = client.get("/api/health").json()
    assert h["data"]["status"] == "ok" and h["data"]["runs"] == 120
    o = client.get("/api/overview").json()
    verdicts = {rc["id"]: rc["verdict"] for rc in o["release_candidates"]}
    assert verdicts == {"rc-chk-5.8.0": "BLOCK", "rc-pay-2.13.4": "SHIP_WITH_WARNINGS", "rc-pay-2.14.0": "HOLD_MANUAL_REVIEW"}


def test_ask_validates_input():
    assert client.post("/api/ask", json={"question": "hi"}).status_code == 422
    assert client.post("/api/ask", json={"question": "x" * 601}).status_code == 422
    assert client.post("/api/ask", json={"question": "Why did checkout fail?", "mode": "sudo"}).status_code == 422


def test_ask_offline_returns_structured_answer_with_request_id():
    r = client.post("/api/ask", json={"question": "Can we ship payments-api 2.14.0? CI summary says PASS.", "mode": "offline"})
    body = r.json()
    assert r.status_code == 200 and r.headers["x-request-id"]
    assert body["gate"]["verdict"] == "HOLD_MANUAL_REVIEW" and body["mode"] == "offline"
    assert body["validation"]["passed"] and body["tool_trace"]


def test_records_and_unknown_ids():
    assert client.get("/api/records/ci:run.summary:run-pay-main-0233").json()["record"]["status_raw"] == "passed"
    assert client.get("/api/records/run-nope").status_code == 404
    assert client.get("/api/runs/run-nope").status_code == 404


def test_read_only_surface():
    paths = {r.path: getattr(r, "methods", set()) for r in app.routes}
    writes = [p for p, m in paths.items() if m and m & {"PUT", "PATCH", "DELETE"}]
    posts = [p for p, m in paths.items() if m and "POST" in m]
    # The only POSTs outside /api/ask are the sandbox fleet control plane and the audit log (in memory, never the dataset).
    fleet_posts = ["/api/fleet/enrol", "/api/fleet/workspace/kill-switch", "/api/fleet/{connector_id}/heartbeat",
                   "/api/fleet/{connector_id}/pause", "/api/fleet/{connector_id}/resume", "/api/ingest/events"]
    assert writes == [] and sorted(posts) == sorted(["/api/ask", "/api/ask/stream", "/api/audit/triage-decisions", *fleet_posts])


def test_raw_event_and_pipeline_ids_resolve():
    r = client.get("/api/records/runner:attempt.result:att-chk-main-0403-T-CHK-011-1").json()
    assert r["kind"] == "attempt" and r["record"]["attempt_id"] == "att-chk-main-0403-T-CHK-011-1"
    p = client.get("/api/records/pay-main").json()
    assert p["kind"] == "pipeline" and p["record"]["summary_vocabulary"] == ["passed"]
    assert client.get("/api/records/run-pay-main-0233").json()["kind"] == "run"


def test_replay_without_recording_says_so():
    body = client.post("/api/ask", json={"question": "Which tests are flaky in inventory?", "mode": "replay"}).json()
    assert body["mode"] == "offline" and "No replay is recorded" in body["notice"]


def _events(text: str) -> list[tuple[str, dict]]:
    import json

    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_stream_endpoint_emits_trace_then_final():
    r = client.post("/api/ask/stream", json={"question": "Can we ship payments-api 2.14.0? CI summary says PASS.", "mode": "offline"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = _events(r.text)
    names = [e for e, _ in events]
    assert names[0] == "start" and names[-1] == "final" and "tool" in names and "validate" in names
    final = events[-1][1]
    assert final["gate"]["verdict"] == "HOLD_MANUAL_REVIEW" and final["mode"] == "offline"
    assert [t["tool"] for t in final["tool_trace"]] == [d["tool"] for e, d in events if e == "tool"]


def test_stream_endpoint_validates_input():
    assert client.post("/api/ask/stream", json={"question": "x"}).status_code == 422


def test_test_history_matrix_is_derived_from_attempts():
    r = client.get("/api/test-history", params={"service_id": "payments-api", "limit": 60})
    assert r.status_code == 200
    body = r.json()
    run_ids = [c["run_id"] for c in body["runs"]]
    assert "run-pay-main-0233" in run_ids
    i = run_ids.index("run-pay-main-0233")
    # The CI summary says PASS, but T-PAY-004's last attempt never reported: the cell must say so (R2).
    assert body["runs"][i]["summary_status"] == "PASS"
    assert body["cells"]["T-PAY-004"][i]["state"] == "incomplete"
    assert body["runs"][i]["verdict"] == "HOLD_MANUAL_REVIEW"
    states = {c["state"] for row in body["cells"].values() for c in row if c}
    assert states <= set(body["states"])
    assert client.get("/api/test-history", params={"service_id": "billing"}).status_code == 404
    assert client.get("/api/test-history", params={"limit": 500}).status_code == 422
