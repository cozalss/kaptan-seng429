"""`LLM_MODE=live`: the provider the graph gets from `get_provider("live")`.

Every request goes through one choke point:
1. **mask** person names in the disclosure text (KVKK: unmasked text never leaves the machine);
   names the caller knows travel in `context["persons"]` and are stripped before any provider sees it;
2. **cache** lookup (agent, prompt version + template hash, schema, inputs, text hash, context);
3. `guard` → `GuardProvider` (Prompt Guard 2 + Turkish rules); every other agent → its chain from
   `config/models.yaml` (default Gemini Flash-Lite → DeepSeek → Groq gpt-oss; Azure/Ollama slots are TODO),
   each link behind the daily budget; an exhausted chain raises `ProviderError` → the node HOLDs;
4. store the validated answer and queue a usage row (`drain_usage()` → `llm.usage.sync_usage`).
"""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any, Final

from kaptan.llm.budget import Budget, DayUsage
from kaptan.llm.cache import ResponseCache, cache_key
from kaptan.llm.mask_persons import mask_persons
from kaptan.llm.provider import LLMProvider, LLMRequest, LLMResult, ProviderChain, ProviderError
from kaptan.llm.registry import ModelsConfig
from kaptan.llm.structured import prompt_for

GUARD_AGENT: Final = "guard"
PERSONS_KEY: Final = "persons"
MAX_PENDING: Final = 2_000


@dataclass(frozen=True, slots=True)
class UsageEvent:
    at: datetime
    run_id: str | None
    agent: str
    provider: str
    model_id: str | None
    tokens_in: int
    tokens_out: int
    cached: bool
    latency_ms: int
    cost_usd: float


class LiveProvider:
    name = "live"

    def __init__(
        self,
        *,
        models: ModelsConfig,
        providers: Mapping[str, LLMProvider],
        guard: LLMProvider,
        budget: Budget,
        cache: ResponseCache | None = None,
    ) -> None:
        self.models = models
        self.budget = budget
        self._providers = dict(providers)
        self._guard = guard
        self._cache = cache
        self._pending: deque[UsageEvent] = deque(maxlen=MAX_PENDING)

    @property
    def available(self) -> tuple[str, ...]:
        return tuple(self._providers)

    def chain_for(self, agent: str) -> Sequence[LLMProvider]:
        return [self._providers[p] for p in self.models.chain_for(agent) if p in self._providers]

    def _prepare(self, request: LLMRequest) -> tuple[LLMRequest, int]:
        persons = request.context.get(PERSONS_KEY) or ()
        masked = mask_persons(request.document or "", known=[str(p) for p in persons])
        context = {k: v for k, v in request.context.items() if k != PERSONS_KEY}
        limit = self.models.max_output_tokens(request.agent, request.max_output_tokens)
        prepared = replace(request, document=masked.text, context=context, max_output_tokens=limit)
        return prepared, masked.names_masked

    async def _answer(self, request: LLMRequest) -> LLMResult:
        if request.agent == GUARD_AGENT:
            return await self._guard.complete(request)
        chain = self.chain_for(request.agent)
        if not chain:
            raise ProviderError(f"{request.agent}: no live provider configured", provider=self.name, retryable=False)
        return await ProviderChain(chain).complete(request)

    async def complete(self, request: LLMRequest) -> LLMResult:
        prepared, n_masked = self._prepare(request)
        prompt_sha = "" if prepared.agent == GUARD_AGENT else prompt_for(prepared).sha256
        key = cache_key(prepared, prompt_sha)
        if self._cache is not None:
            hit = await self._cache.get(key)
            if hit is not None:
                self._queue(prepared, hit.provider, hit.usage.model_id, 0, 0, cached=True, latency=0, cost=0.0)
                return LLMResult(
                    output=dict(hit.output), usage=hit.usage, provider=hit.provider, extra={"cache": "hit"}
                )
        result = await self._answer(prepared)
        degraded = "prompt_guard" in result.extra  # rules-only guard scores are not cached
        if self._cache is not None and not degraded:
            await self._cache.put(key, result.output, result.usage, result.provider)
        u = result.usage
        cost = float(result.extra.get("cost_usd", 0.0) or 0.0)
        self._queue(prepared, result.provider, u.model_id, u.tokens_in, u.tokens_out, False, u.latency_ms, cost)
        return replace(result, extra={**result.extra, "names_masked": n_masked})

    def _queue(
        self, request: LLMRequest, provider: str, model_id: str | None, tokens_in: int, tokens_out: int,
        cached: bool, latency: int, cost: float,
    ) -> None:  # fmt: skip
        self._pending.append(
            UsageEvent(datetime.now(UTC), request.run_id, request.agent, provider, model_id, tokens_in, tokens_out,
                       cached, latency, cost)
        )  # fmt: skip

    def drain_usage(self) -> list[UsageEvent]:
        events = list(self._pending)
        self._pending.clear()
        return events

    async def usage_today(self) -> list[DayUsage]:
        return await self.budget.snapshot((*self.models.providers, "prompt_guard"))

    def describe(self) -> dict[str, Any]:
        """For logs/health: which providers are live and which models they use (no keys)."""
        return {
            "providers": {name: self.models.providers[name].model for name in self._providers},  # type: ignore[index]
            "guard": self.models.guard.model,
            "default_chain": [p for p in self.models.default_chain if p in self._providers],
        }
