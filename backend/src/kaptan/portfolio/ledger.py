"""The book's ledger (trading.book_ledger): every movement of the person's money and shares, in order.

    start / deposit / withdrawal   cash ±amount, money put in ±amount           (an outside flow)
    holding                        shares +qty, money put in +cost, cash 0       (an outside flow at market value)
    buy                            shares +qty, cash −(qty × price + commission)
    sell                           shares −qty, cash +(qty × price − commission)

Nothing else moves the book: cash, the shares held and the money put in at a moment are sums over the rows with
`occurred_at` up to it (`kaptan.risk.book.own_book`). SQL only here; the callers (`kaptan.portfolio.money`,
`kaptan.approvals.service`) check, audit and commit. Every write first takes `lock()`, so two writes never read
the same book.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms

CENT: Final = Decimal("0.01")
LOCK_KEY: Final = "trading.book_ledger"
MoneyKind = Literal["start", "deposit", "withdrawal"]
#: A row that changes or undoes an earlier one; it is never a movement of its own.
FIX_KINDS: Final = ("correction", "reversal")
#: What `GET /me/money` lists: the outside flows (a fill is a ticket's business, not a money movement).
MOVEMENT_KINDS: Final = ("start", "deposit", "withdrawal", "holding")

STARTED_SQL: Final = """
SELECT EXISTS (SELECT 1 FROM trading.book_ledger
                WHERE kind = 'start' AND book_no = (SELECT max(no) FROM trading.book_epochs)) AS started
"""
TOTALS_SQL: Final = """
SELECT coalesce(bool_or(kind = 'start'), false) AS started, coalesce(sum(cash_delta), 0) AS cash,
       coalesce(sum(capital_delta), 0) AS put_in
  FROM trading.book_ledger WHERE occurred_at <= %s AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
SHARES_SQL: Final = """
SELECT l.ticker, sum(l.qty_delta)::int AS qty,
       (array_agg(l.price ORDER BY l.occurred_at DESC, l.id DESC) FILTER (WHERE l.price IS NOT NULL))[1] AS price,
       i.sector, coalesce(g.group_name, i.group_name) AS group_name
  FROM trading.book_ledger l
  LEFT JOIN core.issuers i ON i.ticker = l.ticker
  LEFT JOIN core.issuer_groups g ON g.ticker = l.ticker
 WHERE l.ticker IS NOT NULL AND l.occurred_at <= %s AND l.book_no = (SELECT max(no) FROM trading.book_epochs)
 GROUP BY l.ticker, i.sector, coalesce(g.group_name, i.group_name)
HAVING sum(l.qty_delta) > 0
 ORDER BY l.ticker
"""
FLOWS_SQL: Final = """
SELECT flow_try, equity_before FROM trading.book_ledger
 WHERE flow_try <> 0 AND book_no = (SELECT max(no) FROM trading.book_epochs)
   AND occurred_at <= %(until)s AND (%(after)s::timestamptz IS NULL OR occurred_at > %(after)s)
 ORDER BY occurred_at, id
"""
TRADES_SQL: Final = """
SELECT count(*) AS n FROM trading.book_ledger
 WHERE kind IN ('buy', 'sell') AND occurred_at >= %s AND occurred_at < %s
   AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
MOVEMENTS_SQL: Final = """
SELECT r.id, r.kind, r.amount_try, r.occurred_at, r.note,
       (SELECT c.amount_try FROM trading.book_ledger c
         WHERE c.corrects_id = r.id AND c.kind = 'correction' ORDER BY c.id DESC LIMIT 1) AS corrected_to,
       (SELECT max(c.recorded_at) FROM trading.book_ledger c WHERE c.corrects_id = r.id) AS changed_at,
       EXISTS (SELECT 1 FROM trading.book_ledger c WHERE c.corrects_id = r.id AND c.kind = 'reversal') AS undone
  FROM trading.book_ledger r
 WHERE r.kind = ANY(%s) AND r.book_no = %s ORDER BY r.occurred_at DESC, r.id DESC
"""
ROW_SQL: Final = """
SELECT l.*, (SELECT c.amount_try FROM trading.book_ledger c
              WHERE c.corrects_id = l.id AND c.kind = 'correction' ORDER BY c.id DESC LIMIT 1) AS corrected_to,
       EXISTS (SELECT 1 FROM trading.book_ledger c WHERE c.corrects_id = l.id AND c.kind = 'reversal') AS undone
  FROM trading.book_ledger l
 WHERE l.id = %s AND l.corrects_id IS NULL AND l.book_no = (SELECT max(no) FROM trading.book_epochs)
"""
FILL_SQL: Final = """
SELECT l.id, l.kind, l.ticker, l.qty_delta, l.price, l.commission_try, l.commission_estimated, l.cash_delta,
       (SELECT jsonb_build_object('qty', c.new_qty, 'price', c.price, 'commission', c.commission_try)
          FROM trading.book_ledger c WHERE c.corrects_id = l.id AND c.kind = 'correction'
         ORDER BY c.id DESC LIMIT 1) AS latest,
       (SELECT coalesce(sum(c.cash_delta), 0) FROM trading.book_ledger c
         WHERE c.corrects_id = l.id AND c.kind = 'correction') AS cash_fixes
  FROM trading.book_ledger l WHERE l.ticket_no = %s AND l.kind IN ('buy', 'sell') AND l.corrects_id IS NULL
"""
SALES_SQL: Final = """
SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'sell' AND position_id = %s AND ticket_no IS NULL
"""
CURRENT_SQL: Final = "SELECT max(no) AS no FROM trading.book_epochs"
INSERT_SQL: Final = """
INSERT INTO trading.book_ledger (kind, occurred_at, recorded_at, amount_try, cash_delta, capital_delta, flow_try,
  equity_before, ticker, qty_delta, price, commission_try, commission_estimated, position_id, ticket_no, note,
  book_no, corrects_id, new_qty)
VALUES (%(kind)s, %(occurred_at)s, %(recorded_at)s, %(amount_try)s, %(cash_delta)s, %(capital_delta)s, %(flow_try)s,
  %(equity_before)s, %(ticker)s, %(qty_delta)s, %(price)s, %(commission_try)s, %(commission_estimated)s,
  %(position_id)s, %(ticket_no)s, %(note)s, (SELECT max(no) FROM trading.book_epochs), %(corrects_id)s, %(new_qty)s)
RETURNING id
"""


def cents(x: Decimal | float | int | str) -> Decimal:
    value = x if isinstance(x, Decimal) else Decimal(str(x))
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class Flow:
    """Outside money entering (+) or leaving (−) the book, with the book's equity just before it."""

    amount: Decimal
    equity_before: Decimal | None


@dataclass(frozen=True, slots=True)
class Totals:
    started: bool
    cash: Decimal
    put_in: Decimal


@dataclass(frozen=True, slots=True)
class Shares:
    ticker: str
    qty: int
    last_trade_price: Decimal | None
    sector: str | None
    group: str | None


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def lock(conn: AsyncConnection[Any]) -> None:
    """One book writer at a time, until the caller's transaction ends."""
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (LOCK_KEY,))


async def started(conn: AsyncConnection[Any]) -> bool:
    """Has the person entered their starting money?"""
    return bool((await _rows(conn, STARTED_SQL, ()))[0]["started"])


async def totals(conn: AsyncConnection[Any], as_of: datetime) -> Totals:
    row = (await _rows(conn, TOTALS_SQL, (as_of,)))[0]
    return Totals(bool(row["started"]), cents(row["cash"]), cents(row["put_in"]))


async def shares(conn: AsyncConnection[Any], as_of: datetime) -> list[Shares]:
    """The shares held at `as_of`, per ticker, with the price of the last recorded movement in it."""
    return [
        Shares(
            r["ticker"],
            int(r["qty"]),
            None if r["price"] is None else Decimal(r["price"]),
            r["sector"],
            r["group_name"],
        )
        for r in await _rows(conn, SHARES_SQL, (as_of,))
    ]


async def flows(conn: AsyncConnection[Any], after: datetime | None, until: datetime) -> list[Flow]:
    """The outside flows with `after < occurred_at ≤ until`, oldest first (`after` None: since the beginning)."""
    return [
        Flow(Decimal(r["flow_try"]), None if r["equity_before"] is None else Decimal(r["equity_before"]))
        for r in await _rows(conn, FLOWS_SQL, {"after": after, "until": until})
    ]


async def trades_between(conn: AsyncConnection[Any], start: datetime, end: datetime) -> int:
    return int((await _rows(conn, TRADES_SQL, (start, end)))[0]["n"])


async def current_book_no(conn: AsyncConnection[Any]) -> int:
    return int((await _rows(conn, CURRENT_SQL, ()))[0]["no"])


async def movements(conn: AsyncConnection[Any], book_no: int | None = None) -> list[dict[str, Any]]:
    """MoneyMovement documents of one book (the current one by default), newest first. A corrected row shows
    the amount now in force and the one first typed; an undone row stays, marked."""
    which = book_no if book_no is not None else await current_book_no(conn)
    out: list[dict[str, Any]] = []
    for r in await _rows(conn, MOVEMENTS_SQL, (list(MOVEMENT_KINDS), which)):
        corrected = r["corrected_to"] is not None
        out.append(
            {
                "id": f"hareket-{r['id']}",
                "kind": r["kind"],
                "amount_try": float(r["corrected_to"] if corrected else r["amount_try"]),
                "occurred_at": iso_ms(r["occurred_at"]),
                "note": r["note"],
                "status": "undone" if r["undone"] else "corrected" if corrected else "active",
                "original_amount_try": float(r["amount_try"]) if corrected else None,
                "changed_at": None if r["changed_at"] is None else iso_ms(r["changed_at"]),
            }
        )
    return out


async def original_row(conn: AsyncConnection[Any], row_id: int) -> dict[str, Any] | None:
    """An original ledger row of the current book (not a correction), with its latest corrected amount and
    whether it was undone. Call it after `lock()`."""
    rows = await _rows(conn, ROW_SQL, (row_id,))
    return rows[0] if rows else None


async def fill_of(conn: AsyncConnection[Any], ticket_no: str) -> dict[str, Any] | None:
    """The ledger row of a ticket's recorded fill, with its values now in force (`qty`, `price`, `commission`)."""
    rows = await _rows(conn, FILL_SQL, (ticket_no,))
    if not rows:
        return None
    r = rows[0]
    latest = r["latest"]
    qty = abs(int(r["qty_delta"]))
    return {
        **r,
        "side": r["kind"],
        "qty": int(latest["qty"]) if latest else qty,
        "price": Decimal(str(latest["price"])) if latest else Decimal(r["price"]),
        "commission": Decimal(str(latest["commission"])) if latest else Decimal(r["commission_try"]),
        "cash_now": Decimal(r["cash_delta"]) + Decimal(r["cash_fixes"]),
    }


async def hand_sales(conn: AsyncConnection[Any], position_id: int) -> int:
    """How many sales of a hand-entered holding were recorded."""
    return int((await _rows(conn, SALES_SQL, (position_id,)))[0]["n"])


async def add_fix(conn: AsyncConnection[Any], **fields: Any) -> int:
    """A `correction` or `reversal` row (the caller computes the differences)."""
    return await _insert(conn, **fields)


async def _insert(conn: AsyncConnection[Any], **fields: Any) -> int:
    row: dict[str, Any] = {
        "capital_delta": Decimal(0),
        "flow_try": Decimal(0),
        "equity_before": None,
        "ticker": None,
        "qty_delta": 0,
        "price": None,
        "commission_try": Decimal(0),
        "commission_estimated": False,
        "position_id": None,
        "ticket_no": None,
        "note": "",
        "corrects_id": None,
        "new_qty": None,
        **fields,
    }
    return int((await _rows(conn, INSERT_SQL, row))[0]["id"])


async def add_money(
    conn: AsyncConnection[Any], kind: MoneyKind, amount: Decimal, *, equity_before: Decimal, note: str, now: datetime,
    occurred_at: datetime | None = None,
) -> int:  # fmt: skip
    """Starting money or a deposit (+) or a withdrawal (−): cash and the money put in move together.
    `occurred_at`: the day it really happened (a statement import); left out, it is `now`."""
    signed = -amount if kind == "withdrawal" else amount
    return await _insert(
        conn, kind=kind, occurred_at=occurred_at or now, recorded_at=now, amount_try=amount, cash_delta=signed,
        capital_delta=signed, flow_try=signed, equity_before=equity_before, note=note,
    )  # fmt: skip


async def add_holding(
    conn: AsyncConnection[Any], *, ticker: str, qty: int, avg_cost: Decimal, market_value: Decimal,
    equity_before: Decimal, position_id: int, now: datetime,
) -> int:  # fmt: skip
    """A share owned before KAPtan joins at its cost; for the stops it is a flow of what it is worth now."""
    cost = cents(avg_cost * qty)
    return await _insert(
        conn, kind="holding", occurred_at=now, recorded_at=now, amount_try=cost, cash_delta=Decimal(0),
        capital_delta=cost, flow_try=market_value, equity_before=equity_before, ticker=ticker, qty_delta=qty,
        price=avg_cost, position_id=position_id,
    )  # fmt: skip


async def add_fill(
    conn: AsyncConnection[Any], *, side: Literal["buy", "sell"], ticker: str, qty: int, price: Decimal,
    commission: Decimal, estimated: bool, filled_at: datetime, now: datetime, position_id: int | None = None,
    ticket_no: str | None = None,
) -> int:  # fmt: skip
    """A real fill: a buy takes `qty × price + commission` out of cash, a sell adds `qty × price − commission`."""
    gross = cents(price * qty)
    cash = -(gross + commission) if side == "buy" else gross - commission
    return await _insert(
        conn, kind=side, occurred_at=filled_at, recorded_at=now, amount_try=gross, cash_delta=cash, ticker=ticker,
        qty_delta=qty if side == "buy" else -qty, price=price, commission_try=commission,
        commission_estimated=estimated, position_id=position_id, ticket_no=ticket_no,
    )  # fmt: skip
