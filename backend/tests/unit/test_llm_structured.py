"""StructuredProvider: prompts, budget, one repair attempt, usage and cost accounting."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from kaptan.domain.schemas.agents import ClassifierOutput, ContractExtraction
from kaptan.llm.budget import BudgetExceededError, Caps
from kaptan.llm.clients import GeminiClient, Message, OpenAICompatClient, RawAnswer
from kaptan.llm.provider import LLMRequest, ProviderError
from kaptan.llm.replay import default_cassette
from kaptan.llm.structured import StructuredProvider, event_type_of, prompt_for
from kaptan.llm.transport import InvalidOutputError, QuotaExhaustedError
from tests.unit.llm_support import DEEPSEEK_URL, GEMINI_URL, MODELS, chat_body, fresh_budget, gemini_body, no_sleep

REC = next(r for r in default_cassette()._by_fp.values() if r.run_id == "run-demo-e3-ornek")
CLASSIFIER = dict(REC.outputs["classifier"])


def _request(agent: str = "classifier", schema: Any = ClassifierOutput, **kw: Any) -> LLMRequest:
    return LLMRequest(
        agent=agent, prompt_version=f"{agent}@1.1.0", inputs={"ticker": "ORNEK"}, output_schema=schema,
        document="Şirketimiz sözleşme imzalamıştır.", context={"ticker": "ORNEK"}, max_output_tokens=500, **kw,
    )  # fmt: skip


class _Scripted:
    """A ModelClient that replays scripted texts (or raises) and records what it was sent."""

    name = "scripted"
    model_id = "scripted-1"

    def __init__(self, *answers: str | Exception) -> None:
        self.answers = list(answers)
        self.sent: list[Sequence[Message]] = []

    async def generate(
        self, system: str, messages: Sequence[Message], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> RawAnswer:
        self.sent.append(messages)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return RawAnswer(answer, self.model_id, 100, 50, 10, cache_hit_in=20)


async def test_valid_answer_with_usage_and_prompt_hash() -> None:
    budget = fresh_budget()
    provider = StructuredProvider(_Scripted(json.dumps(CLASSIFIER)), budget)
    result = await provider.complete(_request())
    assert result.output["event_type"] == "E3"
    assert (result.usage.tokens_in, result.usage.tokens_out, result.usage.model_id) == (100, 50, "scripted-1")
    assert result.extra["repaired"] is False
    assert result.extra["prompt_sha256"] == prompt_for(_request()).sha256
    assert (await budget.usage("scripted")).requests == 1


async def test_one_repair_attempt_then_success() -> None:
    client = _Scripted("not json at all", "```json\n" + json.dumps(CLASSIFIER) + "\n```")
    result = await StructuredProvider(client, fresh_budget()).complete(_request())
    assert result.extra["repaired"] is True
    assert result.usage.tokens_in == 200  # both calls billed
    retry = client.sent[1]
    assert [m.role for m in retry] == ["user", "assistant", "user"]
    assert "Doğrulama hatası" in retry[2].content


async def test_schema_mismatch_twice_is_a_retryable_failure() -> None:
    bad = json.dumps({**CLASSIFIER, "event_type": "E9"})
    with pytest.raises(InvalidOutputError) as err:
        await StructuredProvider(_Scripted(bad, bad), fresh_budget()).complete(_request())
    assert err.value.retryable
    assert "event_type" in str(err.value)


async def test_invalid_output_without_text_repairs_without_assistant_turn() -> None:
    client = _Scripted(InvalidOutputError("groq: x", provider="groq"), json.dumps(CLASSIFIER))
    result = await StructuredProvider(client, fresh_budget()).complete(_request())
    assert [m.role for m in client.sent[1]] == ["user", "user"]
    assert result.output["status"] == "ok"


async def test_budget_caps_and_daily_quota() -> None:
    budget = fresh_budget(scripted=Caps(requests_per_day=1))
    provider = StructuredProvider(_Scripted(json.dumps(CLASSIFIER), "x"), budget)
    await provider.complete(_request())
    with pytest.raises(BudgetExceededError):
        await provider.complete(_request())
    quota = StructuredProvider(_Scripted(QuotaExhaustedError("q", provider="scripted")), fresh_budget())
    with pytest.raises(QuotaExhaustedError):
        await quota.complete(_request())
    assert (await quota._budget.usage("scripted")).exhausted
    with pytest.raises(BudgetExceededError, match="provider quota"):
        await quota.complete(_request())


async def test_missing_prompt_is_not_retryable() -> None:
    with pytest.raises(ProviderError) as err:
        await StructuredProvider(_Scripted(), fresh_budget()).complete(_request(agent="oracle", schema=None))
    assert not err.value.retryable


def test_reader_event_type_from_context_or_schema() -> None:
    assert event_type_of(_request("reader", ContractExtraction)) == "E3"
    assert event_type_of(LLMRequest("reader", "reader@1.1.0", {}, context={"event_type": "E1"})) == "E1"
    assert event_type_of(LLMRequest("x", "x@1", {})) is None
    assert "E3 YENİ İŞ İLİŞKİSİ" in prompt_for(_request("reader", ContractExtraction)).template


@respx.mock
async def test_gemini_end_to_end_and_deepseek_cost() -> None:
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json=gemini_body(CLASSIFIER)))
    async with httpx.AsyncClient() as http:
        gem = GeminiClient("gemini", MODELS.providers["gemini"], SecretStr("k"), http, sleep=no_sleep)
        result = await StructuredProvider(gem, fresh_budget()).complete(_request())
        assert result.output["sub_type"] == CLASSIFIER["sub_type"] and result.extra["cost_usd"] == 0.0
        spec = MODELS.providers["deepseek"]
        respx.post(DEEPSEEK_URL).mock(
            return_value=httpx.Response(
                200, json=chat_body(CLASSIFIER, model=spec.model, tokens_in=1_000, tokens_out=200, cache_hit=400)
            )
        )
        budget = fresh_budget(deepseek=Caps(usd_per_day=1.0))
        ds = OpenAICompatClient("deepseek", spec, SecretStr("k"), http, sleep=no_sleep)
        priced = await StructuredProvider(ds, budget, pricing=spec.price_usd_per_mtok).complete(_request())
    assert spec.price_usd_per_mtok is not None
    expected = spec.price_usd_per_mtok.cost_usd(1_000, 200, 400)
    assert priced.extra["cost_usd"] == pytest.approx(expected, abs=1e-6)
    assert (await budget.usage("deepseek")).cost_usd == pytest.approx(expected, abs=1e-6)


async def test_deepseek_cost_cap_blocks_before_calling() -> None:
    spec = MODELS.providers["deepseek"]
    client = _Scripted(json.dumps(CLASSIFIER))
    tiny = fresh_budget(scripted=Caps(usd_per_day=1e-9))
    with pytest.raises(BudgetExceededError, match="cost"):
        await StructuredProvider(client, tiny, pricing=spec.price_usd_per_mtok).complete(_request())
    assert client.sent == []
