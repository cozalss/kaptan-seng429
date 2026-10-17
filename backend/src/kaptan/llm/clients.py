"""Thin HTTP clients for the live models (plain httpx, no vendor SDKs): one `generate()` per vendor API.

- `GeminiClient`: Gemini API `models/{model}:generateContent`, key in the `x-goog-api-key` header (never
  the URL), JSON mode with `responseJsonSchema` (the agent's schema), thinking level from the registry.
- `OpenAICompatClient`: `/chat/completions` of DeepSeek and Groq (`Authorization: Bearer`), JSON mode
  (`json_object`, schema in the system prompt) or Groq's best-effort `json_schema`.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from pydantic import SecretStr

from kaptan.llm.provider import ProviderError
from kaptan.llm.registry import ProviderSpec
from kaptan.llm.transport import InvalidOutputError, Sleep, post_json


@dataclass(frozen=True, slots=True)
class Message:
    role: str  # "user" | "assistant"
    content: str


@dataclass(frozen=True, slots=True)
class RawAnswer:
    text: str
    model_id: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    cache_hit_in: int = 0


class ModelClient(Protocol):
    name: str
    model_id: str

    async def generate(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> RawAnswer: ...


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


class GeminiClient:
    def __init__(
        self, name: str, spec: ProviderSpec, key: SecretStr, http: httpx.AsyncClient, *, sleep: Sleep | None = None
    ) -> None:
        self.name, self.model_id = name, spec.model
        self._spec, self._key, self._http = spec, key, http
        self._sleep: Sleep = sleep or asyncio.sleep

    def _payload(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> dict[str, Any]:
        config: dict[str, Any] = {"responseMimeType": "application/json", "maxOutputTokens": max_tokens}
        if schema is not None:
            config["responseJsonSchema"] = dict(schema)
        if self._spec.thinking_level is not None:
            config["thinkingConfig"] = {"thinkingLevel": self._spec.thinking_level.upper()}
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]} for m in messages
        ]
        return {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": config}

    async def generate(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> RawAnswer:
        url = f"{self._spec.base_url.rstrip('/')}/models/{self._spec.model}:generateContent"
        headers = {"x-goog-api-key": self._key.get_secret_value(), "Content-Type": "application/json"}
        reply = await post_json(
            self._http,
            url,
            provider=self.name,
            headers=headers,
            payload=self._payload(system, messages, schema, max_tokens),
            timeout_s=self._spec.timeout_s,
            max_retries=self._spec.max_retries,
            sleep=self._sleep,
        )
        body = reply.body
        candidates = body.get("candidates") or []
        if not candidates:
            reason = (body.get("promptFeedback") or {}).get("blockReason", "no candidates")
            raise ProviderError(f"{self.name}: empty answer ({reason})", provider=self.name)
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        usage = body.get("usageMetadata") or {}
        return RawAnswer(
            text=text,
            model_id=str(body.get("modelVersion") or self._spec.model),
            tokens_in=_int(usage.get("promptTokenCount")),
            tokens_out=_int(usage.get("candidatesTokenCount")) + _int(usage.get("thoughtsTokenCount")),
            latency_ms=reply.latency_ms,
            cache_hit_in=_int(usage.get("cachedContentTokenCount")),
        )


class OpenAICompatClient:
    def __init__(
        self, name: str, spec: ProviderSpec, key: SecretStr, http: httpx.AsyncClient, *, sleep: Sleep | None = None
    ) -> None:
        self.name, self.model_id = name, spec.model
        self._spec, self._key, self._http = spec, key, http
        self._sleep: Sleep = sleep or asyncio.sleep

    def _payload(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> dict[str, Any]:
        spec = self._spec
        if schema is not None and spec.response_format == "json_object":
            system = f"{system}\n\nJSON ŞEMASI (çıktın buna uymalı):\n{json.dumps(schema, ensure_ascii=False)}"
        payload: dict[str, Any] = {
            "model": spec.model,
            "messages": [{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
            "temperature": 0,
            "max_tokens": max_tokens + (spec.reasoning_buffer_tokens if spec.reasoning_effort else 0),
        }
        if schema is not None and spec.response_format == "json_schema":
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "agent_output", "strict": False, "schema": dict(schema)},
            }
        else:
            payload["response_format"] = {"type": "json_object"}
        if spec.reasoning_effort is not None:
            payload["reasoning_effort"] = spec.reasoning_effort
            payload["include_reasoning"] = False
        return payload

    async def generate(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> RawAnswer:
        url = f"{self._spec.base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {self._key.get_secret_value()}", "Content-Type": "application/json"}
        reply = await post_json(
            self._http,
            url,
            provider=self.name,
            headers=headers,
            payload=self._payload(system, messages, schema, max_tokens),
            timeout_s=self._spec.timeout_s,
            max_retries=self._spec.max_retries,
            sleep=self._sleep,
        )
        body = reply.body
        choices = body.get("choices") or []
        if not choices:
            raise ProviderError(f"{self.name}: empty answer", provider=self.name)
        message = choices[0].get("message") or {}
        text = message.get("content") or ""
        if not text.strip():
            raise InvalidOutputError(f"{self.name}: empty content", provider=self.name)
        usage = body.get("usage") or {}
        return RawAnswer(
            text=text,
            model_id=str(body.get("model") or self._spec.model),
            tokens_in=_int(usage.get("prompt_tokens")),
            tokens_out=_int(usage.get("completion_tokens")),
            latency_ms=reply.latency_ms,
            cache_hit_in=_int(usage.get("prompt_cache_hit_tokens")),
        )
