"""Mirror of kaptan-panel/src/lib/domain/reading.ts (saved / unread disclosures, the two-company compare)."""

from __future__ import annotations

from typing import Literal

from kaptan.domain.schemas._base import IsoDateTime, KModel, NonNegInt, PosInt, Ticker
from kaptan.domain.schemas.company import PriceLine, PriceStats


class ReadingState(KModel):
    """What the person has and has not read. `unread` counts disclosures of starred or held companies."""

    read_through: IsoDateTime
    unread: NonNegInt
    #: The newest unread ones (at most 500), for the "yeni" mark on rows.
    unread_indexes: list[PosInt]
    saved_indexes: list[PosInt]


class EventCounts(KModel):
    """KAP disclosures of the last 90 days, by what KAPtan thought they were."""

    total: NonNegInt
    buyback: NonNegInt
    insider: NonNegInt
    deal: NonNegInt
    earnings: NonNegInt


class CompareSide(KModel):
    ticker: Ticker
    name: str
    sector: str | None
    price: PriceLine
    stats: PriceStats | None
    events: EventCounts


class Compare(KModel):
    period: Literal["1m", "3m", "1y", "all"]
    a: CompareSide
    b: CompareSide
