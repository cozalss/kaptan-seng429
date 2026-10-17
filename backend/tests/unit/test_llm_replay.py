"""The provider interface and replay mode: keys, misses, schema checks, the fallback chain."""

from __future__ import annotations

from typing import Any

import pytest

from kaptan.domain.schemas.agents import ClassifierOutput, SkepticOutput
from kaptan.llm import get_provider
from kaptan.llm.provider import (
    LLMProvider,
    LLMRequest,
    LLMResult,
    LLMUsage,
    ProviderChain,
    ProviderError,
    request_key,
)
from kaptan.llm.replay import Cassette, ReplayMissError, ReplayProvider, agent_inputs, default_cassette, prompt_version
from tests.unit.agent_fixtures import fixture_run


def _text(run_id: str) -> tuple[str, str]:
    e = fixture_run(run_id)["explain"]
    return e["run"]["ticker"], next(t["body"] for t in e["texts"] if t["lang"] == "tr")


def _request(agent: str, run_id: str = "run-demo-e3-ornek", schema: Any = None) -> LLMRequest:
    ticker, text = _text(run_id)
    return LLMRequest(agent, prompt_version(agent), agent_inputs(ticker, text), output_schema=schema)


async def test_replay_answers_the_recorded_classifier() -> None:
    provider = ReplayProvider()
    result = await provider.complete(_request("classifier", schema=ClassifierOutput))
    assert result.output["event_type"] == "E3"
    assert result.usage == LLMUsage("groq/gpt-oss-120b", 1800, 210, 1900, True)
    assert result.provider == "replay"
    assert isinstance(provider, LLMProvider)


async def test_a_changed_text_is_a_miss_not_a_guess() -> None:
    ticker, text = _text("run-demo-e3-ornek")
    req = LLMRequest("reader", prompt_version("reader"), agent_inputs(ticker, text + " (değişti)"))
    with pytest.raises(ReplayMissError) as err:
        await ReplayProvider().complete(req)
    assert err.value.agent == "reader"
    assert err.value.retryable is False


async def test_schema_mismatch_is_a_provider_error() -> None:
    with pytest.raises(ProviderError, match="schema"):
        await ReplayProvider().complete(_request("classifier", schema=SkepticOutput))


def test_keys_are_stable_and_input_sensitive() -> None:
    a = _request("reader")
    assert request_key(a) == request_key(_request("reader"))
    assert request_key(a) != request_key(_request("materiality"))
    assert len(default_cassette()) == len(Cassette.from_runs_file())
    assert default_cassette().recording("0" * 64) is None


class _Down:
    name = "down"

    def __init__(self, retryable: bool) -> None:
        self.retryable = retryable
        self.calls = 0

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.calls += 1
        raise ProviderError("unavailable", provider=self.name, retryable=self.retryable)


async def test_chain_falls_back_then_gives_up() -> None:
    down = _Down(retryable=True)
    chain = ProviderChain([down, ReplayProvider()])
    result = await chain.complete(_request("skeptic"))
    assert result.output["size_multiplier"] == 0.5
    assert down.calls == 1
    with pytest.raises(ProviderError, match="unavailable"):
        await ProviderChain([_Down(True), _Down(True)]).complete(_request("skeptic"))
    fatal = _Down(retryable=False)
    with pytest.raises(ProviderError):
        await ProviderChain([fatal, ReplayProvider()]).complete(_request("skeptic"))
    with pytest.raises(ValueError, match="at least one"):
        ProviderChain([])


def test_get_provider() -> None:
    from kaptan.llm.live import LiveProvider

    assert isinstance(get_provider("replay"), ReplayProvider)
    live = get_provider("live")
    assert isinstance(live, LiveProvider)
    assert get_provider("live") is live  # one per process (shared cache, counters, connections)
    with pytest.raises(ValueError, match="unknown LLM_MODE"):
        get_provider("ghost")
