#!/usr/bin/env python3
"""TestOps connector: runs inside the customer network and talks outbound only (HTTPS 443) to the ingest API.

    python testops_connector.py enrol --code enroll-demo-not-secret --name acme-ci-1 --adapter junit-xml
    python testops_connector.py heartbeat
    python testops_connector.py push --junit build/test-results.xml --run-id run-123 --service checkout-web [--dry-run]
    python testops_connector.py run --interval 30

Opens no ports and needs no inbound access. Standard library only (Python 3.9+).
Exit codes: 0 ok, 3 error, 4 paused by the control plane (HTTP 423).
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

UTC = timezone.utc  # noqa: UP017 - datetime.UTC needs 3.11; the connector supports 3.9

VERSION = "1.4.2"
DEFAULT_CONFIG = Path.home() / ".testops-connector.json"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_BATCH = 500
MAX_JUNIT_BYTES = 50 * 1024 * 1024
EXIT_OK, EXIT_ERROR, EXIT_PAUSED = 0, 3, 4


class ConnectorError(Exception):
    pass


class Paused(Exception):
    pass


def check_url(api: str) -> str:
    u = urllib.parse.urlparse(api)
    if u.scheme == "https" or (u.scheme == "http" and u.hostname in LOCAL_HOSTS):
        return api.rstrip("/")
    raise ConnectorError(f"refusing {api!r}: HTTPS is required except for localhost")


def call(method: str, url: str, body=None, bearer: str | None = None, timeout: float = 15.0, retries: int = 4, sleep=time.sleep):
    """JSON request with backoff on 429/5xx and network errors. 423 raises Paused, other 4xx raise ConnectorError."""
    data = json.dumps(body).encode() if body is not None else None
    headers = {"accept": "application/json", "content-type": "application/json", "user-agent": f"testops-connector/{VERSION}"}
    if bearer:
        headers["authorization"] = f"Bearer {bearer}"
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            if e.code == 423:
                raise Paused(_detail(e)) from None
            if e.code not in RETRY_STATUSES or attempt == retries:
                raise ConnectorError(f"HTTP {e.code}: {_detail(e)}") from None
            wait = _retry_after(e) or 2**attempt
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == retries:
                raise ConnectorError(f"cannot reach {url}: {e}") from None
            wait = 2**attempt
        sleep(min(wait, 30))
    raise ConnectorError("unreachable")


def _detail(e: urllib.error.HTTPError) -> str:
    try:
        d = json.loads(e.read().decode("utf-8")).get("detail")
        return d.get("message", str(d)) if isinstance(d, dict) else str(d)
    except Exception:  # noqa: BLE001 - error bodies are best effort
        return e.reason or "request failed"


def _retry_after(e: urllib.error.HTTPError) -> float | None:
    try:
        return float(e.headers.get("retry-after"))
    except (TypeError, ValueError):
        return None


def load_config(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConnectorError(f"no connector config at {path}; run 'enrol' first") from None


def save_config(path: Path, cfg: dict) -> None:
    # Create with 0600 so the credential is never world-readable, even briefly.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.chmod(path, 0o600)


def host_info() -> dict:
    arch = platform.machine().lower().replace("x86_64", "amd64").replace("aarch64", "arm64") or "unknown"
    return {"os": (platform.system().lower() or "unknown"), "arch": arch}


def parse_junit(path: Path, run_id: str, service: str, attempt: int = 1) -> list[dict]:
    if path.stat().st_size > MAX_JUNIT_BYTES:
        raise ConnectorError(f"{path} is larger than {MAX_JUNIT_BYTES // (1024 * 1024)} MB")
    root = ET.parse(path).getroot()
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    events = []
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite")) or [root]
    for suite in suites:
        ts = _iso(suite.get("timestamp")) or now
        for case in suite.findall("testcase"):
            status, error_class, message = "PASS", None, None
            for tag, st in (("failure", "FAIL"), ("error", "ERROR"), ("skipped", "SKIPPED")):
                node = case.find(tag)
                if node is not None:
                    status, error_class = st, node.get("type")
                    message = (node.get("message") or (node.text or "").strip() or None)
                    break
            name = case.get("name") or "unnamed"
            test_id = case.get("id") or (f"{case.get('classname')}.{name}" if case.get("classname") else name)
            ev = {"run_id": run_id, "service_id": service, "test_id": test_id[:240], "status": status, "attempt": attempt, "ts": ts}
            if error_class:
                ev["error_class"] = error_class[:160]
            if message and status != "SKIPPED":
                ev["message"] = message[:500]
            events.append(ev)
    return events


def _iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    dt = dt if dt.tzinfo else dt.replace(tzinfo=UTC)  # JUnit timestamps are usually naive; assume UTC
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def cmd_enrol(a, out=print) -> int:
    api = check_url(a.api)
    res = call("POST", f"{api}/api/fleet/enrol", {"code": a.code, "name": a.name, "adapters": a.adapter,
                                                  "version": VERSION, "host": host_info()})
    save_config(a.config, {"api": api, "connector_id": res["connector_id"], "name": res["name"], "adapters": a.adapter,
                           "credential": res["credential"]})
    out(f"enrolled {res['name']} as {res['connector_id']} (credential {res['credential_prefix']}... saved to {a.config}, mode 0600)")
    return EXIT_OK


def cmd_heartbeat(a, out=print) -> int:
    cfg = load_config(a.config)
    api = check_url(cfg["api"])
    res = call("POST", f"{api}/api/fleet/{cfg['connector_id']}/heartbeat", {"version": VERSION, "host": host_info()},
               bearer=cfg["credential"])
    state = "PAUSED" if res["paused"] else "active"
    out(f"{cfg['name']}: {res['status']} | {state} | version {VERSION} ({res['version_state']}, target {res['target_version']})")
    return EXIT_OK


def cmd_push(a, out=print) -> int:
    events = parse_junit(a.junit, a.run_id, a.service, a.attempt)
    size = max(1, min(a.batch_size, MAX_BATCH))
    if a.dry_run:
        out(json.dumps(events, indent=2))
        out(f"dry run: {len(events)} events in {(len(events) + size - 1) // size} batch(es), nothing sent")
        return EXIT_OK
    cfg = load_config(a.config)
    api = check_url(cfg["api"])
    accepted = rejected = 0
    for i in range(0, len(events), size):
        res = call("POST", f"{api}/api/ingest/events", events[i : i + size], bearer=cfg["credential"])
        accepted, rejected = accepted + res["accepted"], rejected + res["rejected"]
        for reason in res.get("reasons", []):
            out(f"  rejected: {reason}")
    out(f"pushed {len(events)} events: {accepted} accepted, {rejected} rejected")
    return EXIT_OK if rejected == 0 else EXIT_ERROR


def cmd_run(a, out=print, sleep=time.sleep) -> int:
    beats = 0
    while a.max_beats is None or beats < a.max_beats:
        try:
            cmd_heartbeat(a, out)
        except ConnectorError as e:
            out(f"heartbeat failed: {e}")  # keep looping; the control plane marks us stale, then lost
        beats += 1
        if a.max_beats is None or beats < a.max_beats:
            sleep(a.interval)
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Outbound-only TestOps connector.")
    p.add_argument("--config", type=Path, default=Path(os.environ.get("TESTOPS_CONNECTOR_CONFIG", DEFAULT_CONFIG)))
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("enrol", help="exchange a one-time code for a connector credential")
    e.add_argument("--api", default=os.environ.get("TESTOPS_API", "http://localhost:8000"))
    e.add_argument("--code", required=True)
    e.add_argument("--name", required=True)
    e.add_argument("--adapter", action="append", required=True,
                   choices=["github-actions", "jenkins", "junit-xml", "reportportal"])
    sub.add_parser("heartbeat", help="report liveness and pull policy")
    s = sub.add_parser("push", help="parse a JUnit XML report and push its outcomes")
    s.add_argument("--junit", type=Path, required=True)
    s.add_argument("--run-id", required=True)
    s.add_argument("--service", required=True)
    s.add_argument("--attempt", type=int, default=1)
    s.add_argument("--batch-size", type=int, default=MAX_BATCH)
    s.add_argument("--dry-run", action="store_true", help="print the events, send nothing")
    r = sub.add_parser("run", help="heartbeat loop")
    r.add_argument("--interval", type=float, default=30)
    r.add_argument("--max-beats", type=int, default=None, help=argparse.SUPPRESS)
    return p


def main(argv: list[str] | None = None) -> int:
    a = build_parser().parse_args(argv)
    handler = {"enrol": cmd_enrol, "heartbeat": cmd_heartbeat, "push": cmd_push, "run": cmd_run}[a.cmd]
    try:
        return handler(a)
    except Paused as e:
        print(f"paused by the control plane, stopping: {e}", file=sys.stderr)
        return EXIT_PAUSED
    except (ConnectorError, ET.ParseError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return EXIT_ERROR
    except KeyboardInterrupt:
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
