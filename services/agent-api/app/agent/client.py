"""Thin OpenAI-compatible chat client that keeps assistant messages verbatim.

Gemini 3 attaches a `thought_signature` (extra_content) to tool calls and rejects the next turn if it
is not sent back. Generic wrappers drop unknown fields, so messages are kept as raw dicts here.
"""

from __future__ import annotations

import json
import time

import httpx

from .llm import ModelConfig


class ModelError(RuntimeError):
    def __init__(self, status: int | None, message: str):
        super().__init__(f"{status}: {message}")
        self.status = status


def chat(cfg: ModelConfig, model: str, messages: list[dict], tools: list[dict] | None = None,
         tool_choice: str | dict | None = None, max_tokens: int = 2000) -> dict:
    # Reasoning text returned by some providers (gpt-oss on Groq) is not accepted back as input.
    messages = [{k: v for k, v in m.items() if k != "reasoning"} for m in messages]
    body: dict = {"model": model, "messages": messages, "temperature": 0, "max_tokens": max_tokens}
    if tools:
        body["tools"] = tools
        if tool_choice:
            body["tool_choice"] = tool_choice
    url = cfg.base_url.rstrip("/") + "/chat/completions"
    for attempt in range(2):
        try:
            r = httpx.post(url, headers={"Authorization": f"Bearer {cfg.api_key}"}, json=body, timeout=cfg.timeout_s)
        except httpx.TimeoutException:
            raise ModelError(None, "timeout") from None
        except httpx.HTTPError as e:
            raise ModelError(None, type(e).__name__) from None
        if r.status_code == 429 and attempt == 0:
            time.sleep(4)  # one short backoff for free-tier rate limits, then fail over
            continue
        if r.status_code >= 400:
            try:
                msg = r.json().get("error", {}).get("message", "")[:300] if isinstance(r.json(), dict) else ""
            except (ValueError, json.JSONDecodeError):
                msg = ""
            raise ModelError(r.status_code, msg or "provider error")
        data = r.json()
        msg = data["choices"][0]["message"]
        msg.setdefault("role", "assistant")
        if msg.get("content") is None:
            msg["content"] = ""
        return {"message": msg, "usage": data.get("usage", {})}
    raise ModelError(429, "rate limited")
