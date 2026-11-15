"""Public API contract (also consumed by the Next.js UI)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Verdict = Literal["SHIP", "SHIP_WITH_WARNINGS", "HOLD_MANUAL_REVIEW", "BLOCK"]
Mode = Literal["live", "replay", "offline"]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=600)
    mode: Mode = "live"
    scenario: str | None = Field(default=None, max_length=40, description="Preset id (A|B|C); enables replay lookup.")


class EvidenceRef(BaseModel):
    id: str
    kind: str  # run | attempt | ci_summary | log | finding | test | policy | release_candidate
    label: str
    exists: bool = True


class Claim(BaseModel):
    text: str
    evidence: list[str] = []
    supported: bool = True
    note: str | None = None


class GateView(BaseModel):
    run_id: str
    verdict: Verdict
    deciding_rule: str
    policy_id: str
    rules_version: str
    checks: list[dict[str, Any]]


class ToolCall(BaseModel):
    step: int
    tool: str
    args: dict[str, Any]
    ok: bool
    ms: int
    summary: str
    evidence: list[str] = []


class Validation(BaseModel):
    passed: bool
    checks: list[dict[str, Any]]
    revisions: int


class AskResponse(BaseModel):
    request_id: str
    mode: Mode
    model: str | None
    question: str
    answer: str
    recommendation: str | None
    gate: GateView | None
    claims: list[Claim]
    evidence: list[EvidenceRef]
    data_quality_warnings: list[str]
    assumptions: list[str]
    uncertainty: str
    tool_trace: list[ToolCall]
    validation: Validation
    latency_ms: int
    notice: str | None = None
