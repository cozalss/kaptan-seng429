"""Replay of the person's ledger: closed trades and what the shares still held cost.

    trades, pools = await replay_book(conn)

Gain uses the average cost of the shares at the moment of the sale, commissions in it (the same basis as the Karne's
"realized", `kaptan.reports.karne`), so the two screens agree. Days held use first-in-first-out lots: the shares sold
are the oldest ones. A share entered by hand (`holding`) has no known buying day, so a sale that touches it says
"days held" is unknown rather than guessing. A bonus issue multiplies every lot's shares and leaves the cost; a
rights issue is a new lot at the subscription price. A fill the person corrected counts with its corrected values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.prices.calendar import istanbul_date

ZERO: Final = Decimal(0)
LEDGER_SQL: Final = """
SELECT l.id, l.kind, l.occurred_at, l.ticker, l.qty_delta, l.price, l.commission_try, l.corrects_id, l.new_qty,
       coalesce(i.name, l.ticker) AS company
  FROM trading.book_ledger l LEFT JOIN core.issuers i ON i.ticker = l.ticker
 WHERE l.book_no = (SELECT max(no) FROM trading.book_epochs)
   AND l.kind IN ('holding', 'buy', 'sell', 'bonus', 'rights', 'correction')
 ORDER BY l.occurred_at, l.id
"""


@dataclass(slots=True)
class Lot:
    qty: Decimal
    acquired: date | None


@dataclass(slots=True)
class Pool:
    qty: Decimal = ZERO
    cost: Decimal = ZERO
    lots: list[Lot] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class Trade:
    id: str
    ticker: str
    company: str
    sold_at: datetime
    qty: int
    cost: Decimal
    proceeds: Decimal
    days_held: int | None

    @property
    def gain(self) -> Decimal:
        return self.proceeds - self.cost


def _effective(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fills with their latest correction applied; the correction rows themselves are dropped."""
    latest = {r["corrects_id"]: r for r in rows if r["kind"] == "correction"}
    out = []
    for r in rows:
        if r["kind"] == "correction":
            continue
        fix = latest.get(r["id"])
        if fix is not None and r["kind"] in ("buy", "sell"):
            qty = int(fix["new_qty"]) if fix["new_qty"] is not None else abs(int(r["qty_delta"]))
            r = {**r, "qty_delta": qty if r["kind"] == "buy" else -qty, "price": fix["price"]}
            r["commission_try"] = fix["commission_try"]
        out.append(r)
    return out


def _take(pool: Pool, qty: Decimal, on: date) -> int | None:
    """Remove the oldest `qty` shares from the lots; the days they were held, or None when any is of unknown age."""
    left, weighted, unknown = qty, ZERO, False
    while left > 0 and pool.lots:
        lot = pool.lots[0]
        used = min(left, lot.qty)
        if lot.acquired is None:
            unknown = True
        else:
            weighted += used * (on - lot.acquired).days
        lot.qty -= used
        left -= used
        if lot.qty <= 0:
            pool.lots.pop(0)
    if unknown or qty <= 0:
        return None
    return int((weighted / qty).quantize(Decimal(1)))


def _sell(pools: dict[str, Pool], r: dict[str, Any], trades: list[Trade]) -> None:
    pool = pools.setdefault(r["ticker"], Pool())
    n = Decimal(abs(int(r["qty_delta"])))
    if pool.qty <= 0:
        return
    sold = min(n, pool.qty)
    basis = pool.cost * sold / pool.qty
    fee = Decimal(r["commission_try"])
    days = _take(pool, sold, istanbul_date(r["occurred_at"]))
    pool.qty -= sold
    pool.cost -= basis
    trades.append(
        Trade(
            f"satis-{r['id']}",
            r["ticker"],
            r["company"],
            r["occurred_at"],
            int(sold),
            basis,
            sold * Decimal(r["price"]) - fee,
            days,
        )
    )


def _add(pool: Pool, qty: Decimal, cost: Decimal, acquired: date | None) -> None:
    pool.qty += qty
    pool.cost += cost
    pool.lots.append(Lot(qty, acquired))


def _bonus(pool: Pool, added: Decimal) -> None:
    if pool.qty <= 0 or pool.qty + added <= 0:
        return
    factor = (pool.qty + added) / pool.qty
    for lot in pool.lots:
        lot.qty *= factor
    pool.qty += added


def replay(rows: list[dict[str, Any]]) -> tuple[list[Trade], dict[str, Pool]]:
    pools: dict[str, Pool] = {}
    trades: list[Trade] = []
    for r in _effective(rows):
        kind, ticker = r["kind"], r["ticker"]
        pool = pools.setdefault(ticker, Pool())
        n, price, fee = Decimal(abs(int(r["qty_delta"]))), r["price"], Decimal(r["commission_try"] or 0)
        day = istanbul_date(r["occurred_at"])
        if kind == "holding":
            _add(pool, n, n * Decimal(price), None)
        elif kind == "buy":
            _add(pool, n, n * Decimal(price) + fee, day)
        elif kind == "sell":
            _sell(pools, r, trades)
        elif kind == "bonus":
            _bonus(pool, Decimal(int(r["qty_delta"])))
        elif kind == "rights" and int(r["qty_delta"]) > 0:
            _add(pool, n, n * Decimal(price), day)
        elif kind == "rights" and pool.qty > 0:  # an undone rights issue takes its shares and its cost back
            gone = min(n, pool.qty)
            pool.cost -= pool.cost * gone / pool.qty
            _take(pool, gone, day)
            pool.qty -= gone
    return trades, {t: p for t, p in pools.items() if p.qty > 0}


async def replay_book(conn: AsyncConnection[Any]) -> tuple[list[Trade], dict[str, Pool]]:
    async with conn.cursor() as cur:
        await cur.execute(LEDGER_SQL)
        rows = [dict(r) for r in await cur.fetchall()]
    return replay(rows)
