"""Mirror of kaptan-panel/src/lib/company/company.ts (company page, search, disclosure reading)."""

from __future__ import annotations

from typing import Literal

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, PosInt, Ticker
from kaptan.domain.schemas.disclosure import DisclosureListItem, DisclosureText


class Following(KModel):
    in_universe: bool
    #: False when the universe has no row for this code yet (a new or unusual company).
    known: bool
    reasons_tr: list[str]


class PricePoint(KModel):
    d: IsoDate
    close: float


class PriceLine(KModel):
    period: Literal["1m", "3m", "1y", "all"]
    points: list[PricePoint]
    last_close: float | None
    last_day: IsoDate | None
    change_pct: float | None


class PriceStats(KModel):
    """The quiet numbers of the stored prices; each may be absent. The year range is corrected for bonus issues."""

    as_of: IsoDate
    day_low: float | None
    day_high: float | None
    volume: float | None
    year_low: float | None
    year_high: float | None
    year_low_day: IsoDate | None
    year_high_day: IsoDate | None
    #: Stored trading days the year range rests on; under about 240 the "year" is shorter than a year.
    year_days: int
    #: The last close against the year high, in percent (<= 0).
    from_high_pct: float | None
    adjusted: bool


class PriceBenchmark(KModel):
    """BIST 100 closes over the same days as the price line; absent when none are stored."""

    name: str
    points: list[PricePoint]


class InsiderEvent(KModel):
    """A KAP disclosure KAPtan classed as a buyback (E1) or an insider/main-owner share purchase (E2)."""

    kind: Literal["buyback", "insider"]
    disclosure: DisclosureListItem


class OwnPosition(KModel):
    qty: PosInt
    avg_cost: float
    last_price: float | None
    gain_try: float | None
    gain_pct: float | None
    since: IsoDateTime


class PastDecision(KModel):
    run_id: str
    disclosure_index: PosInt
    decision: Literal["suggested", "held", "no_trade", "vetoed"]
    event_type: str | None
    why_tr: str
    at: IsoDateTime
    proposal_id: str | None
    approval_status: str | None
    side: Literal["buy", "sell"] | None


class Company(KModel):
    ticker: Ticker
    name: str
    sector: str | None
    market: str | None
    following: Following
    watched: bool
    price: PriceLine
    stats: PriceStats | None
    benchmark: PriceBenchmark | None
    insiders: list[InsiderEvent]
    position: OwnPosition | None
    disclosures: list[DisclosureListItem]
    decisions: list[PastDecision]


class CompanyHit(KModel):
    ticker: Ticker
    name: str
    sector: str


class DisclosureHit(KModel):
    disclosure_index: PosInt
    ticker: Ticker | None
    company_name: str
    subject: str
    published_at: IsoDateTime


class SearchResult(KModel):
    q: str
    companies: list[CompanyHit]
    disclosures: list[DisclosureHit]


class ExtractedNumber(KModel):
    name: str
    value: float


class DisclosureReading(DisclosureListItem):
    """One disclosure in full: the text, the numbers KAPtan read out of it and what it did with it."""

    texts: list[DisclosureText]
    numbers: list[ExtractedNumber]
    decision: Literal["suggested", "held", "no_trade", "vetoed"] | None
    proposal_id: str | None
    approval_status: str | None
    side: Literal["buy", "sell"] | None
