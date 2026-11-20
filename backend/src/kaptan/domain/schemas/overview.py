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
    price_as_of: IsoDateTime | None


class OpenSuggestion(KModel):
    id: str
    symbol: str
    action: Literal["al", "tut", "sat"]
    reason_short: str
    confidence: float = Field(ge=0, le=1)
    expires_at: IsoDateTime | None


class MeOverview(KModel):
    """The person's own book. `needs_setup`: the starting money is not entered yet; every money field is 0 and
    the lists are empty. `capital_start` = money put in so far (start + deposits - withdrawals + cost of the
    holdings entered by hand); `pnl_abs` = `equity_now - capital_start`; `prices_as_of` = the oldest "known at"
    time among the prices used for the holdings (null with none)."""

    needs_setup: bool
    capital_start: float = Field(ge=0)
    equity_now: float
    cash: float = Field(ge=0)
    pnl_abs: float
    pnl_pct: float
    prices_as_of: IsoDateTime | None
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
