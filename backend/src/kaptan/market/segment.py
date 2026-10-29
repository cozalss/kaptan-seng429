"""A stock's BIST market (pazar) at a point in time, for its daily price band (06 §2 [V], 07 §6 "Tavan/taban").

    market = await market_of(conn, "THYAO", now)        # "yildiz" | "ana" | "alt" | ... | None
    pct = await limit_pct_of(conn, "THYAO", now)        # 0.20 / 0.15 / 0.10; unknown → 0.10

Order of sources: the latest KAP "Pazar Değişikliği" known before `at` (core.market_changes, over the
rename chain), then the universe snapshot (core.issuers.market), then the slow profile
(core.issuer_profiles.market). None of them → None, and `daily_limit_pct` falls back to ±10 %
(the narrowest band, see `kaptan.market.ticks`).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.market.ticks import DAILY_LIMIT_BY_MARKET, DAILY_LIMIT_FALLBACK_PCT, daily_limit_pct

MARKET_SQL: Final = """
SELECT COALESCE(
  (SELECT mc.market FROM core.market_changes mc
    WHERE mc.ticker = ANY(core.ticker_codes(%(ticker)s)) AND mc.available_at < %(at)s
    ORDER BY mc.available_at DESC LIMIT 1),
  (SELECT i.market FROM core.issuers i WHERE i.ticker = %(ticker)s),
  (SELECT p.market FROM core.issuer_profiles p WHERE p.ticker = %(ticker)s)
) AS market
"""


async def market_of(conn: AsyncConnection[Any], ticker: str, at: datetime) -> str | None:
    """The market code of `ticker` known before `at`, or None."""
    async with conn.cursor() as cur:
        await cur.execute(MARKET_SQL, {"ticker": ticker, "at": at})
        row = await cur.fetchone()
    if row is None:
        return None
    value = row["market"] if isinstance(row, Mapping) else row[0]
    return None if value is None else str(value)


async def limit_pct_of(
    conn: AsyncConnection[Any],
    ticker: str,
    at: datetime,
    table: Mapping[str, Decimal] = DAILY_LIMIT_BY_MARKET,
    fallback: Decimal = DAILY_LIMIT_FALLBACK_PCT,
) -> Decimal:
    """The daily price band of `ticker`'s market at `at` (unknown market → `fallback`)."""
    return daily_limit_pct(await market_of(conn, ticker, at), table, fallback)


__all__ = ["MARKET_SQL", "limit_pct_of", "market_of"]
