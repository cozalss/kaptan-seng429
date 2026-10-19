"""The paper desk marked to market (FR-20, FR-29; 06 §10 GateContext equity / cash_free / peak).

    equity     = capital + Σ fill cash flows (buys −, sells +, commission and BSMV included) + Σ qty × mark
    free cash  = equity − open market value − reserved (unfilled SimBIST buy orders at their limit)
    day start  = the live strategy's last close in trading.pnl_daily (before today), else the capital
    peak       = max(every earlier peak, day start, equity)

Marks are point in time (`kaptan.prices.latest_marks`: raw levels, the open from 10:15, the close
from 18:30 Istanbul); a ticker without a stored price keeps the position's own `last_price`. Used
outside DEMO_MODE only: the demo keeps its fixture equity (risk/equity.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import istanbul_date
from kaptan.prices.reads import latest_marks

CENT: Final = Decimal("0.01")
#: After a confirmed restart (06 §11 step 4): drawdown floor while it holds, extra loss that kills again.
RESET_DRAWDOWN_FLOOR: Final = Decimal("-0.049")
RESET_EXTRA_DD: Final = Decimal("-0.03")

CASH_FLOW_SQL: Final = """
SELECT coalesce(sum(CASE WHEN o.side = 'buy' THEN -(f.qty * f.price + f.commission + f.bsmv)
                         ELSE f.qty * f.price - f.commission - f.bsmv END), 0) AS flow
  FROM trading.fills f JOIN trading.orders o ON o.id = f.order_id
 WHERE o.broker = 'simbist' AND f.filled_at <= %s
"""
HOLDINGS_SQL: Final = """
SELECT p.ticker, sum(p.qty)::int AS qty, max(p.last_price) AS last_price, i.sector,
       coalesce(g.group_name, i.group_name) AS group_name
  FROM trading.positions p
  LEFT JOIN core.issuers i ON i.ticker = p.ticker
  LEFT JOIN core.issuer_groups g ON g.ticker = p.ticker
 WHERE p.book = 'paper' AND p.opened_at <= %s
 GROUP BY p.ticker, i.sector, coalesce(g.group_name, i.group_name)
 ORDER BY p.ticker
"""
RESERVED_SQL: Final = """
SELECT o.ticker, i.sector, coalesce(g.group_name, i.group_name) AS group_name,
       (o.qty - coalesce((SELECT sum(f.qty) FROM trading.fills f WHERE f.order_id = o.id), 0)) * o.limit_price
         AS notional
  FROM trading.orders o
  LEFT JOIN core.issuers i ON i.ticker = o.ticker
  LEFT JOIN core.issuer_groups g ON g.ticker = o.ticker
 WHERE o.broker = 'simbist' AND o.side = 'buy' AND o.limit_price IS NOT NULL
   AND o.status IN ('pending_open', 'accepted', 'partially_filled') AND o.created_at <= %s
"""
HISTORY_SQL: Final = """
SELECT (SELECT equity FROM trading.pnl_daily WHERE strategy = %(s)s AND d < %(d)s ORDER BY d DESC LIMIT 1)
         AS day_start,
       (SELECT max(peak_equity) FROM trading.pnl_daily WHERE strategy = %(s)s AND d < %(d)s) AS peak
"""


def dec(x: Any) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


@dataclass(frozen=True, slots=True)
class Exposure:
    """One open position or reserved order, for the sector / group caps (06 P3/P4)."""

    ticker: str
    value: Decimal
    sector: str | None
    group: str | None


@dataclass(frozen=True, slots=True)
class Holding:
    ticker: str
    qty: int
    mark: Decimal
    mark_known_at: datetime | None  # None: no stored price, the position's own last_price
    sector: str | None
    group: str | None

    @property
    def value(self) -> Decimal:
        return (self.mark * self.qty).quantize(CENT)


@dataclass(frozen=True, slots=True)
class BookSnapshot:
    as_of: datetime
    capital: Decimal
    cash: Decimal
    reserved: Decimal
    day_start_equity: Decimal
    prior_peak: Decimal
    holdings: tuple[Holding, ...] = ()
    pending: tuple[Exposure, ...] = ()

    @property
    def market_value(self) -> Decimal:
        return sum((h.value for h in self.holdings), Decimal(0))

    @property
    def equity(self) -> Decimal:
        return (self.cash + self.market_value).quantize(CENT)

    @property
    def free_cash(self) -> Decimal:
        """equity − open notional − reserved orders (never below zero)."""
        return max(Decimal(0), self.equity - self.market_value - self.reserved)

    @property
    def peak_equity(self) -> Decimal:
        return max(self.prior_peak, self.day_start_equity, self.equity)

    @property
    def daily_pnl_pct(self) -> Decimal:
        return self.equity / self.day_start_equity - 1 if self.day_start_equity > 0 else Decimal(0)

    @property
    def drawdown_pct(self) -> Decimal:
        return min(Decimal(0), self.equity / self.peak_equity - 1)

    def exposures(self) -> tuple[Exposure, ...]:
        held = tuple(Exposure(h.ticker, h.value, h.sector, h.group) for h in self.holdings)
        return held + self.pending


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def paper_book(conn: AsyncConnection[Any], as_of: datetime, *, capital: Decimal | float) -> BookSnapshot:
    """The paper book as known at `as_of` (tz-aware)."""
    cap = dec(capital)
    flow = (await _rows(conn, CASH_FLOW_SQL, (as_of,)))[0]["flow"]
    held = await _rows(conn, HOLDINGS_SQL, (as_of,))
    marks = await latest_marks(conn, [h["ticker"] for h in held], as_of) if held else {}
    holdings = tuple(
        Holding(
            ticker=h["ticker"],
            qty=int(h["qty"]),
            mark=dec(marks[h["ticker"]].price) if h["ticker"] in marks else dec(h["last_price"]),
            mark_known_at=marks[h["ticker"]].known_at if h["ticker"] in marks else None,
            sector=h["sector"],
            group=h["group_name"],
        )
        for h in held
    )
    pending = tuple(
        Exposure(r["ticker"], dec(r["notional"]).quantize(CENT), r["sector"], r["group_name"])
        for r in await _rows(conn, RESERVED_SQL, (as_of,))
        if r["notional"] is not None and r["notional"] > 0
    )
    hist = (await _rows(conn, HISTORY_SQL, {"s": LIVE_STRATEGY, "d": istanbul_date(as_of)}))[0]
    day_start = dec(hist["day_start"]) if hist["day_start"] is not None else cap
    peak = dec(hist["peak"]) if hist["peak"] is not None else day_start
    return BookSnapshot(
        as_of=as_of,
        capital=cap,
        cash=(cap + dec(flow)).quantize(CENT),
        reserved=sum((p.value for p in pending), Decimal(0)),
        day_start_equity=day_start,
        prior_peak=peak,
        holdings=holdings,
        pending=pending,
    )


def effective_drawdown(book: BookSnapshot, reset_equity: Decimal | None, *, reset_active: bool) -> Decimal:
    """The drawdown the kill rule and the gate see. While a confirmed restart holds (the peak is never
    reset) it stays just inside −5 % (−4.9 %, as the demo's restart does) until equity is a further
    −3 % below the reset level (`reset_equity`; None = the restart is new: today's equity is that level)."""
    dd = book.drawdown_pct
    if not reset_active:
        return dd
    level = book.equity if reset_equity is None else reset_equity
    if level > 0 and book.equity / level - 1 <= RESET_EXTRA_DD:
        return dd
    return max(dd, RESET_DRAWDOWN_FLOOR)
