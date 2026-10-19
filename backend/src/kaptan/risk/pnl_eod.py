"""`pnl_eod` (FR-29, 04 §jobs): the end-of-day row of trading.pnl_daily for the live strategy and its
two baselines, the series the P&L chart and the risk status read.

    rows = await run_pnl_eod(conn, date(2026, 10, 20))         # after 18:30 Istanbul (EOD prices stored)

- `kaptan:v1.1-fwd`: the paper book marked at the session's EOD time (close_known_at), daily return
  against the previous row (or the capital), running peak, drawdown, open positions, today's fills.
- `baseline:xu100_bh`: XU100 buy-and-hold, chained from its previous row (first row: the strategy's
  previous equity) with the index's adjusted close-to-close return; skipped without both closes.
- `baseline:ew_universe`: equal weight over the in-universe issuers with an adjusted close on both
  days (İş Yatırım series, core.prices_daily_adj); skipped when none has.
Idempotent per (strategy, d): a re-run updates the row and keeps its `ord`; new rows get the next
`ord`, so the demo-seeded rows and their order stay as they are.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import close_known_at, is_trading_day, prev_session
from kaptan.prices.reads import adjusted_series
from kaptan.risk.book import CENT, paper_book
from kaptan.risk.desk import istanbul_day_bounds
from kaptan.settings import get_settings

XU100_BH: Final = "baseline:xu100_bh"
EW_UNIVERSE: Final = "baseline:ew_universe"
INDEX: Final = "XU100"

PREV_SQL: Final = """
SELECT equity, peak_equity FROM trading.pnl_daily WHERE strategy = %s AND d < %s ORDER BY d DESC LIMIT 1
"""
UPSERT_SQL: Final = """
INSERT INTO trading.pnl_daily (strategy, d, ord, equity, daily_return, peak_equity, drawdown, n_positions, n_trades)
VALUES (%s, %s, (SELECT coalesce(max(ord), -1) + 1 FROM trading.pnl_daily), %s, %s, %s, %s, %s, %s)
ON CONFLICT (strategy, d) DO UPDATE SET equity = EXCLUDED.equity, daily_return = EXCLUDED.daily_return,
  peak_equity = EXCLUDED.peak_equity, drawdown = EXCLUDED.drawdown, n_positions = EXCLUDED.n_positions,
  n_trades = EXCLUDED.n_trades
"""
TRADES_SQL: Final = """
SELECT count(*) AS n FROM trading.fills f JOIN trading.orders o ON o.id = f.order_id
 WHERE o.broker = 'simbist' AND f.filled_at >= %s AND f.filled_at < %s
"""
EW_SQL: Final = """
SELECT a.ticker, a.d, a.adj_close FROM core.prices_daily_adj a JOIN core.issuers i ON i.ticker = a.ticker
 WHERE i.in_universe AND a.source = 'isyatirim' AND a.d IN (%s, %s)
"""


@dataclass(frozen=True, slots=True)
class PnlRow:
    strategy: str
    d: date
    equity: float
    daily_return: float
    peak_equity: float
    drawdown: float
    n_positions: int = 0
    n_trades: int = 0


async def _prev(conn: AsyncConnection[Any], strategy: str, day: date) -> tuple[Decimal, Decimal] | None:
    async with conn.cursor() as cur:
        await cur.execute(PREV_SQL, (strategy, day))
        row = await cur.fetchone()
    return None if row is None else (Decimal(str(row["equity"])), Decimal(str(row["peak_equity"])))


def chained(strategy: str, day: date, prev: tuple[Decimal, Decimal], ret: Decimal, **kw: int) -> PnlRow:
    """The next point of a series: equity = previous × (1 + ret), running peak, drawdown ≤ 0."""
    equity = (prev[0] * (1 + ret)).quantize(CENT)
    peak = max(prev[1], prev[0], equity)
    drawdown = round(float(min(Decimal(0), equity / peak - 1)), 5)
    return PnlRow(strategy, day, float(equity), round(float(ret), 5), float(peak), drawdown, **kw)


async def _write(conn: AsyncConnection[Any], row: PnlRow) -> None:
    params = (row.equity, row.daily_return, row.peak_equity, row.drawdown, row.n_positions, row.n_trades)
    await conn.execute(UPSERT_SQL, (row.strategy, row.d, *params))


async def _index_return(conn: AsyncConnection[Any], day: date) -> Decimal | None:
    prev = prev_session(day)
    _src, bars = await adjusted_series(conn, INDEX, prev, day)
    if day not in bars or prev not in bars:
        return None
    return Decimal(str(bars[day][1])) / Decimal(str(bars[prev][1])) - 1


async def _ew_return(conn: AsyncConnection[Any], day: date) -> Decimal | None:
    prev = prev_session(day)
    async with conn.cursor() as cur:
        await cur.execute(EW_SQL, (prev, day))
        rows = await cur.fetchall()
    closes: dict[str, dict[date, Decimal]] = {}
    for r in rows:
        closes.setdefault(r["ticker"], {})[r["d"]] = Decimal(str(r["adj_close"]))
    rets = [c[day] / c[prev] - 1 for c in closes.values() if day in c and prev in c and c[prev] > 0]
    return sum(rets, Decimal(0)) / len(rets) if rets else None


async def run_pnl_eod(
    conn: AsyncConnection[Any], day: date, *, capital: float | None = None, demo: bool | None = None
) -> list[PnlRow]:
    """Write `day`'s rows (inside the caller's transaction if there is one); returns what was written.
    A non-session day or DEMO_MODE (`demo`, default the setting: the demo day has its seeded series) writes nothing."""
    if (get_settings().demo_mode if demo is None else demo) or not is_trading_day(day):
        return []
    cap = Decimal(str(capital or get_settings().paper_capital_try))
    at = close_known_at(day)
    book = await paper_book(conn, at, capital=cap)
    async with conn.cursor() as cur:
        await cur.execute(TRADES_SQL, istanbul_day_bounds(at))
        trades = await cur.fetchone()
    strategy_prev = (book.day_start_equity, book.prior_peak)
    ret = book.equity / book.day_start_equity - 1 if book.day_start_equity > 0 else Decimal(0)
    rows = [
        chained(
            LIVE_STRATEGY,
            day,
            strategy_prev,
            ret,
            n_positions=len(book.holdings),
            n_trades=int(trades["n"]) if trades else 0,
        )
    ]
    for strategy, fetch in ((XU100_BH, _index_return), (EW_UNIVERSE, _ew_return)):
        r = await fetch(conn, day)
        if r is None:
            continue
        prev = await _prev(conn, strategy, day) or (book.day_start_equity, book.day_start_equity)
        rows.append(chained(strategy, day, prev, r))
    for row in rows:
        await _write(conn, row)
    return rows
