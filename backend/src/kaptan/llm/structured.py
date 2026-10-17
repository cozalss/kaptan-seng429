"""`StructuredProvider`: one live model behind the `LLMProvider` protocol.

Per request: load the versioned prompt → reserve budget → call → record usage → parse + schema-check.
Invalid JSON / schema mismatch gets exactly one repair attempt on the same model (05 §2.4: previous raw
output + the validation error + "return only the corrected JSON"); a second failure is a retryable
`ProviderError`, so the chain may try the next provider. A daily-quota 429 marks the provider exhausted.
The text it receives is already masked (the live router masks before any provider sees it).
"""

from __future__ import annotations

import typing
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from kaptan.llm.budget import Budget
from kaptan.llm.clients import Message, ModelClient, RawAnswer
from kaptan.llm.jsonout import parse_object, portable_schema, repair_message, validate_against
from kaptan.llm.prompts import PromptNotFoundError, PromptSpec, load_prompt, new_nonce, render_user
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage, ProviderError
from kaptan.llm.registry import Pricing
from kaptan.llm.transport import InvalidOutputError, QuotaExhaustedError

CHARS_PER_TOKEN = 3  # conservative for Turkish text (≈1.5–2× English token use, 05 §1.5)


def event_type_of(request: LLMRequest) -> str | None:
    """The Reader's event type: from the trusted context, else the schema's `kind` literal."""
    declared = request.context.get("event_type")
    if isinstance(declared, str):
        return declared
    schema = request.output_schema
    if schema is None or "kind" not in schema.model_fields:
        return None
    args = typing.get_args(schema.model_fields["kind"].annotation)
    return str(args[0]) if args else None


def prompt_for(request: LLMRequest) -> PromptSpec:
    try:
        return load_prompt(request.prompt_version, event_type_of(request))
    except PromptNotFoundError as exc:
        raise ProviderError(f"prompt: {exc}", provider="prompts", retryable=False) from None


@dataclass(slots=True)
class _Tally:
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0
    model_id: str = ""


class StructuredProvider:
    def __init__(self, client: ModelClient, budget: Budget, *, pricing: Pricing | None = None) -> None:
        self.name = client.name
        self._client = client
        self._budget = budget
        self._pricing = pricing

    def _estimate(self, chars: int, max_tokens: int) -> tuple[int, float]:
        est_in = chars // CHARS_PER_TOKEN
        cost = 0.0 if self._pricing is None else self._pricing.cost_usd(est_in, max_tokens)
        return est_in + max_tokens, cost

    async def _call(
        self, system: str, messages: list[Message], schema: Mapping[str, Any] | None, max_tokens: int, tally: _Tally
    ) -> RawAnswer:
        chars = len(system) + sum(len(m.content) for m in messages)
        est_tokens, est_cost = self._estimate(chars, max_tokens)
        await self._budget.reserve(self.name, est_tokens=est_tokens, est_cost_usd=est_cost)
        try:
            raw = await self._client.generate(system, messages, schema, max_tokens)
        except QuotaExhaustedError:
            await self._budget.mark_exhausted(self.name)
            raise
        cost = 0.0 if self._pricing is None else self._pricing.cost_usd(raw.tokens_in, raw.tokens_out, raw.cache_hit_in)
        await self._budget.record(self.name, tokens_in=raw.tokens_in, tokens_out=raw.tokens_out, cost_usd=cost)
        tally.tokens_in += raw.tokens_in
        tally.tokens_out += raw.tokens_out
        tally.latency_ms += raw.latency_ms
        tally.cost_usd += cost
        tally.model_id = raw.model_id
        return raw

    def _check(self, schema: type[BaseModel] | None, raw: RawAnswer) -> dict[str, Any]:
        return validate_against(schema, parse_object(raw.text, provider=self.name), provider=self.name)

    async def complete(self, request: LLMRequest) -> LLMResult:
        prompt = prompt_for(request)
        nonce = new_nonce()
        system = prompt.system(nonce)
        user = Message("user", render_user(request.context, request.document or "", nonce))
        schema = None if request.output_schema is None else portable_schema(request.output_schema)
        tally = _Tally(model_id=self._client.model_id)
        repaired = False
        raw: RawAnswer | None = None
        try:
            raw = await self._call(system, [user], schema, request.max_output_tokens, tally)
            output = self._check(request.output_schema, raw)
        except InvalidOutputError as first:
            repaired = True
            history = [user] if raw is None else [user, Message("assistant", raw.text)]
            retry = [*history, Message("user", repair_message(first))]
            output = self._check(
                request.output_schema, await self._call(system, retry, schema, request.max_output_tokens, tally)
            )
        usage = LLMUsage(
            model_id=tally.model_id,
            tokens_in=tally.tokens_in,
            tokens_out=tally.tokens_out,
            latency_ms=tally.latency_ms,
        )
        extra = {"prompt_sha256": prompt.sha256, "repaired": repaired, "cost_usd": round(tally.cost_usd, 6)}
        return LLMResult(output=output, usage=usage, provider=self.name, extra=extra)
