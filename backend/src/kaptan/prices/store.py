"""Idempotent upserts into core.prices_daily / core.corporate_actions (natural keys, 07 §4)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.prices.models import CorporateAction, DailyBar

BAR_COLUMNS: Final = (
    "ticker", "d", "open", "high", "low", "close", "volume", "turnover_try", "mcap_try",
    "free_float_mcap_try", "capital_try", "ref_adj_close", "price_basis", "source", "open_source",
)  # fmt: skip
UPSERT_BAR: Final = f"""
INSERT INTO core.prices_daily ({", ".join(BAR_COLUMNS)}, fetched_at)
VALUES ({", ".join(["%s"] * len(BAR_COLUMNS))}, %s)
ON CONFLICT (ticker, d, source) DO UPDATE SET
  {", ".join(f"{c} = EXCLUDED.{c}" for c in BAR_COLUMNS[2:] if c not in ("source", "open_source", "open", "volume"))},
  open = COALESCE(EXCLUDED.open, core.prices_daily.open),
  volume = COALESCE(EXCLUDED.volume, core.prices_daily.volume),
  open_source = COALESCE(EXCLUDED.open_source, core.prices_daily.open_source),
  fetched_at = EXCLUDED.fetched_at
"""  # noqa: S608 - column names are module constants; every value is a bound parameter

ACTION_COLUMNS: Final = (
    "ticker", "ex_date", "kind", "factor", "source", "bonus_capital_pct", "rights_pct", "cash_gross", "note",
)  # fmt: skip
UPSERT_ACTION: Final = f"""
INSERT INTO core.corporate_actions ({", ".join(ACTION_COLUMNS)}, fetched_at)
VALUES ({", ".join(["%s"] * len(ACTION_COLUMNS))}, %s)
ON CONFLICT (ticker, ex_date, kind) DO UPDATE SET
  {", ".join(f"{c} = EXCLUDED.{c}" for c in ACTION_COLUMNS[3:])}, fetched_at = EXCLUDED.fetched_at
"""  # noqa: S608 - same as above


async def upsert_bars(conn: AsyncConnection[Any], bars: Sequence[DailyBar], fetched_at: datetime) -> int:
    """Insert or refresh bars. On conflict `open`/`volume` are only overwritten by a non-null value
    (an İş Yatırım-only refresh must not erase the open merged from Yahoo earlier)."""
    if not bars:
        return 0
    params = [(*tuple(getattr(b, c) for c in BAR_COLUMNS), fetched_at) for b in bars]
    async with conn.cursor() as cur:
        await cur.executemany(UPSERT_BAR, params)
    return len(params)


async def upsert_actions(conn: AsyncConnection[Any], actions: Sequence[CorporateAction], fetched_at: datetime) -> int:
    if not actions:
        return 0
    params = [(*tuple(getattr(a, c) for c in ACTION_COLUMNS), fetched_at) for a in actions]
    async with conn.cursor() as cur:
        await cur.executemany(UPSERT_ACTION, params)
    return len(params)
