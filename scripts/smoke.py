"""Post-deploy smoke test. Usage: python scripts/smoke.py https://testops.dangtrinh.dev [--live]

Checks the public surface end to end (UI proxy -> API -> database) with the seeded canonical records.
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "http://localhost:8000").rstrip("/")
LIVE = "--live" in sys.argv
results: list[tuple[str, bool, str]] = []


def call(method: str, path: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict | str]:
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw.startswith(("{", "[")) else raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


t0 = time.time()
s, h = call("GET", "/api/health")
check("health", s == 200 and isinstance(h, dict) and h["data"]["status"] == "ok", f"source={h['data'].get('source') if isinstance(h, dict) else h}")
s, o = call("GET", "/api/overview")
want = {"rc-chk-5.8.0": "BLOCK", "rc-pay-2.13.4": "SHIP_WITH_WARNINGS", "rc-pay-2.14.0": "HOLD_MANUAL_REVIEW"}
got = {rc["id"]: rc["verdict"] for rc in o["release_candidates"]} if s == 200 else {}
check("release verdicts", got == want, str(got))
s, r = call("GET", "/api/records/ci:run.summary:run-pay-main-0233")
check("evidence record (raw kept)", s == 200 and r["record"]["status_raw"] == "passed" and r["record"]["status"] == "PASS")
s, a = call("POST", "/api/ask", {"question": "Can we ship payments-api 2.14.0? The CI summary says PASS.", "mode": "offline"})
check("ask offline (scenario C)", s == 200 and a["gate"]["verdict"] == "HOLD_MANUAL_REVIEW" and a["validation"]["passed"], a.get("request_id", "") if s == 200 else str(a))
s, rp = call("POST", "/api/ask", {"question": "replay", "mode": "replay", "scenario": "C"})
check("ask replay (scenario C)", s == 200 and rp["mode"] in ("replay", "offline"), f"mode={rp.get('mode') if s == 200 else rp}")
s, bad = call("POST", "/api/ask", {"question": "x", "mode": "offline"})
check("input validation", s == 422)
s, nf = call("GET", "/api/records/run-does-not-exist")
check("unknown id is 404", s == 404)
s, ev = call("GET", "/api/evals")
off = ev.get("reports", {}).get("offline", {}).get("summary", {}) if s == 200 else {}
live = ev.get("reports", {}).get("live", {}).get("summary", {}) if s == 200 else {}
check("eval report (offline all pass, live none failing)", s == 200 and off.get("passed") == off.get("total") and live.get("failing", 0) == 0,
      f"offline {off.get('passed')}/{off.get('total')}, live stable {live.get('stable')} flaky {live.get('flaky')} failing {live.get('failing')}")
if LIVE:
    s, lv = call("POST", "/api/ask", {"question": "Why did the latest checkout pipeline fail, and should we block the release?", "mode": "live"}, timeout=150)
    check("ask live (scenario A)", s == 200 and lv["gate"]["verdict"] == "BLOCK", f"mode={lv.get('mode')} model={lv.get('model')} {lv.get('latency_ms')}ms" if s == 200 else str(lv))

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed in {time.time() - t0:.1f}s against {BASE}")
sys.exit(1 if failed else 0)
