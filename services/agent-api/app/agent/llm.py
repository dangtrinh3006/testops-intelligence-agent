"""Model client. Provider-neutral: any OpenAI-compatible endpoint (Gemini, Vercel AI Gateway, LiteLLM...)."""

from __future__ import annotations

import os
from dataclasses import dataclass, replace

GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1"
GROQ_OPENAI_URL = "https://api.groq.com/openai/v1"


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    api_key: str
    model: str
    fallback_model: str | None
    timeout_s: float
    next: ModelConfig | None = None  # another provider tried after this one's models fail


def candidates(cfg: ModelConfig) -> list[tuple[ModelConfig, str]]:
    """Every (endpoint, model) to try in order: each provider's model, its fallback, then the next provider."""
    out: list[tuple[ModelConfig, str]] = []
    node: ModelConfig | None = cfg
    while node is not None:
        out += [(node, m) for m in (node.model, node.fallback_model) if m]
        node = node.next
    return out


def _groq(timeout: float) -> ModelConfig | None:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    return ModelConfig(GROQ_OPENAI_URL, key, os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"), None, timeout)


def model_config() -> ModelConfig | None:
    """None when no credentials are configured: the API then serves replay/offline modes only."""
    timeout = float(os.environ.get("LLM_TIMEOUT_SECONDS", "45"))
    key = os.environ.get("LLM_API_KEY")
    groq = _groq(timeout)
    if key:
        main = ModelConfig(
            os.environ.get("LLM_BASE_URL", GEMINI_OPENAI_URL), key,
            os.environ.get("LLM_MODEL", "gemini-3.5-flash-lite"), os.environ.get("LLM_FALLBACK_MODEL", "gemini-3.5-flash"), timeout,
        )
        if groq is None:
            return main
        # Groq joins as the last resort before offline unless LLM_PRIMARY=groq puts it first.
        if os.environ.get("LLM_PRIMARY", "").lower() == "groq":
            return replace(groq, next=main)
        return replace(main, next=groq)
    if groq is not None:
        return groq
    gw = os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN")
    if gw:
        return ModelConfig(AI_GATEWAY_URL, gw, os.environ.get("LLM_MODEL", "anthropic/claude-sonnet-5"), os.environ.get("LLM_FALLBACK_MODEL"), timeout)
    return None

