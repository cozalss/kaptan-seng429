"""Mirror of kaptan-panel/src/lib/company/watchlist.ts (the person's watchlist)."""

from __future__ import annotations

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, Ticker


class WatchItem(KModel):
    """One starred company with today's quiet numbers; every number may be absent (no price yet)."""

    ticker: Ticker
    name: str
    added_at: IsoDateTime
    last_close: float | None
    price_day: IsoDate | None
    change_pct: float | None
    newest_disclosure_at: IsoDateTime | None
