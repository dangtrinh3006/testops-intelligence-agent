"""Model client. Provider-neutral: any OpenAI-compatible endpoint (Gemini, Vercel AI Gateway, LiteLLM...)."""

from __future__ import annotations

import os
from dataclasses import dataclass

GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1"


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    api_key: str
    model: str
    fallback_model: str | None
    timeout_s: float


def model_config() -> ModelConfig | None:
    """None when no credentials are configured: the API then serves replay/offline modes only."""
    timeout = float(os.environ.get("LLM_TIMEOUT_SECONDS", "45"))
    key = os.environ.get("LLM_API_KEY")
    if key:
        return ModelConfig(
            os.environ.get("LLM_BASE_URL", GEMINI_OPENAI_URL), key,
            os.environ.get("LLM_MODEL", "gemini-3.5-flash"), os.environ.get("LLM_FALLBACK_MODEL", "gemini-3.5-flash-lite"), timeout,
        )
    gw = os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN")
    if gw:
        return ModelConfig(AI_GATEWAY_URL, gw, os.environ.get("LLM_MODEL", "anthropic/claude-sonnet-5"), os.environ.get("LLM_FALLBACK_MODEL"), timeout)
    return None

