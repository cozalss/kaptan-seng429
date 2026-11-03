"""After an approval: the order ticket and the SimBIST paper order.

Port of kaptan-panel/src/lib/api/mock/scenarios.ts executeApproved(), now behind the broker layer
(kaptan.brokers): the ticket goes through `OrderTicketBroker`, the paper order through
`GuardedBroker(SimBistBroker)`, both via the Broker protocol. `execute_approved()` runs inside the
decision's transaction and returns the SSE events to publish after commit.

Next-open orders wait for `run_open_fill`, intraday ones for the next available price (kaptan.brokers.fills);
every approval gets its ticket.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.audit.writer import append
from kaptan.brokers import config as broker_config
from kaptan.brokers.base import BrokerError, OrderIntent, OrderRefused
from kaptan.brokers.config import ExecConfig
from kaptan.brokers.guarded import GuardedBroker, route
from kaptan.brokers.ledger import RUN_STRATEGY_VERSION, run_audit
from kaptan.brokers.simbist import BSMV_RATE, COMMISSION_RATE, SLIPPAGE_BPS, SimBistBroker, paper_order
from kaptan.brokers.ticket import OrderTicketBroker, ticket_seq

Event = tuple[str, dict[str, Any]]

__all__ = [
    "BSMV_RATE",
    "COMMISSION_RATE",
    "RUN_STRATEGY_VERSION",
    "SLIPPAGE_BPS",
    "execute_approved",
    "paper_order",
    "run_audit",
    "ticket_seq",
]


PERSONAL_HELD_SQL: Final = """
SELECT p.qty FROM trading.exit_signals s
JOIN trading.positions p ON p.book = 'personal' AND p.source_proposal = s.source_proposal
WHERE s.proposal_id = %s
"""


async def _held_personal_qty(conn: AsyncConnection[Any], card: dict[str, Any]) -> int:
    """An exit's ticket sells what the personal book holds of that position (06 R12: no short selling)."""
    async with conn.cursor() as cur:
        await cur.execute(PERSONAL_HELD_SQL, (card["proposal_id"],))
        row = await cur.fetchone()
    return int(row["qty"]) if row else 0


def _intent(order: dict[str, Any], card: dict[str, Any]) -> OrderIntent:
    return OrderIntent(
        client_order_id=order["client_order_id"],
        ticker=order["ticker"],
        side=order["side"],
        order_type="limit",
        time_in_force=order["tif"],
        qty=int(order["qty"]),
        limit_price=Decimal(str(order["limit_price"])),
        context={"order": order, "card": card},
    )


async def _issue_ticket(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime, cfg: ExecConfig
) -> dict[str, Any] | None:
    held: int | None = None
    if card.get("side", "buy") == "sell":
        held = await _held_personal_qty(conn, card)
        if held <= 0:
            return None  # only the paper book holds it: the exit goes to SimBIST alone
    order = {**paper_order(card, now, held_qty=held), "client_order_id": f"fis-{card['proposal_id']}"}
    intent = _intent(order, card)
    if held is not None:
        intent = replace(intent, context={**intent.context, "personal_qty": held})
    ack = await OrderTicketBroker(conn, now, cfg).submit_order(intent)
    return dict(ack.raw) if ack.status == "awaiting_manual_entry" else None


async def _held_paper_qty(conn: AsyncConnection[Any], card: dict[str, Any]) -> int | None:
    """An exit sells at most what the paper book holds of the position it was raised for."""
    if card.get("side", "buy") != "sell":
        return None
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT p.qty FROM trading.exit_signals s
            JOIN trading.positions p ON p.book = 'paper' AND p.source_proposal = s.source_proposal
            WHERE s.proposal_id = %s""",
            (card["proposal_id"],),
        )
        row = await cur.fetchone()
    return int(row["qty"]) if row else 0


async def _refuse(conn: AsyncConnection[Any], order: dict[str, Any], exc: BrokerError, now: datetime) -> dict[str, Any]:
    """GuardedBroker said no: the order is stored as rejected and the refusal is audited."""
    code = exc.code if isinstance(exc, OrderRefused) else "live_not_armed"
    rejected = {**order, "status": "rejected"}
    await SimBistBroker(conn, now).submit_order(_intent(rejected, {}))
    payload = {"ticker": order["ticker"], "company": order["company_name"], "code": code}
    draft = run_audit("system:guarded_broker", "order.refused", "order", order["id"], payload, order["run_id"])
    await append(conn, [draft], now=now)
    return rejected


async def _send_paper(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime, cfg: ExecConfig
) -> dict[str, Any] | None:
    held = await _held_paper_qty(conn, card)
    if held == 0:
        return None  # an exit for a position only the personal book holds: nothing to sell on paper
    order = paper_order(card, now, held_qty=held)
    _mode, fallback = await route(conn, cfg, now, order_id=order["id"], run_id=card["run_id"])
    if fallback is not None:
        await append(conn, [fallback], now=now)
    broker = GuardedBroker(SimBistBroker(conn, now), conn, now, cfg)
    try:
        await broker.submit_order(_intent(order, card))
    except BrokerError as exc:
        return await _refuse(conn, order, exc, now)
    return order


async def execute_approved(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> list[Event]:
    """Ticket (audit `ticket.issued`) and paper order for an approved card; returns the events to publish."""
    cfg = broker_config.current()
    events: list[Event] = []
    ticket = await _issue_ticket(conn, card, now, cfg)
    if ticket is not None:
        payload = {
            "qty": ticket["qty"],
            "limit_price": ticket["limit_price"],
            "stage": ticket["stage"],
            "side": ticket["side"],
            # the ledger line names the company ("Örnek Enerji için emir fişi yazıldı") and search finds it
            "ticker": card["ticker"],
            "company": card["company_name"],
        }
        draft = run_audit(
            "system:order_ticket", "ticket.issued", "order_ticket", ticket["ticket_no"], payload, card["run_id"]
        )
        await append(conn, [draft], now=now)
        events.append(("ticket", ticket))
    order = await _send_paper(conn, card, now, cfg)
    return events if order is None else [*events, ("order", order)]
