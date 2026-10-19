"""SimBIST, our paper broker (04 §8.2, FR-26): orders in trading.orders, fills in trading.fills.

`SimBistBroker` books an order (idempotent per `client_order_id`); `book_fill()` / `book_miss()` settle
it, whoever decides the price: the demo timer (limit × 0.995 after 1.8 s), the opening-auction job
(kaptan.brokers.fills.run_open_fill) or the end-of-day job. A buy fill opens the paper position, a
sell fill (an exit) closes it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.audit.writer import append
from kaptan.brokers.base import BrokerMode, OrderAck, OrderIntent
from kaptan.brokers.costs import MissReason
from kaptan.brokers.ledger import run_audit
from kaptan.domain.schemas import iso_ms
from kaptan.portfolio.closing import close_position
from kaptan.portfolio.marks import js_round
from kaptan.portfolio.positions import open_position

#: The demo's fill (scenarios.ts): commission 0,05 %, BSMV 5 % of it, 6 bps slippage.
COMMISSION_RATE: Final = 0.0005
BSMV_RATE: Final = 0.05
SLIPPAGE_BPS: Final = 6
FilledBy = Literal["demo_timer", "open_fill", "eod_fill", "intraday"]

ORDER_UPSERT: Final = """
INSERT INTO trading.orders (id, client_order_id, proposal_id, run_id, ticker, company_name, side, order_type, tif,
  qty, limit_price, status, broker, cancel_reason, is_fixture, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET qty = EXCLUDED.qty, tif = EXCLUDED.tif, status = EXCLUDED.status,
  cancel_reason = NULL, miss_reason = NULL, filled_by = NULL, created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at
"""
ORDER_COLUMNS: Final = (
    "id", "client_order_id", "proposal_id", "run_id", "ticker", "company_name", "side", "order_type", "tif",
    "qty", "limit_price", "status", "broker",
)  # fmt: skip
LOCK_SQL: Final = """
SELECT id, client_order_id, proposal_id, run_id, ticker, company_name, side, tif, qty, limit_price, status,
       created_at
FROM trading.orders WHERE id = %s FOR UPDATE
"""
FILL_SQL: Final = "INSERT INTO trading.fills VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING"
MISS_STATUS: Final[dict[str, tuple[str, str | None]]] = {
    "limit_up_open": ("canceled", "limit_up_open"),
    "limit_down_open": ("rejected", None),
}


def paper_order(card: dict[str, Any], now: datetime, *, held_qty: int | None = None) -> dict[str, Any]:
    """The SimBIST Order document for an approved card (a sell never exceeds `held_qty`)."""
    order_id = "ord-s-" + card["run_id"].removeprefix("run-")
    auction = card["entry"] == "next_open_auction"
    approved = card["approved_notional_try"]
    qty = max(1, math.floor(approved / card["limit_price"])) if approved else card["qty"]
    side = card.get("side", "buy")
    if side == "sell" and held_qty is not None:
        qty = min(qty, held_qty)
    return {
        "id": order_id,
        "client_order_id": f"kaptan-{order_id}",
        "proposal_id": card["proposal_id"],
        "run_id": card["run_id"],
        "ticker": card["ticker"],
        "company_name": card["company_name"],
        "side": side,
        "order_type": "limit",
        "tif": "opg" if auction else "day",
        "qty": qty,
        "limit_price": card["limit_price"],
        "status": "pending_open" if auction else "accepted",
        "broker": "simbist",
        "created_at": iso_ms(now),
        "fills": [],
        "is_fixture": card["is_fixture"],
    }


@dataclass(frozen=True, slots=True)
class FillJob:
    """A demo fill waiting for its timer (or the restart recovery)."""

    order_id: str
    run_id: str
    proposal_id: str
    ticker: str
    company_name: str
    qty: int
    price: float


def fill_doc(job: FillJob, now: datetime) -> dict[str, Any]:
    """The demo fill document (commission/BSMV rounded like the mock)."""
    commission = js_round(job.price * job.qty * COMMISSION_RATE * 100) / 100
    return {
        "id": "fill-" + job.order_id.removeprefix("ord-"),
        "order_id": job.order_id,
        "qty": job.qty,
        "price": job.price,
        "commission": commission,
        "bsmv": js_round(commission * BSMV_RATE * 100) / 100,
        "slippage_bps": SLIPPAGE_BPS,
        "filled_at": iso_ms(now),
        "source": "simbist",
    }


class SimBistBroker:
    """The Broker protocol over trading.orders, bound to one transaction and one instant."""

    name = "simbist"
    mode = BrokerMode.PAPER

    def __init__(self, conn: AsyncConnection[Any], now: datetime) -> None:
        self._conn = conn
        self._now = now

    async def submit_order(self, intent: OrderIntent) -> OrderAck:
        """Book `intent.context["order"]` (a paper_order() document); re-sending replaces it, fills cleared."""
        order: dict[str, Any] = dict(intent.context["order"])
        async with self._conn.cursor() as cur:
            await cur.execute("DELETE FROM trading.fills WHERE order_id = %s", (order["id"],))
            await cur.execute(
                ORDER_UPSERT, (*(order[k] for k in ORDER_COLUMNS), order["is_fixture"], self._now, self._now)
            )
        return OrderAck(intent.client_order_id, order["id"], order["status"], raw=order)

    async def get_order(self, client_order_id: str) -> OrderAck | None:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "SELECT id, status FROM trading.orders WHERE client_order_id = %s AND broker = 'simbist'",
                (client_order_id,),
            )
            row = await cur.fetchone()
        return None if row is None else OrderAck(client_order_id, row["id"], row["status"])

    async def cancel_order(self, client_order_id: str) -> None:
        await self._conn.execute(
            "UPDATE trading.orders SET status = 'canceled', cancel_reason = 'day_end', updated_at = %s "
            "WHERE client_order_id = %s AND broker = 'simbist' AND status IN ('pending_open', 'accepted')",
            (self._now, client_order_id),
        )

    async def cancel_all(self) -> int:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "UPDATE trading.orders SET status = 'canceled', cancel_reason = 'kill_switch', updated_at = %s "
                "WHERE broker = 'simbist' AND status IN ('pending_open', 'accepted') RETURNING id",
                (self._now,),
            )
            return len(await cur.fetchall())


async def lock_order(conn: AsyncConnection[Any], order_id: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(LOCK_SQL, (order_id,))
        row = await cur.fetchone()
    return None if row is None else dict(row)


@dataclass(frozen=True, slots=True)
class FillTerms:
    price: float
    commission: float
    bsmv: float
    slippage_bps: float


async def book_fill(
    conn: AsyncConnection[Any],
    order: dict[str, Any],
    terms: FillTerms,
    now: datetime,
    *,
    filled_by: FilledBy,
) -> dict[str, Any]:
    """Fill a locked open order completely (caller's transaction): fill row, status, audit, position."""
    fill = {
        "id": "fill-" + str(order["id"]).removeprefix("ord-"),
        "order_id": order["id"],
        "qty": int(order["qty"]),
        "price": terms.price,
        "commission": terms.commission,
        "bsmv": terms.bsmv,
        "slippage_bps": terms.slippage_bps,
        "filled_at": iso_ms(now),
        "source": "simbist",
    }
    async with conn.cursor() as cur:
        await cur.execute(
            FILL_SQL,
            (fill["id"], order["id"], fill["qty"], terms.price, terms.commission, terms.bsmv, terms.slippage_bps,
             now, "simbist"),
        )  # fmt: skip
        await cur.execute(
            "UPDATE trading.orders SET status = 'filled', filled_by = %s, updated_at = %s WHERE id = %s",
            (filled_by, now, order["id"]),
        )
    payload: dict[str, Any] = {
        "ticker": order["ticker"],
        "company": order["company_name"],
        "qty": fill["qty"],
        "price": terms.price,
    }
    if order["side"] == "sell":
        payload["side"] = "sell"
    draft = run_audit("system:simbist", "order.filled", "order", order["id"], payload, order["run_id"])
    await append(conn, [draft], now=now)
    if order["side"] == "sell":
        await close_position(
            conn, book="paper", exit_proposal=order["proposal_id"], qty=fill["qty"], price=terms.price, at=now
        )
    else:
        await open_position(
            conn,
            book="paper",
            proposal_id=order["proposal_id"],
            run_id=order["run_id"],
            qty=fill["qty"],
            avg_cost=terms.price,
            opened_at=now,
        )
    return {**fill, "ticker": order["ticker"]}


async def book_miss(conn: AsyncConnection[Any], order: dict[str, Any], reason: MissReason, now: datetime) -> None:
    """The order did not fill and is not retried (06 §5): canceled (or rejected at taban), audited."""
    status, cancel = MISS_STATUS.get(reason, ("canceled", "day_end"))
    await conn.execute(
        "UPDATE trading.orders SET status = %s, cancel_reason = %s, miss_reason = %s, updated_at = %s WHERE id = %s",
        (status, cancel, reason, now, order["id"]),
    )
    payload = {"ticker": order["ticker"], "company": order["company_name"], "reason": reason}
    draft = run_audit("system:simbist", "order.missed", "order", order["id"], payload, order["run_id"])
    await append(conn, [draft], now=now)
