"""The live desk the risk gate reads (06 §10 GateContext), computed from the DB and the clock.

Only for real runs (LLM_MODE=live / DEMO_MODE=false, see agents/feed_run.py): the demo keeps the
seeded desk so replay stays byte-identical. What it fills in:

- equity, free cash, daily P&L and drawdown: the paper book marked to market (risk/book.py);
- R04 `restrictions_age_h`: now − the last restriction refresh (core.restriction_refresh); no refresh
  recorded = unknown = stale (06 R04: no buy while the restrictions are unknown);
- R11 `kap_delay_s`: how late we saw the disclosure (available_at − published_at);
- R09 `last_price` / `price_age_s`: the latest raw level (today's intraday bar, else the daily mark);
  its age counts only while the session is open (06 R09);
- P7 `daily_entries`: today's (Istanbul) SimBIST buy orders that were not cancelled or rejected;
- P3/P4 `sector_exposure_pct` / `group_exposure_pct`: open positions + reserved orders of the same
  sector / group over equity; an unknown group counts the whole sector (conservative), an unknown
  sector the whole book.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.prices.calendar import IST, SESSION_OPEN, CalendarRangeError, is_trading_day, session_close
from kaptan.prices.reads import latest_mark
from kaptan.risk.book import BookSnapshot, Exposure, effective_drawdown, paper_book

UNKNOWN_AGE: Final = math.inf

REFRESH_SQL: Final = "SELECT max(refreshed_at) AS at FROM core.restriction_refresh"
MARK_REFRESH_SQL: Final = """
INSERT INTO core.restriction_refresh (source, refreshed_at, n_rows) VALUES (%s, %s, %s)
ON CONFLICT (source) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at, n_rows = EXCLUDED.n_rows
"""
ENTRIES_SQL: Final = """
SELECT count(*) AS n FROM trading.orders
 WHERE broker = 'simbist' AND side = 'buy' AND status NOT IN ('canceled', 'rejected')
   AND created_at >= %s AND created_at < %s
"""
INTRADAY_SQL: Final = """
SELECT close, ts FROM core.prices_intraday
 WHERE ticker = %s AND ts <= %s AND ts >= %s AND fetched_at <= %s ORDER BY ts DESC LIMIT 1
"""
RESET_SQL: Final = "SELECT reset_at, reset_equity FROM trading.risk_state WHERE id = 1"
ISSUER_SQL: Final = """
SELECT i.sector, coalesce(g.group_name, i.group_name) AS group_name
  FROM core.issuers i LEFT JOIN core.issuer_groups g ON g.ticker = i.ticker WHERE i.ticker = %s
"""


@dataclass(frozen=True, slots=True)
class LiveDesk:
    equity_try: Decimal
    cash_free_try: Decimal
    daily_pnl_pct: Decimal
    drawdown_pct: Decimal
    n_open_positions: int
    holds_ticker: bool
    last_price: Decimal | None
    price_age_s: float
    restrictions_age_h: float
    kap_delay_s: float
    daily_entries: int
    sector_exposure_pct: Decimal
    group_exposure_pct: Decimal
    #: 06 §11 step 4: a confirmed restart still in force (the monitor clears reset_at back inside −2.5 %).
    reset_active: bool = False


def is_session_open(now: datetime) -> bool:
    """Continuous trading (10:00 → close, half days to 12:30) on a BIST session day."""
    local = now.astimezone(IST)
    try:
        if not is_trading_day(local.date()):
            return False
    except CalendarRangeError:
        return False
    return datetime.combine(local.date(), SESSION_OPEN, IST) <= local <= session_close(local.date())


def istanbul_day_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = datetime.combine(now.astimezone(IST).date(), time(0), IST)
    return start, start + timedelta(days=1)


async def _one(conn: AsyncConnection[Any], sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def mark_restrictions_refreshed(conn: AsyncConnection[Any], source: str, at: datetime, n_rows: int) -> None:
    """For the restriction (tedbir) refresh job: record a successful refresh of `source` at `at`."""
    await conn.execute(MARK_REFRESH_SQL, (source, at, n_rows))


async def restrictions_age_h(conn: AsyncConnection[Any], now: datetime) -> float:
    row = await _one(conn, REFRESH_SQL)
    at: datetime | None = None if row is None else row["at"]
    if at is None:
        return UNKNOWN_AGE
    return max(0.0, (now - at).total_seconds() / 3600)


async def daily_entries(conn: AsyncConnection[Any], now: datetime) -> int:
    row = await _one(conn, ENTRIES_SQL, istanbul_day_bounds(now))
    return int(row["n"]) if row else 0


def exposure_pct(book: BookSnapshot, sector: str | None, group: str | None) -> tuple[Decimal, Decimal]:
    """(sector, group) exposure over equity; unknown group → the sector's, unknown sector → the whole book."""
    if book.equity <= 0:
        return Decimal(1), Decimal(1)
    items: tuple[Exposure, ...] = book.exposures()
    total = sum((e.value for e in items), Decimal(0))
    in_sector = total if sector is None else sum((e.value for e in items if e.sector == sector), Decimal(0))
    in_group = in_sector if group is None else sum((e.value for e in items if e.group == group), Decimal(0))
    return in_sector / book.equity, in_group / book.equity


async def latest_price(
    conn: AsyncConnection[Any], ticker: str, now: datetime
) -> tuple[Decimal | None, datetime | None]:
    """The freshest raw level known at `now`: today's intraday bar (core.prices_intraday, if a job fills
    it) when it is newer than the daily mark (open from 10:15, close from 18:30), else the daily mark."""
    mark = await latest_mark(conn, ticker, now)
    start, _end = istanbul_day_bounds(now)
    bar = await _one(conn, INTRADAY_SQL, (ticker, now, start, now))
    if bar is not None and (mark is None or bar["ts"] > mark.known_at):
        return Decimal(str(bar["close"])), bar["ts"]
    if mark is None:
        return None, None
    return Decimal(str(mark.price)), mark.known_at


async def live_desk(
    conn: AsyncConnection[Any],
    ticker: str,
    now: datetime,
    *,
    published_at: datetime,
    available_at: datetime,
    capital: Decimal | float,
) -> LiveDesk:
    book = await paper_book(conn, now, capital=capital)
    reset = await _one(conn, RESET_SQL) or {"reset_at": None, "reset_equity": None}
    reset_equity = None if reset["reset_equity"] is None else Decimal(str(reset["reset_equity"]))
    drawdown = effective_drawdown(book, reset_equity, reset_active=reset["reset_at"] is not None)
    issuer = await _one(conn, ISSUER_SQL, (ticker,))
    sector_pct, group_pct = exposure_pct(
        book, None if issuer is None else issuer["sector"], None if issuer is None else issuer["group_name"]
    )
    price, priced_at = await latest_price(conn, ticker, now)
    session = is_session_open(now)
    if price is None or priced_at is None:
        age = UNKNOWN_AGE if session else 0.0
    else:
        age = max(0.0, (now - priced_at).total_seconds()) if session else 0.0
    return LiveDesk(
        equity_try=book.equity,
        cash_free_try=book.free_cash,
        daily_pnl_pct=book.daily_pnl_pct,
        drawdown_pct=drawdown,
        n_open_positions=len(book.holdings),
        holds_ticker=any(h.ticker == ticker for h in book.holdings),
        last_price=price,
        price_age_s=age,
        restrictions_age_h=await restrictions_age_h(conn, now),
        kap_delay_s=max(0.0, (available_at - published_at).total_seconds()),
        daily_entries=await daily_entries(conn, now),
        sector_exposure_pct=sector_pct,
        group_exposure_pct=group_pct,
        reset_active=reset["reset_at"] is not None,
    )
