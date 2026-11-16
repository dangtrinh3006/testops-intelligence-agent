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


def _resp(status: int, headers: dict | None = None):
    import httpx
    body = {"choices": [{"message": {"content": "ok"}}]} if status == 200 else {"error": {"message": "busy"}}
    return httpx.Response(status, json=body, headers=headers or {})


def test_transient_5xx_is_retried_once_in_place(monkeypatch):
    from app.agent import client
    calls, sleeps = [], []
    seq = iter([_resp(503), _resp(200)])
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: calls.append(1) or next(seq))
    monkeypatch.setattr(client.time, "sleep", sleeps.append)
    out = client.chat(_cfg(), "m", [{"role": "user", "content": "q"}])
    assert out["message"]["content"] == "ok" and len(calls) == 2 and sleeps == [2.0]


def test_retry_after_is_capped_and_second_failure_fails_over(monkeypatch):
    import pytest

    from app.agent import client
    seq = iter([_resp(429, {"retry-after": "60"}), _resp(503)])
    sleeps = []
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: next(seq))
    monkeypatch.setattr(client.time, "sleep", sleeps.append)
    with pytest.raises(client.ModelError) as e:
        client.chat(_cfg(), "m", [{"role": "user", "content": "q"}])
    assert e.value.status == 503 and sleeps == [client.MAX_BACKOFF_S]


def test_client_errors_are_not_retried(monkeypatch):
    import pytest

    from app.agent import client
    calls = []
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: calls.append(1) or _resp(400))
    with pytest.raises(client.ModelError):
        client.chat(_cfg(), "m", [{"role": "user", "content": "q"}])
    assert len(calls) == 1


def _cfg():
    from app.agent.llm import ModelConfig
    return ModelConfig("http://model.invalid/v1", "x", "m", None, 5.0)
