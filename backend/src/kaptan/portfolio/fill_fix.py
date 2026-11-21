"""Fixing a fill the person recorded wrong (wrong adet, price or commission): what it does to the book.

The ledger row of the fill stays; a `correction` row says which fill it corrects and carries the difference in
cash. The position (a buy) is set to the real adet and price; a sell keeps its adet (only price and commission can
be fixed: the position it closed may be gone) and the closed position's realised result is recomputed. The caller
(`kaptan.approvals.service.correct_fill`) checks the ticket's own rules, updates the ticket, audits and commits.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.errors import ApiError
from kaptan.portfolio import ledger
from kaptan.portfolio.ledger import cents
from kaptan.portfolio.marks import round_to
from kaptan.risk.book import own_book

NOT_RECORDED: Final = "Bu işlemin kaydını bulamadım."
SOLD_SINCE: Final = (
    "Bu alımdan sonra satış kaydettin; adedi artık değiştiremezsin. Fiyatı ve komisyonu düzeltebilirsin."
)
SELL_QTY: Final = "Satışta adedi değiştiremezsin; fiyatı ve komisyonu düzeltebilirsin."
OVER_CASH: Final = "Bu düzeltmeyle boştaki nakdin eksiye düşerdi. Önce bekleyen alım işlemini kapat."
NO_CHANGE: Final = "Bu zaten böyle yazılı."

BUY_POSITION_SQL: Final = """
SELECT id, qty, avg_cost FROM trading.positions WHERE book = 'personal' AND source_proposal = %s FOR UPDATE
"""
CLOSED_SQL: Final = """
SELECT id, qty, avg_cost, realized_pnl, source_proposal FROM trading.closed_positions
 WHERE exit_proposal = %s FOR UPDATE
"""


@dataclass(frozen=True, slots=True)
class FillChange:
    old_qty: int
    old_price: Decimal
    old_commission: Decimal


async def apply(
    conn: AsyncConnection[Any], *, ticket: dict[str, Any], qty: int, price: Decimal, commission: Decimal,
    estimated: bool, now: datetime,
) -> FillChange:  # fmt: skip
    """Write the correction into the ledger and the positions. Call it after `ledger.lock()`, in the caller's
    transaction. 409 not_recorded / sold_since, 422 sell_qty / no_change / over_cash."""
    fill = await ledger.fill_of(conn, ticket["ticket_no"])
    if fill is None:
        raise ApiError(409, "not_recorded", NOT_RECORDED)
    side = fill["side"]
    change = FillChange(fill["qty"], fill["price"], fill["commission"])
    if (qty, price, commission) == (change.old_qty, change.old_price, change.old_commission):
        raise ApiError(422, "no_change", NO_CHANGE)
    if side == "sell" and qty != change.old_qty:
        raise ApiError(422, "sell_qty", SELL_QTY)
    gross = cents(price * qty)
    new_cash = -(gross + commission) if side == "buy" else gross - commission
    delta = new_cash - fill["cash_now"]
    book = await own_book(conn, now)
    if delta < 0 and book.cash + delta - book.reserved < 0:
        raise ApiError(422, "over_cash", OVER_CASH)
    position_id = await _fix_position(conn, side, ticket, change, qty, price)
    await ledger.add_fix(
        conn, kind="correction", corrects_id=fill["id"], occurred_at=now, recorded_at=now, amount_try=gross,
        cash_delta=delta, ticker=fill["ticker"], qty_delta=qty - change.old_qty if side == "buy" else 0,
        price=price, commission_try=commission, commission_estimated=estimated, position_id=position_id,
        ticket_no=ticket["ticket_no"], new_qty=qty,
    )  # fmt: skip
    return change


async def _fix_position(
    conn: AsyncConnection[Any], side: str, ticket: dict[str, Any], change: FillChange, qty: int, price: Decimal
) -> int | None:
    async with conn.cursor() as cur:
        if side == "buy":
            await cur.execute(BUY_POSITION_SQL, (ticket["proposal_id"],))
            pos = await cur.fetchone()
            if pos is None:
                if qty != change.old_qty:
                    raise ApiError(409, "sold_since", SOLD_SINCE)
                return None
            if qty != change.old_qty and int(pos["qty"]) != change.old_qty:
                raise ApiError(409, "sold_since", SOLD_SINCE)
            left = int(pos["qty"]) + qty - change.old_qty
            await cur.execute(
                "UPDATE trading.positions SET qty = %s, avg_cost = %s WHERE id = %s", (left, float(price), pos["id"])
            )
            return int(pos["id"])
        await cur.execute(CLOSED_SQL, (ticket["proposal_id"],))
        closed = await cur.fetchone()
        if closed is None:
            return None
        realized = round_to((float(price) - float(closed["avg_cost"])) * int(closed["qty"]), 2)
        await cur.execute(
            "UPDATE trading.closed_positions SET exit_price = %s, realized_pnl = %s WHERE id = %s",
            (float(price), realized, closed["id"]),
        )
        await cur.execute(
            "UPDATE trading.positions SET realized_pnl = realized_pnl + %s"
            " WHERE book = 'personal' AND source_proposal = %s",
            (realized - float(closed["realized_pnl"]), closed["source_proposal"]),
        )
    return None
