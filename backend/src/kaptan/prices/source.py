"""`PriceSource`: what portfolio marks (and later SimBIST) depend on instead of a concrete feed.

`DbPriceSource` reads the backfilled/EOD rows in core.prices_daily (raw İş Yatırım levels, point in
time). The demo keeps its deterministic replay marks (`kaptan.portfolio.marks`) unless
`PRICES_LIVE=true`; see backend/README.md §Prices for the switch.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Protocol

from psycopg import AsyncConnection

from kaptan.prices.models import Mark
from kaptan.prices.reads import latest_marks


class PriceSource(Protocol):
    async def latest_marks(self, tickers: Sequence[str], at: datetime) -> dict[str, Mark]: ...


class DbPriceSource:
    """Marks from Postgres on the caller's connection (no extra pool, joins the caller's transaction)."""

    def __init__(self, conn: AsyncConnection[Any]) -> None:
        self._conn = conn

    async def latest_marks(self, tickers: Sequence[str], at: datetime) -> dict[str, Mark]:
        return await latest_marks(self._conn, tickers, at)

    async def latest_mark(self, ticker: str, at: datetime) -> Mark | None:
        return (await self.latest_marks([ticker], at)).get(ticker)
