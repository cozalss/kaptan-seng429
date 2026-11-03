"""The DeepSeek cost cap is a real ceiling: priced at peak, and a call that may still be billed counts in full."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import pytest

from kaptan.agents.nodes._common import failure_note
from kaptan.llm.budget import Budget, BudgetExceededError, Caps
from kaptan.llm.provider import LLMRequest, ProviderError
from kaptan.llm.registry import default_models
from kaptan.llm.store import MemoryStore
from kaptan.llm.structured import StructuredProvider

DEEPSEEK = default_models().providers["deepseek"]
PEAK_MISS, PEAK_OUT = 0.30, 1.20  # https://api-docs.deepseek.com/quick_start/pricing, read 2026-11-03
ATTEMPTS = 1 + DEEPSEEK.max_retries


def request() -> LLMRequest:
    return LLMRequest(
        agent="classifier",
        prompt_version="classifier@1.1.0",
        inputs={"ticker": "ORNEK"},
        document="Bildirim metni. " * 50,
        context={"ticker": "ORNEK"},
        max_output_tokens=1_500,
    )


class TimesOut:
    """Every try times out at the client; the provider may have billed each of them."""

    name = "deepseek"
    model_id = "deepseek-flash"

    def __init__(self) -> None:
        self.calls = 0

    async def generate(
        self, system: str, messages: Sequence[Any], schema: Mapping[str, Any] | None, max_tokens: int
    ) -> Any:
        self.calls += 1
        raise ProviderError("deepseek: timeout", provider="deepseek")


def provider(client: TimesOut, usd: float) -> tuple[StructuredProvider, Budget]:
    budget = Budget(MemoryStore(), {"deepseek": Caps(usd_per_day=usd)})
    made = StructuredProvider(client, budget, pricing=DEEPSEEK.price_usd_per_mtok, max_attempts=ATTEMPTS)
    return made, budget


def test_deepseek_is_priced_at_its_peak_rate() -> None:
    price = DEEPSEEK.price_usd_per_mtok
    assert price is not None and (price.input_cache_miss, price.output) == (PEAK_MISS, PEAK_OUT)


async def test_a_call_that_failed_is_charged_as_if_every_try_was_billed() -> None:
    client = TimesOut()
    made, budget = provider(client, usd=10.0)
    with pytest.raises(ProviderError):
        await made.complete(request())
    assert client.calls == 1
    charged = (await budget.usage("deepseek")).cost_usd
    assert charged >= ATTEMPTS * 1_500 * PEAK_OUT / 1_000_000


async def test_no_call_starts_unless_its_worst_case_fits_under_the_cap() -> None:
    client = TimesOut()
    one_try_only = 1_500 * PEAK_OUT / 1_000_000 * 1.5  # enough for one billed try, not for all of them
    made, _budget = provider(client, usd=one_try_only)
    with pytest.raises(BudgetExceededError):
        await made.complete(request())
    assert client.calls == 0


async def test_spend_stays_under_the_cap_however_many_calls_fail() -> None:
    client = TimesOut()
    made, budget = provider(client, usd=0.05)
    for _ in range(1_000):
        try:
            await made.complete(request())
        except BudgetExceededError:
            break
        except ProviderError:
            continue
    usage = await budget.usage("deepseek")
    assert 0 < usage.cost_usd <= 0.05


def test_the_trace_says_when_the_quota_is_the_reason() -> None:
    assert failure_note(BudgetExceededError("deepseek", "cost")) == "Günlük model kotası doldu: HOLD"
    assert failure_note(ProviderError("x", provider="groq")) == "Model yanıt vermedi: HOLD"
