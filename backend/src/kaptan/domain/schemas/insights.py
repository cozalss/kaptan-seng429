"""Mirror of kaptan-panel/src/lib/domain/insights.ts (what Param says about the person's own money)."""

from __future__ import annotations

from typing import Final, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, Ticker

MIN_CONCENTRATION_PCT: Final = 5
MAX_CONCENTRATION_PCT: Final = 100
DEFAULT_CONCENTRATION_PCT: Final = 25
NOTE_MIN: Final = 3
NOTE_MAX: Final = 500


class AllocationHolding(KModel):
    ticker: str
    company: str
    sector: str | None
    value_try: float
    pct: float


class AllocationSector(KModel):
    sector: str
    value_try: float
    pct: float
    tickers: list[str]


class Allocation(KModel):
    started: bool
    equity_try: float
    cash_try: float
    cash_pct: float
    holdings: list[AllocationHolding]
    sectors: list[AllocationSector]
    threshold_pct: float
    warning_tr: str | None


class ConcentrationInput(KModel):
    threshold_pct: int = Field(ge=MIN_CONCENTRATION_PCT, le=MAX_CONCENTRATION_PCT)


class ClosedTrade(KModel):
    id: str
    ticker: str
    company: str
    sold_at: IsoDateTime
    qty: int
    cost_try: float
    proceeds_try: float
    gain_try: float
    gain_pct: float | None
    days_held: int | None


class ClosedTrades(KModel):
    trades: list[ClosedTrade]
    wins: int
    losses: int
    win_rate_pct: float | None
    total_gain_try: float
    avg_days_held: float | None
    note_tr: str | None


class DayMove(KModel):
    d: IsoDate
    pct: float


class ReturnStats(KModel):
    available: bool
    reason_tr: str | None
    days: int
    from_: IsoDate | None = Field(alias="from")
    to: IsoDate | None
    twr_pct: float | None
    best_day: DayMove | None
    worst_day: DayMove | None
    max_fall_pct: float | None
    fall_from: IsoDate | None
    fall_to: IsoDate | None
    caveat_tr: str | None


class DividendMonth(KModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    total_try: float


class DividendHolding(KModel):
    ticker: str
    company: str
    last12_try: float
    cost_try: float | None
    yield_on_cost_pct: float | None


class DividendIncome(KModel):
    year: int
    this_year_try: float
    last_year_try: float
    total_try: float
    months: list[DividendMonth]
    holdings: list[DividendHolding]


class VersusItem(KModel):
    key: Literal["you", "usd", "inflation", "deposit"]
    label: str
    pct: float | None
    source_tr: str | None
    hidden_reason_tr: str | None


class Versus(KModel):
    available: bool
    from_: IsoDate | None = Field(alias="from")
    to: IsoDate | None
    items: list[VersusItem]
    reason_tr: str | None


class HoldingNote(KModel):
    ticker: Ticker
    company: str
    body: str
    updated_at: IsoDateTime


class HoldingNotes(KModel):
    notes: list[HoldingNote]


class HoldingNoteInput(KModel):
    body: str = Field(min_length=NOTE_MIN, max_length=NOTE_MAX)
