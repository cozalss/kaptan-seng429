"""Mirror of kaptan-panel/src/lib/domain/agenda.ts (the calendar and the market strip)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, Ticker

EventKind = Literal["dividend_pay", "dividend_ex", "general_meeting", "report_window", "rate_decision"]


class CalendarEvent(KModel):
    id: str
    day: IsoDate
    kind: EventKind
    ticker: Ticker | None
    why: Literal["held", "watched"] | None
    title: str
    detail: str
    source_url: str | None
    approximate: bool


class Calendar(KModel):
    from_: IsoDate = Field(alias="from", serialization_alias="from")
    to: IsoDate
    events: list[CalendarEvent]
    notes: list[str]


class IndexQuote(KModel):
    level: float
    change_pct: float | None
    day: IsoDate


class FxQuote(KModel):
    rate: float
    day: IsoDate
    published_at: IsoDateTime


class MarketState(KModel):
    open: bool
    label: str
    next_open_day: IsoDate | None


class MarketStrip(KModel):
    as_of: IsoDateTime
    market: MarketState
    index: IndexQuote | None
    usd_try: FxQuote | None
