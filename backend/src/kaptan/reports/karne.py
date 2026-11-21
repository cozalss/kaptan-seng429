"""The monthly and yearly report (Karne): money in, value, gain, costs, suggestions, track record, BIST 100.

Everything comes from the person's own book (trading.book_ledger, trading.pnl_daily) and the track record:
- gain = value at the end - value at the start - outside money in the period (a deposit is never a gain);
- realized = what the sales of the period made over the average cost of the shares sold (commissions in it),
  replayed from the ledger; unrealized = what the shares still held are worth over their cost (current period only);
- dividends are read from ledger rows of kind `dividend` and left out while no such row exists.
A number that cannot be known honestly is null and the page leaves it out.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import IST, istanbul_date
from kaptan.reports.benchmark import benchmark
from kaptan.reports.track import DECIDED, summarize, track_items
from kaptan.reports.words import MONTHS_TR
from kaptan.risk.book import holdings_at, own_book

LEDGER_SQL: Final = """
SELECT kind, occurred_at, amount_try, cash_delta, capital_delta, flow_try, ticker, qty_delta, price, commission_try
  FROM trading.book_ledger ORDER BY occurred_at, id
"""
EQUITY_BEFORE_SQL: Final = "SELECT equity FROM trading.pnl_daily WHERE strategy = %s AND d < %s ORDER BY d DESC LIMIT 1"
EQUITY_AT_SQL: Final = "SELECT equity FROM trading.pnl_daily WHERE strategy = %s AND d <= %s ORDER BY d DESC LIMIT 1"
ZERO: Final = Decimal(0)


@dataclass(frozen=True, slots=True)
class Period:
    kind: str
    start: date
    end: date
    label: str


def parse_period(kind: str, at: str) -> Period:
    """("month", "2026-11") or ("year", "2026"); ValueError for anything else."""
    if kind == "year":
        year = int(at)
        return Period("year", date(year, 1, 1), date(year, 12, 31), str(year))
    year_s, month_s = at.split("-")
    year, month = int(year_s), int(month_s)
    last = calendar.monthrange(year, month)[1]
    return Period("month", date(year, month, 1), date(year, month, last), f"{MONTHS_TR[month - 1]} {year}")


def _bounds(p: Period) -> tuple[datetime, datetime]:
    return datetime.combine(p.start, time(0), IST), datetime.combine(p.end + timedelta(days=1), time(0), IST)


@dataclass(slots=True)
class Replay:
    realized: Decimal = ZERO
    commissions: Decimal = ZERO
    flow: Decimal = ZERO
    put_in: Decimal = ZERO
    dividends: Decimal | None = None
    seen_before: bool = False
    cost: dict[str, tuple[int, Decimal]] | None = None


def replay(rows: list[dict[str, Any]], lo: datetime, hi: datetime) -> Replay:
    """Average-cost replay of the whole ledger up to `hi`; period sums cover [lo, hi)."""
    out = Replay(cost={})
    book = out.cost
    assert book is not None
    for r in rows:
        at = r["occurred_at"]
        if at >= hi:
            break
        inside = at >= lo
        out.seen_before = out.seen_before or not inside
        qty, cost = book.get(r["ticker"], (0, ZERO)) if r["ticker"] else (0, ZERO)
        n, price, fee = abs(int(r["qty_delta"])), r["price"], r["commission_try"]
        if inside:
            out.commissions += fee
            out.flow += r["flow_try"]
            out.put_in += r["capital_delta"]
            if r["kind"] == "dividend":
                out.dividends = (out.dividends or ZERO) + r["amount_try"]
        if r["kind"] == "dividend" and out.dividends is None:
            out.dividends = ZERO
        if r["kind"] == "holding":
            book[r["ticker"]] = (qty + n, cost + n * price)
        elif r["kind"] == "buy":
            book[r["ticker"]] = (qty + n, cost + n * price + fee)
        elif r["kind"] == "sell" and qty > 0:
            sold = min(n, qty)
            basis = cost * sold / qty
            if inside:
                out.realized += sold * price - fee - basis
            book[r["ticker"]] = (qty - sold, cost - basis)
    return out


async def _one(conn: AsyncConnection[Any], sql: str, params: tuple[Any, ...]) -> float | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else float(row["equity"])


async def _unrealized(conn: AsyncConnection[Any], now: datetime, cost: dict[str, tuple[int, Decimal]]) -> float:
    total = ZERO
    for h in await holdings_at(conn, now):
        total += h.value - cost.get(h.ticker, (0, h.value))[1]
    return float(total)


def _suggestion_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    def count(*kinds: str) -> int:
        return sum(1 for i in items if i["decision"] in kinds)

    return {
        "made": len(items), "took": count("took"), "skipped": count("skipped"), "declined": count("declined"),
        "expired": count("expired"), "waiting": count("waiting", "approved_open"),
    }  # fmt: skip


async def karne(conn: AsyncConnection[Any], p: Period, now: datetime) -> dict[str, Any]:
    """The Karne document for a period."""
    lo, hi = _bounds(p)
    today = istanbul_date(now)
    current = p.start <= today <= p.end
    async with conn.cursor() as cur:
        await cur.execute(LEDGER_SQL)
        rows = [dict(r) for r in await cur.fetchall()]
    rep = replay(rows, lo, min(hi, now + timedelta(seconds=1)) if current else hi)
    started = any(r["kind"] == "start" and r["occurred_at"] < hi for r in rows)
    notes: list[str] = []
    value_end: float | None = None
    if current:
        book = await own_book(conn, now)
        value_end = float(book.equity) if book.started else None
        notes.append("Bu dönem henüz bitmedi; rakamlar bugüne kadar.")
    else:
        value_end = await _one(conn, EQUITY_AT_SQL, (LIVE_STRATEGY, p.end))
    value_start = await _one(conn, EQUITY_BEFORE_SQL, (LIVE_STRATEGY, p.start))
    if value_start is None and not rep.seen_before:
        value_start = 0.0
    gain = None if value_start is None or value_end is None else value_end - value_start - float(rep.flow)
    if gain is None and started:
        notes.append("Değer hesabı için günlük kapanış kayıtları bu dönemde eksik; kazanç yazılmadı.")
    unreal = await _unrealized(conn, now, rep.cost or {}) if current and started else None
    items = await track_items(conn, now, lo=lo, hi=hi)
    counts = _suggestion_counts(items)
    return {
        "period": p.kind, "label_tr": p.label, "start": p.start, "end": p.end, "is_current": current,
        "started": started, "put_in_net": float(rep.put_in), "value_start": value_start, "value_end": value_end,
        "gain_try": gain, "realized_try": float(rep.realized), "unrealized_try": unreal,
        "commissions_try": float(rep.commissions),
        "dividends_try": None if rep.dividends is None else float(rep.dividends),
        "suggestions": counts, "decisions": sum(1 for i in items if i["decision"] in DECIDED),
        "track": summarize(items), "benchmark": await benchmark(conn, p.start, p.end), "notes_tr": notes,
    }  # fmt: skip
