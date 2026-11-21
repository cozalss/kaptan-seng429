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
