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
    assert writes == [] and posts == ["/api/ask"]
