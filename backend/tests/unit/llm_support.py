"""Offline helpers for the live-LLM tests: fake keys, vendor reply bodies, a respx responder that answers
each agent with its recorded demo output (tests never reach a real provider; respx blocks the network).

Reply shapes follow the vendors' documented JSON (Gemini generateContent, OpenAI-compatible
chat/completions) and the bodies recorded once by the live smoke test (no headers, no keys).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Final

import httpx
from pydantic import SecretStr

from kaptan.llm.budget import Budget, Caps
from kaptan.llm.registry import default_models
from kaptan.llm.store import MemoryStore
from kaptan.settings import Settings, get_settings

MODELS = default_models()
GEMINI_URL: Final = f"{MODELS.providers['gemini'].base_url}/models/{MODELS.providers['gemini'].model}:generateContent"
DEEPSEEK_URL: Final = f"{MODELS.providers['deepseek'].base_url}/chat/completions"
GROQ_URL: Final = f"{MODELS.providers['groq'].base_url}/chat/completions"
FAKE_KEYS: Final = {"gemini": "test-gemini-key", "deepseek": "test-deepseek-key", "groq": "test-groq-key"}

#: role marker in the system prompt → agent (prompts/v1.1.0/*.md).
ROLE_MARKERS: Final = {
    "SINIFLANDIRICI": "classifier",
    "OKUYUCU": "reader",
    "ÖNEMLİLİK": "materiality",
    "EMSAL KANIT": "evidence",
    "ŞÜPHECİ": "skeptic",
    "UYUM İNCELEME": "compliance",
}


def fake_settings(**keys: str | None) -> Settings:
    chosen = {**FAKE_KEYS, **keys}
    return get_settings().model_copy(
        update={f"{name}_api_key": None if v is None else SecretStr(v) for name, v in chosen.items()}
    )


def fresh_budget(**caps: Caps) -> Budget:
    return Budget(MemoryStore(), caps)


async def no_sleep(_: float) -> None:
    return None


def gemini_body(obj: Any, *, tokens_in: int = 120, tokens_out: int = 60, thoughts: int = 0) -> dict[str, Any]:
    text = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    return {
        "candidates": [{"content": {"parts": [{"text": text}], "role": "model"}, "finishReason": "STOP", "index": 0}],
        "usageMetadata": {
            "promptTokenCount": tokens_in,
            "candidatesTokenCount": tokens_out,
            "thoughtsTokenCount": thoughts,
            "totalTokenCount": tokens_in + tokens_out + thoughts,
        },
        "modelVersion": MODELS.providers["gemini"].model,
        "responseId": "test-response",
    }


def chat_body(obj: Any, *, model: str, tokens_in: int = 90, tokens_out: int = 40, cache_hit: int = 0) -> dict[str, Any]:
    text = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    usage: dict[str, Any] = {
        "prompt_tokens": tokens_in,
        "completion_tokens": tokens_out,
        "total_tokens": tokens_in + tokens_out,
    }
    if cache_hit:
        usage["prompt_cache_hit_tokens"] = cache_hit
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": usage,
    }


def system_text(request: httpx.Request) -> str:
    body = json.loads(request.content)
    if "systemInstruction" in body:
        return str(body["systemInstruction"]["parts"][0]["text"])
    return str(body["messages"][0]["content"])


def agent_of(request: httpx.Request) -> str:
    text = system_text(request)
    for marker, agent in ROLE_MARKERS.items():
        if marker in text:
            return agent
    raise AssertionError("unknown prompt role")


class RecordedAgents:
    """respx side effects: Gemini / Groq answer every agent with `outputs[agent]`; Prompt Guard scores."""

    def __init__(self, outputs: Mapping[str, Mapping[str, Any]], guard_score: str = "0.0123") -> None:
        self.outputs = outputs
        self.guard_score = guard_score
        self.calls: list[tuple[str, str]] = []  # (vendor, agent)
        self.documents: list[str] = []

    def gemini(self, request: httpx.Request) -> httpx.Response:
        assert "key=" not in str(request.url)  # the key travels in the header only
        agent = agent_of(request)
        self.calls.append(("gemini", agent))
        body = json.loads(request.content)
        self.documents.append(body["contents"][0]["parts"][0]["text"])
        return httpx.Response(200, json=gemini_body(self.outputs[agent]))

    def groq(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["model"] == MODELS.guard.model:
            self.calls.append(("prompt_guard", "guard"))
            self.documents.append(body["messages"][0]["content"])
            return httpx.Response(200, json=chat_body(self.guard_score, model=MODELS.guard.model, tokens_out=1))
        agent = agent_of(request)
        self.calls.append(("groq", agent))
        self.documents.append(body["messages"][1]["content"])
        return httpx.Response(200, json=chat_body(self.outputs[agent], model=MODELS.providers["groq"].model))
