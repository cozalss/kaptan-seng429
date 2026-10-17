"""The LLM provider interface every agent node calls (05 §2.4, `_KANONIK-KARARLAR` model chain).

M1 ships one provider, `ReplayProvider` (llm/replay.py): recorded outputs keyed by agent + prompt
version + input hash. M2 adds Gemini Flash-Lite, Groq gpt-oss and DeepSeek behind the same
`LLMProvider` protocol and chains them with `ProviderChain` (Flash-Lite ⇄ Groq → … → HOLD):

    provider = ProviderChain([GeminiProvider(...), GroqProvider(...)])      # M2
    result = await provider.complete(LLMRequest(agent="reader", prompt_version="reader@1.1.0",
                                                 inputs={...}, output_schema=ContractExtraction))

A provider returns the parsed JSON object and its usage; it never raises for a model refusal, only
`ProviderError` (retryable or not) — the node turns an exhausted chain into HOLD (05 §2.4).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, ValidationError


@dataclass(frozen=True, slots=True)
class LLMRequest:
    """One structured call. `inputs` must be JSON-serialisable; it is what the cache/replay key hashes."""

    agent: str  # node code name (05): classifier, reader, materiality, evidence, skeptic, compliance, guard
    prompt_version: str  # "reader@1.1.0" (prompt manifest, 05 §9)
    inputs: Mapping[str, Any]
    output_schema: type[BaseModel] | None = None
    run_id: str | None = None
    max_output_tokens: int = 2_048
    #: Live mode only (never part of the replay key): the untrusted disclosure text the model reads
    #: (masked and fenced by the live provider) and trusted, structured task context (05 §2.3).
    document: str | None = None
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LLMUsage:
    model_id: str | None
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    cached: bool = False


@dataclass(frozen=True, slots=True)
class LLMResult:
    output: Mapping[str, Any]
    usage: LLMUsage
    provider: str = ""
    extra: Mapping[str, Any] = field(default_factory=dict)


class ProviderError(Exception):
    """A provider could not answer. `retryable` → the chain tries the next provider."""

    def __init__(self, message: str, *, provider: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    async def complete(self, request: LLMRequest) -> LLMResult: ...


def request_key(request: LLMRequest) -> str:
    """sha256 over agent + prompt version + canonical inputs: the replay key (and the M2 cache key)."""
    canonical = json.dumps(
        {"agent": request.agent, "prompt_version": request.prompt_version, "inputs": request.inputs},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_output(request: LLMRequest, output: Mapping[str, Any], *, provider: str) -> Mapping[str, Any]:
    """Schema-check a provider's JSON (never trust model output); a mismatch is a non-retryable error."""
    if request.output_schema is None:
        return output
    try:
        request.output_schema.model_validate(dict(output))
    except ValidationError as exc:
        raise ProviderError(f"{request.agent}: output does not match its schema", provider=provider) from exc
    return output


class ProviderChain:
    """Try providers in order; the first answer wins. All failed → the last error propagates."""

    name = "chain"

    def __init__(self, providers: Sequence[LLMProvider]) -> None:
        if not providers:
            raise ValueError("a provider chain needs at least one provider")
        self._providers = tuple(providers)

    async def complete(self, request: LLMRequest) -> LLMResult:
        last: ProviderError | None = None
        for provider in self._providers:
            try:
                return await provider.complete(request)
            except ProviderError as exc:
                last = exc
                if not exc.retryable:
                    raise
        assert last is not None
        raise last
