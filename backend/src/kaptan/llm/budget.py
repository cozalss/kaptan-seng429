"""The quota guard (04 Q5, 05 §1.5, 09 RB-6): per-provider daily request / token / cost caps.

Before a call the chain *reserves* a request (atomic HINCRBY, rolled back when over the cap) and checks
the token and cost estimates against today's totals; after the call it records the real usage. A
provider over any cap — or one that answered "daily quota exhausted" — is skipped for the rest of the
(UTC) day; when every provider is skipped the agent fails and the run HOLDs (canonical: quota gone →
HOLD, never a crash, never a second account).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Final

from kaptan.llm.provider import ProviderError
from kaptan.llm.store import KVStore

COUNTER_TTL_S: Final = 3 * 24 * 3600
MICRO: Final = 1_000_000

Today = Callable[[], date]


def utc_today() -> date:
    return datetime.now(UTC).date()


class BudgetExceededError(ProviderError):
    """This provider's daily cap is reached: skip it (the chain tries the next one)."""

    def __init__(self, provider: str, what: str) -> None:
        super().__init__(f"{provider}: daily {what} cap reached", provider=provider, retryable=True)
        self.what = what


@dataclass(frozen=True, slots=True)
class Caps:
    requests_per_day: int | None = None
    tokens_per_day: int | None = None
    usd_per_day: float | None = None


@dataclass(frozen=True, slots=True)
class DayUsage:
    provider: str
    day: str
    requests: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    exhausted: bool
    caps: Caps

    @property
    def tokens(self) -> int:
        return self.tokens_in + self.tokens_out


class Budget:
    def __init__(self, store: KVStore, caps: Mapping[str, Caps], *, today: Today = utc_today) -> None:
        self._store = store
        self._caps = dict(caps)
        self._today = today

    def caps(self, provider: str) -> Caps:
        return self._caps.get(provider, Caps())

    def _key(self, provider: str) -> str:
        return f"kaptan:llm:usage:{self._today().isoformat()}:{provider}"

    async def _incr(self, provider: str, fld: str, amount: int) -> int:
        return await self._store.incr(self._key(provider), fld, amount, ttl_s=COUNTER_TTL_S)

    async def usage(self, provider: str) -> DayUsage:
        raw = await self._store.hgetall(self._key(provider))
        return DayUsage(
            provider=provider,
            day=self._today().isoformat(),
            requests=raw.get("req", 0),
            tokens_in=raw.get("tok_in", 0),
            tokens_out=raw.get("tok_out", 0),
            cost_usd=raw.get("cost_micro", 0) / MICRO,
            exhausted=raw.get("exhausted", 0) > 0,
            caps=self.caps(provider),
        )

    async def reserve(self, provider: str, *, est_tokens: int = 0, est_cost_usd: float = 0.0) -> None:
        """Count one request against today's cap, or raise `BudgetExceededError` (nothing counted)."""
        caps, now = self.caps(provider), await self.usage(provider)
        if now.exhausted:
            raise BudgetExceededError(provider, "provider quota")
        if caps.tokens_per_day is not None and now.tokens + est_tokens > caps.tokens_per_day:
            raise BudgetExceededError(provider, "token")
        if caps.usd_per_day is not None and now.cost_usd + est_cost_usd > caps.usd_per_day:
            raise BudgetExceededError(provider, "cost")
        count = await self._incr(provider, "req", 1)
        if caps.requests_per_day is not None and count > caps.requests_per_day:
            await self._incr(provider, "req", -1)
            raise BudgetExceededError(provider, "request")

    async def record(self, provider: str, *, tokens_in: int, tokens_out: int, cost_usd: float = 0.0) -> None:
        if tokens_in:
            await self._incr(provider, "tok_in", tokens_in)
        if tokens_out:
            await self._incr(provider, "tok_out", tokens_out)
        if cost_usd > 0:
            await self._incr(provider, "cost_micro", round(cost_usd * MICRO))

    async def mark_exhausted(self, provider: str) -> None:
        await self._incr(provider, "exhausted", 1)

    async def snapshot(self, providers: tuple[str, ...]) -> list[DayUsage]:
        return [await self.usage(p) for p in providers]
