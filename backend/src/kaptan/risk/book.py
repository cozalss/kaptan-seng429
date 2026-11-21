"""The person's own book marked to market: the one source of cash, equity, day P&L and drawdown
(FR-20, FR-29; 06 §10 GateContext equity / cash_free / peak; 06 §11 the −1 % and −5 % stops).

    cash       = Σ ledger cash movements: starting money + deposits − withdrawals
                 − Σ buys (qty × price + commission) + Σ sells (qty × price − commission)
    put in     = starting money + deposits − withdrawals + cost of the holdings entered by hand
    equity     = cash + Σ qty × mark
    free cash  = cash − reserved (buy tickets still waiting to be entered, at their limit), never below zero

Before the starting money exists the book is empty: every number is 0, and neither stop can trip.

Marks are point in time (`kaptan.prices.latest_marks`: raw levels, the open from 10:15, the close from 18:30
Istanbul). A share with no stored price stands at the price of its last recorded movement (its cost), with no
"known at" time: nothing invents a move.

**A deposit or a withdrawal is not a gain or a loss.** Money that comes in or goes out (and a share added by
hand, at what it is worth that moment) is an outside flow F, recorded with the book's equity E just before it.
Every level a percentage is measured against is scaled by the same factor the flow scaled the book by:

    level' = level × (E + F) / E          (E > 0)
    level' = max(0, level) + F            (E ≤ 0: the book was empty, the flow is the new level)
    level' = 0                            (E + F ≤ 0: everything was taken out)

applied, oldest flow first, to
    day start  = the last close in trading.pnl_daily before today, shifted by the flows since that close
                 (no close yet: 0 shifted by every flow, so on the first day it is the money at setup);
    peak       = max(that row's running peak shifted the same way, day start, equity).
So equity / day start and equity / peak read the same just before and just after a flow: the day's P&L %, the
drawdown and both stops move only with prices and commissions. (The factor uses the equity seen when the flow
was recorded; a fill recorded later with an earlier time does not rewrite it.)
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio import ledger
from kaptan.portfolio.ledger import CENT, Flow
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import close_known_at, istanbul_date, open_known_at
from kaptan.prices.reads import latest_marks

RESERVED_SQL: Final = """
SELECT t.doc->>'ticker' AS ticker, i.sector, coalesce(g.group_name, i.group_name) AS group_name,
       (t.doc->>'qty')::numeric * (t.doc->>'limit_price')::numeric AS notional
  FROM trading.order_tickets t
  LEFT JOIN core.issuers i ON i.ticker = t.doc->>'ticker'
  LEFT JOIN core.issuer_groups g ON g.ticker = t.doc->>'ticker'
 WHERE t.entry_status = 'awaiting' AND t.marked_at IS NULL AND coalesce(t.doc->>'side', 'buy') = 'buy'
   AND t.valid_until > %s
 ORDER BY t.ticket_no
"""
UNRECORDED_SQL: Final = """
SELECT a.ticker, a.ex_date, a.factor FROM core.corporate_actions a
 WHERE a.ticker = ANY(%(t)s) AND a.kind IN ('bedelsiz', 'split') AND a.ex_date > %(after)s AND a.ex_date <= %(today)s
   AND NOT EXISTS (
     SELECT 1 FROM trading.corporate_book c
      WHERE c.ticker = a.ticker AND c.kind = 'bonus' AND c.corrects_id IS NULL
        AND (c.effective_at AT TIME ZONE 'Europe/Istanbul')::date BETWEEN a.ex_date AND a.ex_date + 4
        AND NOT EXISTS (SELECT 1 FROM trading.corporate_book u WHERE u.corrects_id = c.id))
 ORDER BY a.ticker, a.ex_date
"""
SHARES_BEFORE_SQL: Final = """
SELECT coalesce(sum(qty_delta), 0)::int AS qty FROM trading.book_ledger
 WHERE ticker = %s AND occurred_at < %s AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
LAST_CLOSE_SQL: Final = """
SELECT d, equity, peak_equity FROM trading.pnl_daily WHERE strategy = %s AND d < %s ORDER BY d DESC LIMIT 1
"""


def dec(x: Any) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


def shift_level(level: Decimal, flows: Iterable[Flow]) -> Decimal:
    """A day-start or peak level after the outside flows since it was taken (the module docstring's formula)."""
    out = level
    for f in flows:
        before = f.equity_before
        if before is None or before <= 0:
            out = max(Decimal(0), out) + f.amount
        elif before + f.amount <= 0:
            out = Decimal(0)
        else:
            out = out * (before + f.amount) / before
    return max(Decimal(0), out).quantize(CENT)


@dataclass(frozen=True, slots=True)
class Exposure:
    """One holding or reserved ticket, for the sector / group caps (06 P3/P4)."""

    ticker: str
    value: Decimal
    sector: str | None
    group: str | None


@dataclass(frozen=True, slots=True)
class Holding:
    ticker: str
    qty: int
    mark: Decimal
    mark_known_at: datetime | None  # None: no stored price, the share stands at its last recorded price
    sector: str | None
    group: str | None

    @property
    def value(self) -> Decimal:
        return (self.mark * self.qty).quantize(CENT)


@dataclass(frozen=True, slots=True)
class BookSnapshot:
    as_of: datetime
    started: bool
    put_in: Decimal
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
        """cash − reserved tickets (never below zero)."""
        return max(Decimal(0), self.cash - self.reserved)

    @property
    def peak_equity(self) -> Decimal:
        return max(self.prior_peak, self.day_start_equity, self.equity)

    @property
    def daily_pnl_pct(self) -> Decimal:
        return self.equity / self.day_start_equity - 1 if self.day_start_equity > 0 else Decimal(0)

    @property
    def drawdown_pct(self) -> Decimal:
        peak = self.peak_equity
        return min(Decimal(0), self.equity / peak - 1) if peak > 0 else Decimal(0)

    def exposures(self) -> tuple[Exposure, ...]:
        held = tuple(Exposure(h.ticker, h.value, h.sector, h.group) for h in self.holdings)
        return held + self.pending


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def holdings_at(
    conn: AsyncConnection[Any], as_of: datetime, adjust_after: date | None = None
) -> tuple[Holding, ...]:
    """The shares the ledger holds at `as_of`, each at its latest stored price known then.

    `adjust_after`: the day of the last stored close. A bonus issue or split that took effect after it and that the
    person has not recorded yet (`kaptan.portfolio.corporate`) is applied to the valuation only, so the new, lower
    price is not read as a loss before they have told KAPtan about the new shares."""
    held = await ledger.shares(conn, as_of)
    marks = await latest_marks(conn, [h.ticker for h in held], as_of) if held else {}
    unrecorded = await _unrecorded_bonus(conn, [h.ticker for h in held], as_of, adjust_after) if held else {}
    out = []
    for h in held:
        mark = marks.get(h.ticker)
        price = dec(mark.price) if mark is not None else (h.last_trade_price or Decimal(0))
        if mark is not None:
            price = _like_with_like(price, h.qty, mark.d, unrecorded.get(h.ticker, ()))
        out.append(Holding(h.ticker, h.qty, price, None if mark is None else mark.known_at, h.sector, h.group))
    return tuple(out)


def _like_with_like(price: Decimal, qty: int, price_day: date, actions: Iterable[tuple[date, Decimal, int]]) -> Decimal:
    """The price that, times the shares held, is what they are worth: the part of the holding that existed before
    an unrecorded bonus counts at the old level (price / factor); `actions` = (ex-date, factor, shares before it)."""
    value = price * qty
    for ex_date, factor, before in actions:
        if price_day >= ex_date and 0 < factor < 1 and qty > 0:
            old = min(qty, before)
            value += price * old * (1 / factor - 1)
    return value / qty if qty > 0 else price


async def _unrecorded_bonus(
    conn: AsyncConnection[Any], tickers: list[str], as_of: datetime, after: date | None
) -> dict[str, list[tuple[date, Decimal, int]]]:
    """Bonus issues / splits the price history shows (core.corporate_actions) since `after` that no record covers."""
    if after is None:
        return {}
    out: dict[str, list[tuple[date, Decimal, int]]] = {}
    for a in await _rows(conn, UNRECORDED_SQL, {"t": tickers, "after": after, "today": istanbul_date(as_of)}):
        shares_before = await _rows(conn, SHARES_BEFORE_SQL, (a["ticker"], open_known_at(a["ex_date"])))
        before = int(shares_before[0]["qty"])
        if before > 0:
            out.setdefault(a["ticker"], []).append((a["ex_date"], dec(a["factor"]), before))
    return out


async def last_close(conn: AsyncConnection[Any], strategy: str, before: date) -> tuple[date, Decimal, Decimal] | None:
    """(day, equity, running peak) of `strategy`'s last stored close before `before`."""
    rows = await _rows(conn, LAST_CLOSE_SQL, (strategy, before))
    return None if not rows else (rows[0]["d"], dec(rows[0]["equity"]), dec(rows[0]["peak_equity"]))


async def own_book(conn: AsyncConnection[Any], as_of: datetime) -> BookSnapshot:
    """The person's book as known at `as_of` (tz-aware)."""
    totals = await ledger.totals(conn, as_of)
    pending = tuple(
        Exposure(r["ticker"], dec(r["notional"]).quantize(CENT), r["sector"], r["group_name"])
        for r in await _rows(conn, RESERVED_SQL, (as_of,))
        if r["notional"] is not None and r["notional"] > 0
    )
    prev = await last_close(conn, LIVE_STRATEGY, istanbul_date(as_of))
    since = await ledger.flows(conn, None if prev is None else close_known_at(prev[0]), as_of)
    base_equity, base_peak = (Decimal(0), Decimal(0)) if prev is None else (prev[1], prev[2])
    return BookSnapshot(
        as_of=as_of,
        started=totals.started,
        put_in=totals.put_in,
        cash=totals.cash,
        reserved=sum((p.value for p in pending), Decimal(0)),
        day_start_equity=shift_level(base_equity, since),
        prior_peak=shift_level(base_peak, since),
        holdings=await holdings_at(conn, as_of, None if prev is None else prev[0]) if totals.started else (),
        pending=pending,
    )
