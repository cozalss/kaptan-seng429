"""`GET /me/overview` (backend-only, single-user dashboard): one call with the numbers a personal home
screen needs. The panel mirrors these names; there is no zod source for it yet (the contract is this file).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel


class EquityPoint(KModel):
    date: IsoDate
    equity: float


class Allocation(KModel):
    symbol: str
    name: str
    amount: float = Field(ge=0)
    weight: float = Field(ge=0)
    pnl_pct: float


class OpenSuggestion(KModel):
    id: str
    symbol: str
    action: Literal["al", "tut", "sat"]
    reason_short: str
    confidence: float = Field(ge=0, le=1)
    expires_at: IsoDateTime | None


class MeOverview(KModel):
    capital_start: float = Field(gt=0)
    equity_now: float
    cash: float = Field(ge=0)
    pnl_abs: float
    pnl_pct: float
    equity_series: list[EquityPoint]
    allocations: list[Allocation]
    open_suggestions: list[OpenSuggestion]


class SuggestionHoldInput(KModel):
    """`POST /me/suggestions/{id}/hold`: keep things as they are ("Tut") or skip a suggestion; audited."""

    kind: Literal["held", "skipped"] = "held"
    note: str = Field(default="", max_length=500)


class SuggestionHoldOut(KModel):
    id: str
    kind: Literal["held", "skipped"]
    at: IsoDateTime
