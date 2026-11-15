"""FastAPI app. Read-only by design: there is no endpoint that mutates CI, releases or the dataset."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .agent.llm import model_config
from .agent.service import PRESETS, ask
from .domain.knowledge import knowledge
from .schemas import AskRequest, AskResponse
from .store import DATA_DIR, DataUnavailable, dataset
from .tools import ToolError, run_tool

log = logging.getLogger("testops")
logging.basicConfig(level=logging.INFO, format="%(message)s")

app = FastAPI(title="TestOps Intelligence Agent API", version="0.1.0",
              description="Evidence-first agent for CI triage, flaky tests and release readiness. Synthetic data only.")

# Abuse protection for a public demo: per-IP sliding window + per-instance daily cap on live model calls.
RATE_WINDOW_S, RATE_MAX = 60, int(os.environ.get("RATE_LIMIT_PER_MINUTE", "6"))
LIVE_DAILY_CAP = int(os.environ.get("LIVE_DAILY_CAP", "150"))
_hits: dict[str, deque] = defaultdict(deque)
_live_calls = {"day": time.strftime("%Y-%m-%d"), "count": 0}


def _client_ip(req: Request) -> str:
    return (req.headers.get("x-forwarded-for") or (req.client.host if req.client else "?")).split(",")[0].strip()


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW_S:
        q.popleft()
    if len(q) >= RATE_MAX:
        return True
    q.append(now)
    return False


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex[:12]}"
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as e:  # noqa: BLE001 - last-resort guard; details stay in logs
        log.exception(json.dumps({"request_id": rid, "path": request.url.path, "error": type(e).__name__}))
        response = JSONResponse({"error": "internal_error", "request_id": rid}, status_code=500)
    response.headers["x-request-id"] = rid
    log.info(json.dumps({"request_id": rid, "method": request.method, "path": request.url.path, "status": response.status_code,
                         "ms": int((time.perf_counter() - t0) * 1000)}))
    return response


def _ds():
    try:
        return dataset()
    except DataUnavailable as e:
        raise HTTPException(503, {"error": "data_unavailable", "message": str(e)}) from None


@app.get("/api/health")
def health():
    cfg = model_config()
    try:
        ds, source = dataset()
        data = {"status": "ok", "source": source, "raw_events": ds.raw_event_count, "runs": len(ds.runs)}
    except DataUnavailable as e:
        data = {"status": "unavailable", "message": str(e)}
    return {"status": "ok" if data["status"] == "ok" else "degraded", "data": data,
            "model": {"configured": cfg is not None, "model": cfg.model if cfg else None, "fallback": cfg.fallback_model if cfg else None},
            "rules_version": knowledge()["version"], "replays": sorted(p.stem for p in (DATA_DIR.parent / "replays").glob("*.json"))}


@app.get("/api/overview")
def overview():
    ds, source = _ds()
    rcs = []
    for rc in ds.catalog["release_candidates"]:
        g = run_tool(ds, "evaluate_release_gate", {"run_id": rc["id"]})
        rcs.append({**rc, "verdict": g["verdict"], "deciding_rule": g["deciding_rule"]})
    latest = run_tool(ds, "find_pipeline_runs", {"limit": 8})["runs"]
    counts = defaultdict(int)
    for f in ds.findings:
        counts[f.kind] += f.count if f.kind not in ("MIXED_TIMESTAMP_FORMATS",) else 1
    return {"company": ds.catalog["company"], "as_of": ds.catalog["as_of"], "source": source,
            "services": ds.catalog["services"], "pipelines": ds.catalog["pipelines"],
            "totals": {"runs": len(ds.runs), "attempts": len(ds.attempts), "tests": len(ds.catalog["tests"]),
                       "raw_events": ds.raw_event_count, "unique_events": ds.unique_event_count, "findings": len(ds.findings)},
            "release_candidates": rcs, "latest_runs": latest, "finding_counts": dict(counts),
            "presets": [{"id": k, "question": v} for k, v in PRESETS.items()]}


@app.post("/api/ask", response_model=AskResponse)
def ask_endpoint(body: AskRequest, request: Request):
    ip = _client_ip(request)
    if body.mode == "live":
        if _rate_limited(ip):
            raise HTTPException(429, {"error": "rate_limited", "message": f"Max {RATE_MAX} live questions per minute. Try replay or offline mode."})
        today = time.strftime("%Y-%m-%d")
        if _live_calls["day"] != today:
            _live_calls.update(day=today, count=0)
        if _live_calls["count"] >= LIVE_DAILY_CAP:
            raise HTTPException(429, {"error": "daily_cap", "message": "Daily live-model budget for this demo is used up. Replay and offline modes still work."})
        _live_calls["count"] += 1
    ds, _ = _ds()
    resp = ask(ds, body.question.strip(), body.mode, body.scenario)
    log.info(json.dumps({"request_id": resp.request_id, "event": "ask", "mode": resp.mode, "model": resp.model,
                         "tools": [t.tool for t in resp.tool_trace], "verdict": resp.gate.verdict if resp.gate else None,
                         "validation": resp.validation.passed, "latency_ms": resp.latency_ms}))
    return resp


@app.get("/api/records/{record_id:path}")
def record(record_id: str):
    ds, _ = _ds()
    try:
        return run_tool(ds, "get_record", {"record_id": record_id})
    except ToolError as e:
        raise HTTPException(404, {"error": e.code, "message": e.message}) from None


@app.get("/api/runs/{run_id}")
def run_details(run_id: str):
    ds, _ = _ds()
    try:
        return {"details": run_tool(ds, "get_run_details", {"run_id": run_id}), "gate": run_tool(ds, "evaluate_release_gate", {"run_id": run_id})}
    except ToolError as e:
        raise HTTPException(404, {"error": e.code, "message": e.message}) from None


@app.get("/api/flaky")
def flaky_report(service_id: str | None = None, lookback_days: int = 30):
    ds, _ = _ds()
    try:
        return {"flaky": run_tool(ds, "analyze_flaky_tests", {"service_id": service_id, "lookback_days": lookback_days}),
                "cost": run_tool(ds, "estimate_triage_cost", {"service_id": service_id, "lookback_days": lookback_days})}
    except ToolError as e:
        raise HTTPException(400, {"error": e.code, "message": e.message}) from None


@app.get("/api/data-quality")
def data_quality():
    ds, _ = _ds()
    return run_tool(ds, "get_data_quality_report", {})


@app.get("/api/knowledge")
def knowledge_file():
    return knowledge()


@app.get("/api/evals")
def evals():
    """Live-model report when one was recorded, plus the offline (CI) report."""
    out = {}
    for name in ("latest", "offline"):
        path = DATA_DIR.parent / "evals" / f"{name}.json"
        if path.exists():
            out["live" if name == "latest" else "offline"] = json.loads(path.read_text(encoding="utf-8"))
    if not out:
        raise HTTPException(404, {"error": "not_found", "message": "No eval report yet. Run python -m app.evals."})
    primary = out.get("live") or out["offline"]
    return {**primary, "reports": out}


@app.get("/api/tools")
def tools_catalog():
    from .agent.graph import tool_specs

    return {"tools": tool_specs()}


