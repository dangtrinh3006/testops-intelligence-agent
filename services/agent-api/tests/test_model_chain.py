"""Provider chain: Groq is an extra fallback by default and becomes primary only when asked."""

from app.agent.llm import GEMINI_OPENAI_URL, GROQ_OPENAI_URL, candidates, model_config


def _env(monkeypatch, **kv):
    for k in ("LLM_API_KEY", "GROQ_API_KEY", "LLM_PRIMARY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "LLM_MODEL", "LLM_FALLBACK_MODEL", "GROQ_MODEL"):
        monkeypatch.delenv(k, raising=False)
    for k, v in kv.items():
        monkeypatch.setenv(k, v)


def test_gemini_only_keeps_its_two_models(monkeypatch):
    _env(monkeypatch, LLM_API_KEY="x")
    assert [m for _, m in candidates(model_config())] == ["gemini-3.5-flash-lite", "gemini-3.5-flash"]


def test_groq_is_last_resort_by_default(monkeypatch):
    _env(monkeypatch, LLM_API_KEY="x", GROQ_API_KEY="x")
    chain = candidates(model_config())
    assert [m for _, m in chain] == ["gemini-3.5-flash-lite", "gemini-3.5-flash", "openai/gpt-oss-120b"]
    assert chain[0][0].base_url == GEMINI_OPENAI_URL and chain[-1][0].base_url == GROQ_OPENAI_URL


def test_llm_primary_groq_puts_groq_first(monkeypatch):
    _env(monkeypatch, LLM_API_KEY="x", GROQ_API_KEY="x", LLM_PRIMARY="groq")
    assert [m for _, m in candidates(model_config())] == ["openai/gpt-oss-120b", "gemini-3.5-flash-lite", "gemini-3.5-flash"]


def test_groq_alone_is_enough(monkeypatch):
    _env(monkeypatch, GROQ_API_KEY="x")
    assert [m for _, m in candidates(model_config())] == ["openai/gpt-oss-120b"]
