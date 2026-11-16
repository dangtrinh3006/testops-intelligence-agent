"""Connector CLI against the real FastAPI app: urlopen is routed into a TestClient, no network."""

import importlib.util
import io
import json
import os
import stat
import sys
import urllib.error
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.domain import fleet
from app.main import app

CLI = Path(__file__).resolve().parents[1] / "scripts" / "testops_connector.py"
JUNIT = Path(__file__).resolve().parent / "fixtures" / "junit-sample.xml"
spec = importlib.util.spec_from_file_location("testops_connector", CLI)
cli = importlib.util.module_from_spec(spec)
sys.modules["testops_connector"] = cli
spec.loader.exec_module(cli)

client = TestClient(app)


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(calls):
    def urlopen(req, timeout=None):
        assert timeout and timeout > 0
        path = req.full_url.split("://", 1)[1].split("/", 1)[1]
        headers = {k.lower(): v for k, v in req.header_items()}
        calls.append((req.get_method(), "/" + path))
        r = client.request(req.get_method(), "/" + path, content=req.data, headers=headers)
        if r.status_code >= 400:
            raise urllib.error.HTTPError(req.full_url, r.status_code, "err", r.headers, io.BytesIO(r.content))
        return _Resp(r.content)

    return urlopen


@pytest.fixture
def env(tmp_path, monkeypatch):
    fleet.reset()
    calls = []
    monkeypatch.setattr(cli.urllib.request, "urlopen", fake_urlopen(calls))
    cfg = tmp_path / "connector.json"
    yield cfg, calls
    fleet.reset()


def run(cfg, *args):
    return cli.main(["--config", str(cfg), *args])


def test_parse_junit_maps_statuses_and_timestamps():
    events = cli.parse_junit(JUNIT, "run-x-9", "checkout-web")
    assert [e["status"] for e in events] == ["PASS", "FAIL", "SKIPPED", "ERROR"]
    assert events[1]["test_id"] == "checkout.cart.applies_coupon" and events[1]["error_class"] == "AssertionError"
    assert events[0]["ts"] == "2026-11-17T08:00:00Z" and events[3]["ts"] == "2026-11-17T08:05:00Z"
    assert "message" not in events[2]


def test_dry_run_sends_nothing(env, capsys):
    cfg, calls = env
    assert run(cfg, "push", "--junit", str(JUNIT), "--run-id", "run-x-9", "--service", "checkout-web", "--dry-run") == 0
    assert calls == [] and "dry run: 4 events in 1 batch(es)" in capsys.readouterr().out


def test_enrol_heartbeat_push_end_to_end(env, capsys):
    cfg, calls = env
    assert run(cfg, "enrol", "--api", "http://localhost:8000", "--code", fleet.SANDBOX_ENROL_CODE, "--name", "acme-cli-1",
               "--adapter", "junit-xml") == 0
    saved = json.loads(cfg.read_text())
    out = capsys.readouterr().out
    assert saved["credential"].startswith("tcon_") and saved["credential"] not in out and "credential tcon_" in out
    if os.name == "posix":
        assert stat.S_IMODE(cfg.stat().st_mode) == 0o600
    assert run(cfg, "heartbeat") == 0 and "connected | active" in capsys.readouterr().out
    assert run(cfg, "push", "--junit", str(JUNIT), "--run-id", "run-x-9", "--service", "checkout-web", "--batch-size", "3") == 0
    assert "4 accepted, 0 rejected" in capsys.readouterr().out
    assert [c for c in calls if c[1] == "/api/ingest/events"] == [("POST", "/api/ingest/events")] * 2
    stored = list(fleet.store().events)
    assert len(stored) == 4 and all("@" not in (e.get("message") or "") for e in stored)
    row = next(c for c in client.get("/api/fleet").json()["connectors"] if c["name"] == "acme-cli-1")
    assert row["events_ingested_24h"] == 4 and row["sandbox"] is False


def test_bad_code_and_paused_exit_codes(env, capsys):
    cfg, _ = env
    assert run(cfg, "enrol", "--api", "http://localhost:8000", "--code", "guess", "--name", "acme-cli-2", "--adapter", "jenkins") == 3
    assert "HTTP 403" in capsys.readouterr().err
    run(cfg, "enrol", "--api", "http://localhost:8000", "--code", fleet.SANDBOX_ENROL_CODE, "--name", "acme-cli-2", "--adapter", "jenkins")
    client.post("/api/fleet/workspace/kill-switch", json={"enabled": True})
    assert run(cfg, "push", "--junit", str(JUNIT), "--run-id", "r1", "--service", "s1") == 4
    assert "paused by the control plane" in capsys.readouterr().err


def test_https_required_except_localhost():
    assert cli.check_url("https://testops-agent-api.vercel.app/") == "https://testops-agent-api.vercel.app"
    assert cli.check_url("http://127.0.0.1:8000") == "http://127.0.0.1:8000"
    with pytest.raises(cli.ConnectorError):
        cli.check_url("http://testops.example.com")


def test_retries_with_backoff_on_429_and_5xx(monkeypatch):
    statuses, waits = [429, 503], []

    def urlopen(req, timeout=None):
        if statuses:
            code = statuses.pop(0)
            raise urllib.error.HTTPError(req.full_url, code, "busy", {}, io.BytesIO(b"{}"))
        return _Resp(b'{"ok": true}')

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    assert cli.call("GET", "https://x.example/api", sleep=waits.append) == {"ok": True}
    assert waits == [1, 2]


def test_no_retry_on_4xx_and_gives_up_after_retries(monkeypatch):
    n = {"calls": 0}

    def urlopen(req, timeout=None):
        n["calls"] += 1
        raise urllib.error.HTTPError(req.full_url, 400 if "bad" in req.full_url else 502, "x", {}, io.BytesIO(b"{}"))

    monkeypatch.setattr(cli.urllib.request, "urlopen", urlopen)
    with pytest.raises(cli.ConnectorError):
        cli.call("GET", "https://x.example/bad", sleep=lambda s: None)
    assert n["calls"] == 1
    with pytest.raises(cli.ConnectorError, match="HTTP 502"):
        cli.call("GET", "https://x.example/up", retries=2, sleep=lambda s: None)
    assert n["calls"] == 4


def test_run_loop_heartbeats(env, capsys):
    cfg, calls = env
    run(cfg, "enrol", "--api", "http://localhost:8000", "--code", fleet.SANDBOX_ENROL_CODE, "--name", "acme-cli-3", "--adapter", "jenkins")
    args = cli.build_parser().parse_args(["--config", str(cfg), "run", "--interval", "30", "--max-beats", "3"])
    waits = []
    assert cli.cmd_run(args, sleep=waits.append) == 0
    assert waits == [30, 30] and sum(1 for c in calls if c[1].endswith("/heartbeat")) == 3
