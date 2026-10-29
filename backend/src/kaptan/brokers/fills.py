"""SimBIST's fill jobs outside DEMO_MODE (FR-26; 04 §4.1 `simbist_open_fill`, 06 §5, §8).

    await run_open_fill(conn, day)   # weekdays ~10:16 Istanbul, after the open is known (15-min delay)
    await run_eod_fills(conn, day)   # weekdays after the 18:30 EOD prices

Opening-auction orders (`pending_open`) fill at the raw İş Yatırım open of their session plus
slippage + impact (06 §8.1) and commission; an open above the limit (below, for a sell) is
"missed": the order is cancelled and not retried. The ±10 % daily limit is checked on the raw
previous close: a buy that opens at tavan, or a sell at taban, does not fill. Intraday (`accepted`)
orders fill at the next price after they were placed (that session's open before 10:00, else its
close; after the close the next session's open), with the same cost model. Only bars of sessions
≤ `day` are read, so a job never sees a price that was not out yet.
Both jobs commit nothing themselves (the caller owns the transaction) and return what they did,
so the scheduler can publish SSE `order` / `fill` after its commit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.brokers import config as broker_config
from kaptan.brokers.config import Costs
from kaptan.brokers.costs import Liquidity, Miss, corwin_schultz, daily_sigma, decide_fill
from kaptan.brokers.simbist import FilledBy, FillTerms, book_fill, book_miss
from kaptan.market.segment import market_of
from kaptan.prices.calendar import IST, SESSION_CLOSE, SESSION_OPEN, is_trading_day, next_session, prev_session
from kaptan.prices.reads import close_on, open_on

#: The opening auction collects orders 09:40–09:55; an order placed before 09:40 joins today's.
AUCTION_START: Final = time(9, 40)
Field = Literal["open", "close"]

OPEN_ORDERS_SQL: Final = """
SELECT id, client_order_id, proposal_id, run_id, ticker, company_name, side, tif, qty, limit_price, status, created_at
FROM trading.orders
WHERE broker = 'simbist' AND status = ANY(%s) AND NOT is_fixture
ORDER BY created_at, id
FOR UPDATE SKIP LOCKED
"""
LIQ_SQL: Final = """
SELECT d, high, low, close, volume, turnover_try FROM core.prices_daily
WHERE ticker = %s AND source = 'isyatirim' AND price_basis = 'raw' AND d < %s
ORDER BY d DESC LIMIT %s
"""


@dataclass(frozen=True, slots=True)
class FillReport:
    fills: list[dict[str, Any]] = field(default_factory=list)
    missed: list[tuple[str, str]] = field(default_factory=list)  # (order id, miss reason)
    waiting: list[str] = field(default_factory=list)  # no price yet


def auction_day(created_at: datetime) -> date:
    """The session whose opening auction an `opg` order placed at `created_at` joins."""
    local = created_at.astimezone(IST)
    d = local.date()
    if is_trading_day(d) and local.time() < AUCTION_START:
        return d
    return next_session(d)


def intraday_observation(created_at: datetime) -> tuple[date, Field]:
    """The next price after an intraday order was placed: (session, open|close)."""
    local = created_at.astimezone(IST)
    d = local.date()
    if not is_trading_day(d):
        return next_session(d), "open"
    if local.time() < SESSION_OPEN:
        return d, "open"
    if local.time() < SESSION_CLOSE:
        return d, "close"
    return next_session(d), "open"


def at_market(d: date, f: Field) -> datetime:
    """When that price printed (the fill's timestamp)."""
    return datetime.combine(d, SESSION_OPEN if f == "open" else SESSION_CLOSE, tzinfo=IST)


async def liquidity(conn: AsyncConnection[Any], ticker: str, before: date, costs: Costs) -> Liquidity:
    """Half spread (Corwin–Schultz / 2), σ_daily and ADV20 in shares over the sessions before `before`."""
    async with conn.cursor() as cur:
        await cur.execute(LIQ_SQL, (ticker, before, costs.window))
        rows = list(reversed(await cur.fetchall()))
    hl = [(r["high"], r["low"]) for r in rows if r["high"] is not None and r["low"] is not None]
    cs = corwin_schultz(hl)
    closes = [r["close"] for r in rows]
    shares = [float(r["volume"]) for r in rows if r["volume"] is not None]
    if not shares:
        shares = [float(r["turnover_try"] / r["close"]) for r in rows if r["turnover_try"] is not None]
    return Liquidity(
        half_spread=None if cs is None else cs / 2,
        sigma_daily=daily_sigma(closes),
        adv20_shares=sum(shares) / costs.window if shares else None,
    )


async def _settle(
    conn: AsyncConnection[Any], order: dict[str, Any], d: date, f: Field, costs: Costs, report: FillReport
) -> None:
    ticker = order["ticker"]
    observed: Decimal | None = await (open_on if f == "open" else close_on)(conn, ticker, d)
    prev = await close_on(conn, ticker, prev_session(d)) if f == "open" else None
    liq = await liquidity(conn, ticker, d, costs)
    at = at_market(d, f)
    outcome = decide_fill(
        side=order["side"],
        qty=int(order["qty"]),
        limit=Decimal(str(order["limit_price"])),
        observed=observed,
        prev_close=prev,
        liq=liq,
        costs=costs,
        at_open=f == "open",
        market=await market_of(conn, ticker, at),
    )
    if isinstance(outcome, Miss):
        await book_miss(conn, order, outcome.reason, at)
        report.missed.append((order["id"], outcome.reason))
        return
    terms = FillTerms(
        price=float(outcome.price),
        commission=float(outcome.commission),
        bsmv=float(outcome.bsmv),
        slippage_bps=float(outcome.slippage_bps),
    )
    filled_by: FilledBy = (
        "open_fill" if order["status"] == "pending_open" else ("intraday" if f == "open" else "eod_fill")
    )
    report.fills.append(await book_fill(conn, order, terms, at, filled_by=filled_by))


async def _orders(conn: AsyncConnection[Any], statuses: list[str]) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(OPEN_ORDERS_SQL, (statuses,))
        return [dict(r) for r in await cur.fetchall()]


async def _has_price(conn: AsyncConnection[Any], ticker: str, d: date, f: Field) -> bool:
    return (await (open_on if f == "open" else close_on)(conn, ticker, d)) is not None


async def _run(conn: AsyncConnection[Any], day: date, statuses: list[str], fields: set[Field]) -> FillReport:
    costs = broker_config.current().trading.costs
    report = FillReport()
    for order in await _orders(conn, statuses):
        if order["status"] == "pending_open":
            d, f = auction_day(order["created_at"]), "open"
        else:
            d, f = intraday_observation(order["created_at"])
        if d > day or f not in fields:
            continue
        if d == day and not await _has_price(conn, order["ticker"], d, f):
            report.waiting.append(order["id"])  # today's bar is not in yet: try again later
            continue
        await _settle(conn, order, d, f, costs, report)
    return report


async def run_open_fill(conn: AsyncConnection[Any], day: date) -> FillReport:
    """`simbist_open_fill` (~10:16): next-open orders at the raw open; intraday orders placed before 10:00 too.
    Orders of earlier sessions the job missed are settled with their own session's open."""
    return await _run(conn, day, ["pending_open", "accepted"], {"open"})


async def run_eod_fills(conn: AsyncConnection[Any], day: date) -> FillReport:
    """After the 18:30 EOD prices: intraday orders at the session close (and anything still due at an open)."""
    return await _run(conn, day, ["pending_open", "accepted"], {"open", "close"})
