"""After an approval: the order ticket (emir fişi). Nothing is sent and nothing is simulated.

`execute_approved()` runs inside the decision's transaction and returns the SSE events to publish after commit.
The ticket goes through `GuardedBroker(OrderTicketBroker)` (cooldown and the hard cap are checked
again at send); a refusal rolls the approval back with the guard's code and Turkish text. A buy ticket is sized
from the approved notional and the free cash of the person's own book; a sell ticket sells what the book holds
of the position. The person enters the order at their own bank and records the real fill
(`approvals.service.mark_ticket`): only then do the book's cash and positions move.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.errors import ApiError
from kaptan.approvals.ticket_doc import NoCashError, book_qty
from kaptan.audit.writer import append
from kaptan.brokers import config as broker_config
from kaptan.brokers.base import BrokerError, OrderIntent, OrderRefused
from kaptan.brokers.config import ExecConfig
from kaptan.brokers.guarded import GuardedBroker, route
from kaptan.brokers.ledger import RUN_STRATEGY_VERSION, run_audit
from kaptan.brokers.ticket import OrderTicketBroker, ticket_seq
from kaptan.risk.book import own_book

Event = tuple[str, dict[str, Any]]

__all__ = ["RUN_STRATEGY_VERSION", "execute_approved", "run_audit", "ticket_seq"]

NO_CASH: Final = "Kasanda bu öneriyi alacak kadar para yok."
NOT_ARMED: Final = "Bu emir şu an gönderilemez."

HELD_SQL: Final = """
SELECT p.qty FROM trading.exit_signals s
JOIN trading.positions p ON p.book = 'personal' AND p.source_proposal = s.source_proposal
WHERE s.proposal_id = %s
"""


async def _held_qty(conn: AsyncConnection[Any], card: dict[str, Any]) -> int:
    """An exit's ticket sells what the book holds of that position (06 R12: no short selling)."""
    async with conn.cursor() as cur:
        await cur.execute(HELD_SQL, (card["proposal_id"],))
        row = await cur.fetchone()
    return int(row["qty"]) if row else 0


async def _qty(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> int | None:
    """Shares on the ticket: a sell = what is held (None: nothing to sell); a buy = the approved notional capped by
    the free cash. 409 no_cash when the cash does not buy one share."""
    if card.get("side", "buy") == "sell":
        held = await _held_qty(conn, card)
        return held if held > 0 else None
    try:
        return book_qty(card, free_cash_try=float((await own_book(conn, now)).free_cash))
    except NoCashError as exc:
        raise ApiError(409, "no_cash", NO_CASH) from exc


def _intent(card: dict[str, Any], qty: int) -> OrderIntent:
    return OrderIntent(
        client_order_id=f"fis-{card['proposal_id']}",
        ticker=card["ticker"],
        side=card.get("side", "buy"),
        order_type="limit",
        time_in_force="opg" if card["entry"] == "next_open_auction" else "day",
        qty=qty,
        limit_price=Decimal(str(card["limit_price"])),
        context={"card": card, "personal_qty": qty},
    )


async def _issue_ticket(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime, cfg: ExecConfig
) -> dict[str, Any] | None:
    qty = await _qty(conn, card, now)
    if qty is None:
        return None
    intent = _intent(card, qty)
    _mode, fallback = await route(conn, cfg, now, order_id=f"ord-fis-{card['run_id']}", run_id=card["run_id"])
    if fallback is not None:
        await append(conn, [fallback], now=now)
    broker = GuardedBroker(OrderTicketBroker(conn, now, cfg), conn, now, cfg)
    try:
        ack = await broker.submit_order(intent)
    except OrderRefused as exc:
        raise ApiError(409, exc.code, exc.detail) from exc
    except BrokerError as exc:
        raise ApiError(409, "live_not_armed", NOT_ARMED) from exc
    return dict(ack.raw) if ack.status == "awaiting_manual_entry" else None


async def execute_approved(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> list[Event]:
    """The ticket (audit `ticket.issued`) for an approved card; returns the events to publish."""
    ticket = await _issue_ticket(conn, card, now, broker_config.current())
    if ticket is None:
        return []
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
    return [("ticket", ticket)]
