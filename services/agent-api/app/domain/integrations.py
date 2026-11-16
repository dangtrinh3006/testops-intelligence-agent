"""Settings & integrations status, derived only from runtime state. Never returns credentials, URLs with
credentials or environment values: only names, booleans and counts.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

from ..agent.llm import AI_GATEWAY_URL, GEMINI_OPENAI_URL, GROQ_OPENAI_URL, candidates, model_config
from ..store import DataUnavailable, dataset
from . import audit, fleet
from .knowledge import knowledge

SERVICE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = SERVICE_ROOT.parents[1]
OFFLINE = "offline deterministic planner"
READ_ONLY_NOTE = "Planned write-back. The agent is read-only today, so nothing is posted to this system."


def _provider(base_url: str) -> str:
    known = {GEMINI_OPENAI_URL: "gemini", GROQ_OPENAI_URL: "groq", AI_GATEWAY_URL: "vercel-ai-gateway"}
    return known.get(base_url, "openai-compatible")


def _models() -> dict[str, Any]:
    cfg = model_config()
    chain = [{"position": i + 1, "model": m, "provider": _provider(c.base_url), "configured": True,
              "role": "primary" if i == 0 else "fallback"} for i, (c, m) in enumerate(candidates(cfg) if cfg else [])]
    chain.append({"position": len(chain) + 1, "model": OFFLINE, "provider": "built-in", "configured": True, "role": "last resort"})
    return {
        "configured": cfg is not None,
        "chain": chain,
        "providers": [
            {"provider": "gemini", "configured": bool(os.environ.get("LLM_API_KEY"))},
            {"provider": "groq", "configured": bool(os.environ.get("GROQ_API_KEY"))},
            {"provider": "vercel-ai-gateway", "configured": bool(os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN"))},
        ],
        "primary_override": os.environ.get("LLM_PRIMARY", "").lower() == "groq",
        "configurable_here": False,
    }


def _data() -> dict[str, Any]:
    try:
        ds, source = dataset()
    except DataUnavailable:
        return {"status": "unavailable", "source": None}
    return {"status": "ok", "source": source, "raw_events": ds.raw_event_count, "runs": len(ds.runs),
            "attempts": len(ds.attempts), "tests": len(ds.catalog["tests"]), "read_only": True}


def _file(rel_service: str | None = None, rel_repo: str | None = None) -> bool:
    if rel_service and (SERVICE_ROOT / rel_service).is_file():
        return True
    return bool(rel_repo and (REPO_ROOT / rel_repo).is_file())


def integrations() -> dict[str, Any]:
    snap = fleet.store().snapshot()
    conns = snap["connectors"]
    enrolled = [c for c in conns if not c["sandbox"]]
    live_enrolled = sum(c["status"] == "connected" for c in enrolled)
    mcp = importlib.util.find_spec("mcp") is not None
    gate_cli = _file("scripts/testops_gate.py")
    connector_cli = _file("scripts/testops_connector.py")
    action = _file(rel_repo="examples/github-actions-release-gate.yml")

    items = [
        {"id": "fleet", "name": "QE connector fleet", "category": "ingest",
         "status": "connected" if live_enrolled else "available",
         "detail": f"{len(conns) - len(enrolled)} simulated, {len(enrolled)} enrolled ({live_enrolled} connected). Outbound HTTPS only.",
         "href": "/fleet"},
        {"id": "release-check-api", "name": "Release check API", "category": "shift-left", "status": "available",
         "detail": "GET /api/checks/{run}: gate verdict as a CI check with PR-comment markdown. Read-only.", "href": "/dev"},
        {"id": "cli-gate", "name": "CLI release gate", "category": "shift-left",
         "status": "available" if gate_cli else "documented",
         "detail": "scripts/testops_gate.py exits 0/1/2/3 for CI." if gate_cli else "scripts/testops_gate.py ships in the repository, not in this deployment bundle."},
        {"id": "connector-cli", "name": "Connector CLI", "category": "ingest",
         "status": "available" if connector_cli else "documented",
         "detail": "scripts/testops_connector.py enrols, heartbeats and pushes JUnit XML." if connector_cli
         else "scripts/testops_connector.py ships in the repository, not in this deployment bundle.", "href": "/fleet"},
        {"id": "github-action", "name": "GitHub Action", "category": "shift-left",
         "status": "example" if action else "documented",
         "detail": "examples/github-actions-release-gate.yml runs the CLI gate on a pull request." if action
         else "Example workflow documented in the README; the file is not part of this deployment bundle."},
        {"id": "mcp", "name": "MCP server (IDE)", "category": "agent",
         "status": "available" if mcp else "documented",
         "detail": "Installed: python -m app.mcp_server exposes the 8 read-only tools + release_check over stdio." if mcp
         else "Optional extra, not installed in this deployment. pip install -e \".[mcp]\" to run it locally."},
        {"id": "reportportal", "name": "ReportPortal", "category": "write-back", "status": "not_connected", "detail": READ_ONLY_NOTE},
        {"id": "jira", "name": "Jira", "category": "write-back", "status": "not_connected", "detail": READ_ONLY_NOTE},
        {"id": "slack", "name": "Slack", "category": "write-back", "status": "not_connected", "detail": READ_ONLY_NOTE},
        {"id": "github-checks", "name": "GitHub Checks write-back", "category": "write-back", "status": "not_connected",
         "detail": READ_ONLY_NOTE + " The CLI gate can fail a job instead."},
        {"id": "audit-store", "name": "Append-only audit store", "category": "governance", "status": "planned",
         "detail": "Audit entries are in memory for this sandbox and reset on restart.", "href": "/audit"},
    ]
    feed = audit.log().feed(limit=1)
    return {
        "workspace": {"name": snap["workspace"]["name"], "sandbox": snap["workspace"]["sandbox"], "region": None},
        "models": _models(),
        "data_source": _data(),
        "rules": {"version": knowledge()["version"]},
        "integrations": items,
        "governance": {"agent_read_only": True, "kill_switch": snap["workspace"]["kill_switch"],
                       "audit_entries": feed["total"], "audit_storage": feed["storage"]},
    }
