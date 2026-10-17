"""The `guard` agent in live mode (09 §3 L2+L3, 05 §8): Llama Prompt Guard 2 on Groq + Turkish rules.

The (masked) text is cut into ≤ 512-token chunks (`chunk_chars`), at most `max_chunks` calls; the score
is the maximum. Prompt Guard does not officially support Turkish, so the rule list
(`injection_rules_tr`) runs on the whole text and a hit lifts the score to `rule_score` (0.95), above the
graph's 0.90 quarantine line: a flagged text goes guard → compliance (RET) and never reaches a trade.
If Prompt Guard is unreachable or out of quota, the score is rules-only (09 RB-6) and `extra` says so.
Unknown classifier output fails closed (score 1.0).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Final

import httpx
from pydantic import SecretStr

from kaptan.llm.budget import Budget
from kaptan.llm.injection_rules_tr import rule_hits
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage, ProviderError
from kaptan.llm.registry import GuardSpec, ProviderSpec
from kaptan.llm.transport import QuotaExhaustedError, Sleep, post_json

log = logging.getLogger("kaptan.llm")
GUARD_PROVIDER: Final = "prompt_guard"
_MALICIOUS: Final = frozenset({"MALICIOUS", "JAILBREAK", "INJECTION", "UNSAFE"})
_BENIGN: Final = frozenset({"BENIGN", "SAFE"})


def to_score(content: str | None) -> float:
    raw = (content or "").strip().upper()
    if raw in _MALICIOUS:
        return 1.0
    if raw in _BENIGN:
        return 0.0
    try:
        value = float(raw)
    except ValueError:
        return 1.0  # fail closed: unknown output = suspicious
    return min(1.0, max(0.0, value))


def chunks(text: str, size: int, limit: int) -> list[str]:
    parts = [text[i : i + size] for i in range(0, len(text), size)] or [""]
    return parts[:limit]


class PromptGuardClient:
    def __init__(
        self, groq: ProviderSpec, spec: GuardSpec, key: SecretStr, http: httpx.AsyncClient, budget: Budget,
        *, sleep: Sleep | None = None,
    ) -> None:  # fmt: skip
        self._url = f"{groq.base_url.rstrip('/')}/chat/completions"
        self._spec, self._key, self._http, self._budget = spec, key, http, budget
        self._sleep: Sleep = sleep or asyncio.sleep
        self.model_id = spec.model

    async def score(self, text: str) -> tuple[float, int, int]:
        """(max score, chunks scored, total latency ms)."""
        headers = {"Authorization": f"Bearer {self._key.get_secret_value()}", "Content-Type": "application/json"}
        best, latency, parts = 0.0, 0, chunks(text, self._spec.chunk_chars, self._spec.max_chunks)
        for part in parts:
            await self._budget.reserve(GUARD_PROVIDER)
            payload = {"model": self._spec.model, "messages": [{"role": "user", "content": part}]}
            try:
                reply = await post_json(
                    self._http, self._url, provider=GUARD_PROVIDER, headers=headers, payload=payload,
                    timeout_s=self._spec.timeout_s, max_retries=1,
                    sleep=self._sleep,
                )  # fmt: skip
            except QuotaExhaustedError:
                await self._budget.mark_exhausted(GUARD_PROVIDER)
                raise
            choices = reply.body.get("choices") or [{}]
            best = max(best, to_score((choices[0].get("message") or {}).get("content")))
            latency += reply.latency_ms
        return best, len(parts), latency


class GuardProvider:
    """Answers `agent="guard"` requests with `{"injection_score": float}` (the graph's contract)."""

    name = "guard"

    def __init__(self, client: PromptGuardClient | None, spec: GuardSpec) -> None:
        self._client = client
        self._spec = spec

    async def complete(self, request: LLMRequest) -> LLMResult:
        text = request.document or ""
        hits = rule_hits(text)
        extra: dict[str, Any] = {"rule_hits": [f"{h.rule}: “{h.excerpt}”" for h in hits]}
        pg_score: float | None = None
        n_chunks = latency = 0
        if self._client is not None:
            try:
                pg_score, n_chunks, latency = await self._client.score(text)
            except ProviderError as exc:  # 09 RB-6: Prompt Guard down → rules only
                log.warning("prompt guard unavailable, rules only: %s", exc)
                extra["prompt_guard"] = "unavailable"
        else:
            extra["prompt_guard"] = "not_configured"
        rule_score = self._spec.rule_score if hits else 0.0
        score = max(pg_score or 0.0, rule_score)
        extra |= {"prompt_guard_score": pg_score, "chunks_scored": n_chunks}
        model_id = self._client.model_id if self._client is not None and pg_score is not None else None
        usage = LLMUsage(model_id=model_id, latency_ms=latency)
        return LLMResult(output={"injection_score": round(score, 4)}, usage=usage, provider=self.name, extra=extra)
