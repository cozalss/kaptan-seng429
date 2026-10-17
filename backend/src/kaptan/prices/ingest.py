"""Fetch one ticker's window from both sources, merge, derive corporate actions, store.

Used by the backfill CLI and (later) the 18:30 `eod_prices` job. The İş Yatırım request starts one
session before `start` so an action whose ex-date is `start` is still detected (factor = ratio of the
day before / ratio of the ex-date). Both writes run in one transaction per ticker.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.prices import isyatirim, yahoo
from kaptan.prices.calendar import CalendarRangeError, prev_session
from kaptan.prices.corporate_actions import implied_from_isyatirim, reconcile
from kaptan.prices.http import PoliteClient
from kaptan.prices.merge import with_raw_open
from kaptan.prices.models import CorporateAction, DailyBar
from kaptan.prices.store import upsert_actions, upsert_bars

Source = Literal["isyatirim", "yfinance"]
ALL_SOURCES: Final[tuple[Source, ...]] = ("isyatirim", "yfinance")

DELETE_DERIVED_ACTIONS: Final = """
DELETE FROM core.corporate_actions
WHERE ticker = %s AND ex_date > %s AND ex_date <= %s AND source IN ('isyatirim', 'yfinance')
"""


@dataclass(frozen=True, slots=True)
class Fetched:
    ticker: str
    raw: tuple[DailyBar, ...]
    adjusted: tuple[DailyBar, ...]
    actions: tuple[CorporateAction, ...]
    yahoo_zero_volume_dropped: int
    #: Ex-dates in (lo, hi] were fully observable in this fetch: stored derived actions there are replaced.
    action_window: tuple[date, date] | None


@dataclass(frozen=True, slots=True)
class TickerReport:
    ticker: str
    raw_rows: int
    adjusted_rows: int
    actions: tuple[CorporateAction, ...]
    opens_filled: int
    yahoo_zero_volume_dropped: int


async def fetch_ticker(
    client: PoliteClient, ticker: str, start: date, end: date, sources: Collection[Source] = ALL_SOURCES
) -> Fetched:
    raw: list[DailyBar] = []
    series: yahoo.YahooSeries | None = None
    if "isyatirim" in sources:
        try:
            lead = prev_session(start)
        except CalendarRangeError:
            lead = start
        raw = await isyatirim.fetch_daily(client, ticker, lead, end)
    if "yfinance" in sources:
        series = await yahoo.fetch_chart(client, ticker, start, end)
    merged = with_raw_open(raw, series)
    actions = reconcile(implied_from_isyatirim(raw), series, has_isyatirim=bool(raw))
    window = None
    if raw:
        window = (raw[0].d, raw[-1].d)
    elif series is not None and series.bars:
        window = (series.bars[0].d, series.bars[-1].d)
    return Fetched(
        ticker=ticker,
        raw=tuple(merged),
        adjusted=tuple(yahoo.to_adjusted_bars(series)) if series is not None else (),
        actions=tuple(actions),
        yahoo_zero_volume_dropped=series.dropped_zero_volume if series is not None else 0,
        action_window=window,
    )


async def store_fetched(conn: AsyncConnection[Any], fetched: Fetched, fetched_at: datetime) -> TickerReport:
    async with conn.transaction():
        n_raw = await upsert_bars(conn, fetched.raw, fetched_at)
        n_adj = await upsert_bars(conn, fetched.adjusted, fetched_at)
        if fetched.action_window is not None:
            lo, hi = fetched.action_window
            await conn.execute(DELETE_DERIVED_ACTIONS, (fetched.ticker, lo, hi))
        await upsert_actions(conn, fetched.actions, fetched_at)
    return TickerReport(
        ticker=fetched.ticker,
        raw_rows=n_raw,
        adjusted_rows=n_adj,
        actions=fetched.actions,
        opens_filled=sum(1 for b in fetched.raw if b.open is not None),
        yahoo_zero_volume_dropped=fetched.yahoo_zero_volume_dropped,
    )
