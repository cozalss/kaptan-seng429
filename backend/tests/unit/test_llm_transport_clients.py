"""HTTP layer of the live providers: retries/backoff, error classes, vendor payloads and reply parsing."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from kaptan.llm.clients import GeminiClient, Message, OpenAICompatClient
from kaptan.llm.provider import ProviderError
from kaptan.llm.transport import InvalidOutputError, QuotaExhaustedError, post_json
from tests.unit.llm_support import (
    DEEPSEEK_URL,
    GEMINI_URL,
    GROQ_URL,
    MODELS,
    chat_body,
    gemini_body,
    no_sleep,
)

URL = "https://llm.test/v1/chat"
SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}


async def _post(http: httpx.AsyncClient, retries: int = 2) -> dict[str, object]:
    reply = await post_json(
        http, URL, provider="t", headers={"Authorization": "Bearer secret-x"}, payload={"a": 1},
        timeout_s=5, max_retries=retries, sleep=no_sleep,
    )  # fmt: skip
    return dict(reply.body)


@respx.mock
async def test_retries_5xx_and_429_then_succeeds() -> None:
    route = respx.post(URL).mock(
        side_effect=[
            httpx.Response(503, json={"error": {"message": "overloaded"}}),
            httpx.Response(429, headers={"retry-after": "1"}, json={"error": {"message": "slow down"}}),
            httpx.Response(200, json={"ok": True}),
        ]
    )
    async with httpx.AsyncClient() as http:
        assert await _post(http) == {"ok": True}
    assert route.call_count == 3


@respx.mock
async def test_gives_up_after_max_retries_without_echoing_the_request() -> None:
    respx.post(URL).mock(return_value=httpx.Response(500, json={"error": {"message": "boom"}}))
    async with httpx.AsyncClient() as http:
        with pytest.raises(ProviderError) as err:
            await _post(http, retries=1)
    assert "HTTP 500: boom" in str(err.value)
    assert "secret-x" not in str(err.value)
    assert err.value.retryable


@respx.mock
async def test_daily_quota_and_long_rate_limits_are_not_retried() -> None:
    route = respx.post(URL).mock(
        return_value=httpx.Response(429, json={"error": {"message": "Quota exceeded: GenerateRequestsPerDay"}})
    )
    async with httpx.AsyncClient() as http:
        with pytest.raises(QuotaExhaustedError):
            await _post(http)
        assert route.call_count == 1
        route.mock(return_value=httpx.Response(429, headers={"retry-after": "3600"}, text="later"))
        with pytest.raises(ProviderError, match="rate limited for 3600s"):
            await _post(http)


@respx.mock
async def test_client_errors_are_final_and_groq_schema_failures_are_invalid_output() -> None:
    route = respx.post(URL).mock(return_value=httpx.Response(401, text="nope"))
    async with httpx.AsyncClient() as http:
        with pytest.raises(ProviderError, match="HTTP 401"):
            await _post(http)
        assert route.call_count == 1
        route.mock(return_value=httpx.Response(400, json={"error": {"code": "json_validate_failed", "message": "x"}}))
        with pytest.raises(InvalidOutputError):
            await _post(http)
        route.mock(return_value=httpx.Response(200, text="<html>"))
        with pytest.raises(ProviderError, match="non-JSON"):
            await _post(http)
        route.mock(return_value=httpx.Response(200, json=[1, 2]))
        assert await _post(http) == {"data": [1, 2]}


@respx.mock
async def test_timeouts_retry_then_fail() -> None:
    route = respx.post(URL).mock(side_effect=[httpx.ReadTimeout("slow"), httpx.Response(200, json={"ok": 1})])
    async with httpx.AsyncClient() as http:
        assert await _post(http) == {"ok": 1}
        route.mock(side_effect=httpx.ConnectError("down"))
        with pytest.raises(ProviderError, match="ConnectError"):
            await _post(http, retries=1)


def _gemini(http: httpx.AsyncClient) -> GeminiClient:
    from pydantic import SecretStr

    return GeminiClient("gemini", MODELS.providers["gemini"], SecretStr("test-gemini-key"), http, sleep=no_sleep)


def _chat(name: str, http: httpx.AsyncClient) -> OpenAICompatClient:
    from pydantic import SecretStr

    return OpenAICompatClient(name, MODELS.providers[name], SecretStr(f"test-{name}-key"), http, sleep=no_sleep)  # type: ignore[index]


@respx.mock
async def test_gemini_payload_and_usage() -> None:
    route = respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json=gemini_body({"ok": True}, thoughts=7)))
    async with httpx.AsyncClient() as http:
        raw = await _gemini(http).generate("SYS", [Message("user", "U"), Message("assistant", "A")], SCHEMA, 300)
    req = route.calls.last.request
    assert req.headers["x-goog-api-key"] == "test-gemini-key"
    assert "key=" not in str(req.url)
    body = json.loads(req.content)
    assert body["systemInstruction"]["parts"][0]["text"] == "SYS"
    assert [c["role"] for c in body["contents"]] == ["user", "model"]
    cfg = body["generationConfig"]
    assert cfg["responseMimeType"] == "application/json"
    assert cfg["responseJsonSchema"] == SCHEMA
    assert cfg["maxOutputTokens"] == 300
    assert cfg["thinkingConfig"] == {"thinkingLevel": "MINIMAL"}
    assert (raw.text, raw.tokens_in, raw.tokens_out) == ('{"ok": true}', 120, 67)
    assert raw.model_id == MODELS.providers["gemini"].model


@respx.mock
async def test_gemini_blocked_prompt_is_a_provider_error() -> None:
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}))
    async with httpx.AsyncClient() as http:
        with pytest.raises(ProviderError, match="SAFETY"):
            await _gemini(http).generate("S", [Message("user", "U")], None, 10)


@respx.mock
async def test_deepseek_json_object_mode_carries_the_schema_in_the_system_prompt() -> None:
    model = MODELS.providers["deepseek"].model
    route = respx.post(DEEPSEEK_URL).mock(
        return_value=httpx.Response(200, json=chat_body({"ok": True}, model=model, cache_hit=40))
    )
    async with httpx.AsyncClient() as http:
        raw = await _chat("deepseek", http).generate("SYS", [Message("user", "U")], SCHEMA, 150)
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer test-deepseek-key"
    body = json.loads(req.content)
    assert body["response_format"] == {"type": "json_object"}
    assert "JSON ŞEMASI" in body["messages"][0]["content"]
    assert body["max_tokens"] == 150 and body["temperature"] == 0
    assert "reasoning_effort" not in body
    assert (raw.tokens_in, raw.tokens_out, raw.cache_hit_in) == (90, 40, 40)


@respx.mock
async def test_groq_json_schema_mode_with_reasoning_budget() -> None:
    spec = MODELS.providers["groq"]
    route = respx.post(GROQ_URL).mock(return_value=httpx.Response(200, json=chat_body({"ok": True}, model=spec.model)))
    async with httpx.AsyncClient() as http:
        await _chat("groq", http).generate("SYS", [Message("user", "U")], SCHEMA, 200)
    body = json.loads(route.calls.last.request.content)
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == SCHEMA
    assert body["max_tokens"] == 200 + spec.reasoning_buffer_tokens
    assert body["reasoning_effort"] == "low" and body["include_reasoning"] is False
    assert body["messages"][0]["content"] == "SYS"


@respx.mock
async def test_chat_empty_answers() -> None:
    model = MODELS.providers["groq"].model
    route = respx.post(GROQ_URL).mock(return_value=httpx.Response(200, json={"choices": []}))
    async with httpx.AsyncClient() as http:
        client = _chat("groq", http)
        with pytest.raises(ProviderError, match="empty answer"):
            await client.generate("S", [Message("user", "U")], None, 10)
        route.mock(return_value=httpx.Response(200, json=chat_body("  ", model=model)))
        with pytest.raises(InvalidOutputError):
            await client.generate("S", [Message("user", "U")], None, 10)


# ── replies recorded once by the live smoke test (tests/fixtures/llm, bodies only) ──────────────────
RECORDED = Path(__file__).resolve().parents[1] / "fixtures" / "llm"


def _recorded(name: str) -> list[dict[str, object]]:
    data: list[dict[str, object]] = json.loads((RECORDED / f"{name}.json").read_text(encoding="utf-8"))
    return data


@respx.mock
async def test_recorded_real_replies_parse() -> None:
    from kaptan.llm.jsonout import parse_object

    gem = _recorded("gemini_generate_content")[0]
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json=gem))
    respx.post(DEEPSEEK_URL).mock(return_value=httpx.Response(200, json=_recorded("deepseek_chat_completion")[0]))
    respx.post(GROQ_URL).mock(return_value=httpx.Response(200, json=_recorded("groq_chat_completion")[0]))
    async with httpx.AsyncClient() as http:
        g = await _gemini(http).generate("S", [Message("user", "U")], SCHEMA, 600)
        assert parse_object(g.text, provider="gemini")["event_type"] == "E3" and g.tokens_in > 0
        for name in ("deepseek", "groq"):
            raw = await _chat(name, http).generate("S", [Message("user", "U")], SCHEMA, 150)
            assert parse_object(raw.text, provider=name) == {"binding": True, "amount_try": 412500000}
            assert raw.model_id == MODELS.providers[name].model  # type: ignore[index]


def test_recorded_prompt_guard_contents_are_probabilities() -> None:
    from kaptan.llm.guard import to_score

    scores = [to_score(b["choices"][0]["message"]["content"]) for b in _recorded("prompt_guard_chat_completion")]  # type: ignore[index]
    assert scores[0] < 0.01 and scores[1] > 0.99
