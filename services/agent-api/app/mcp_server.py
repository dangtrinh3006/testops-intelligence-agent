"""MCP server (stdio): the Digital QE's read-only tools inside an IDE or another agent.

Exposes the same 8 bounded tools the LangGraph agent uses, plus `release_check`. Arguments go through the
same Pydantic schemas as the API (tools.run_tool), and nothing here can write.

Install the optional extra and register the server, e.g. in Claude Code (.mcp.json) or Cursor (mcp.json):

    pip install -e "services/agent-api[mcp]"
    {"mcpServers": {"testops": {"command": "python", "args": ["-m", "app.mcp_server"],
                                "cwd": "services/agent-api", "env": {"TESTOPS_DATA_SOURCE": "fixtures"}}}}
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError as McpToolError
from mcp.types import ToolAnnotations

from .domain import checks
from .store import dataset
from .tools import TOOLS, ToolError, _resolve_run, run_tool

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)

server = MCPServer(
    name="testops",
    title="TestOps Intelligence Agent",
    instructions=(
        "Read-only evidence about CI runs, flaky tests, data quality and release gates. "
        "Verdicts (SHIP / SHIP_WITH_WARNINGS / HOLD_MANUAL_REVIEW / BLOCK) come only from evaluate_release_gate or "
        "release_check; cite the record ids each tool returns."
    ),
)


def _call(name: str, args: dict[str, Any]) -> dict:
    ds, _ = dataset()
    try:
        return run_tool(ds, name, {k: v for k, v in args.items() if v is not None})
    except ToolError as e:
        # An anticipated error: the SDK passes this text to the client so the caller can correct itself.
        raise McpToolError(f"{e.code}: {e.message}" + (f" Hint: {e.hint}" if e.hint else "")) from None


def _desc(name: str) -> str:
    return TOOLS[name][2]


@server.tool(description=_desc("find_pipeline_runs"), annotations=READ_ONLY)
def find_pipeline_runs(service_id: str | None = None, pipeline_id: str | None = None, final_status: str | None = None, limit: int = 5) -> dict:
    return _call("find_pipeline_runs", {"service_id": service_id, "pipeline_id": pipeline_id, "final_status": final_status, "limit": limit})


@server.tool(description=_desc("get_run_details"), annotations=READ_ONLY)
def get_run_details(run_id: str) -> dict:
    return _call("get_run_details", {"run_id": run_id})


@server.tool(description=_desc("inspect_failure_evidence"), annotations=READ_ONLY)
def inspect_failure_evidence(run_id: str) -> dict:
    return _call("inspect_failure_evidence", {"run_id": run_id})


@server.tool(description=_desc("evaluate_release_gate"), annotations=READ_ONLY)
def evaluate_release_gate(run_id: str) -> dict:
    return _call("evaluate_release_gate", {"run_id": run_id})


@server.tool(description=_desc("analyze_flaky_tests"), annotations=READ_ONLY)
def analyze_flaky_tests(service_id: str | None = None, lookback_days: int = 30) -> dict:
    return _call("analyze_flaky_tests", {"service_id": service_id, "lookback_days": lookback_days})


@server.tool(description=_desc("estimate_triage_cost"), annotations=READ_ONLY)
def estimate_triage_cost(service_id: str | None = None, lookback_days: int = 30,
                         minutes_per_investigation: float | None = None, usd_per_hour: float | None = None) -> dict:
    return _call("estimate_triage_cost", {"service_id": service_id, "lookback_days": lookback_days,
                                          "minutes_per_investigation": minutes_per_investigation, "usd_per_hour": usd_per_hour})


@server.tool(description=_desc("get_data_quality_report"), annotations=READ_ONLY)
def get_data_quality_report(kind: str | None = None) -> dict:
    return _call("get_data_quality_report", {"kind": kind})


@server.tool(description=_desc("get_record"), annotations=READ_ONLY)
def get_record(record_id: str) -> dict:
    return _call("get_record", {"record_id": record_id})


@server.tool(
    description="Release check for a run or release candidate: policy verdict, CI-style conclusion, tests needing attention "
                "with defect type and flake level, and a PR-comment-ready markdown summary.",
    annotations=READ_ONLY,
)
def release_check(run_id: str) -> dict:
    ds, _ = dataset()
    try:
        rid = _resolve_run(ds, run_id)
    except ToolError as e:
        raise McpToolError(f"{e.code}: {e.message}") from None
    return checks.release_check(ds, rid)


if __name__ == "__main__":
    server.run("stdio")
