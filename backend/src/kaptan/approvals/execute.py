"""After an approval: the order ticket, the SimBIST paper order and (intraday, DEMO_MODE) its fill 1.8 s later.

Port of kaptan-panel/src/lib/api/mock/scenarios.ts executeApproved(), now behind the broker layer
(kaptan.brokers): the ticket goes through `OrderTicketBroker`, the paper order through
`GuardedBroker(SimBistBroker)`, both via the Broker protocol. `execute_approved()` runs inside the
decision's transaction and returns the SSE events to publish after commit.

DEMO_MODE: an intraday order fills at limit × 0.995 (6 bps, the demo E3 run at 48.32) as a demo
timer (`schedule_fill` → kaptan.demo.timers.later) that re-checks the order in its own transaction,
so a kill switch (order cancelled) or a demo reset (order gone) in the meantime makes it a no-op.
The timer is in memory; `resume_pending_fills()` settles any fill a restart dropped (single API
process assumed, see kaptan.demo.timers). Tickets exist from the demo day on.
Outside DEMO_MODE: no timer; next-open orders wait for `run_open_fill`, intraday ones for the next
available price (kaptan.brokers.fills); every approval gets its ticket.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import replace
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.approvals.fmt_tr import ist_date
from kaptan.approvals.ticket_doc import parse_iso
from kaptan.audit.writer import append
from kaptan.brokers import config as broker_config
from kaptan.brokers.base import BrokerError, OrderIntent, OrderRefused
from kaptan.brokers.config import ExecConfig
from kaptan.brokers.guarded import GuardedBroker, route
from kaptan.brokers.ledger import RUN_STRATEGY_VERSION, run_audit
from kaptan.brokers.simbist import (
    BSMV_RATE,
    COMMISSION_RATE,
    SLIPPAGE_BPS,
    FillJob,
    FillTerms,
    SimBistBroker,
    book_fill,
    fill_doc,
    lock_order,
    paper_order,
)
from kaptan.brokers.ticket import OrderTicketBroker, ticket_seq
from kaptan.clock import DEMO_DAY
from kaptan.demo.timers import later
from kaptan.events.publish import publish
from kaptan.portfolio.marks import js_round

log = logging.getLogger("kaptan.approvals.execute")

#: Real time between an intraday order and its SimBIST fill (scenarios.ts `later(1_800, …)`).
FILL_DELAY_S: float = 1.8
DEMO_E3_RUN: Final = "run-demo-e3-ornek"
DEMO_E3_FILL_PRICE: Final = 48.32
DEMO_FILL_FACTOR: Final = 0.995

Event = tuple[str, dict[str, Any]]
_TASKS: set[asyncio.Task[None]] = set()

__all__ = [
    "BSMV_RATE",
    "COMMISSION_RATE",
    "RUN_STRATEGY_VERSION",
    "SLIPPAGE_BPS",
    "FillJob",
    "execute_approved",
    "fill_doc",
    "paper_order",
    "run_audit",
    "ticket_seq",
]


def _wants_ticket(card: dict[str, Any], cfg: ExecConfig) -> bool:
    """selectors.ts ticketFor(): in DEMO_MODE one ticket per approval decided on or after the demo day.
    Outside it every approval gets one (a SELL only when your personal book holds the position)."""
    return not cfg.demo_mode or ist_date(parse_iso(card["decided_at"])) >= DEMO_DAY


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
    if not _wants_ticket(card, cfg):
        return None
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


async def execute_approved(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime
) -> tuple[list[Event], FillJob | None]:
    """Ticket (audit `ticket.issued`) and paper order for an approved card; returns (events, fill job)."""
    cfg = broker_config.current()
    events: list[Event] = []
    ticket = await _issue_ticket(conn, card, now, cfg)
    if ticket is not None:
        payload = {
            "qty": ticket["qty"],
            "limit_price": ticket["limit_price"],
            "stage": ticket["stage"],
            "side": ticket["side"],
        }
        draft = run_audit(
            "system:order_ticket", "ticket.issued", "order_ticket", ticket["ticket_no"], payload, card["run_id"]
        )
        await append(conn, [draft], now=now)
        events.append(("ticket", ticket))
    order = await _send_paper(conn, card, now, cfg)
    if order is None:
        return events, None
    events.append(("order", order))
    if order["status"] != "accepted" or not cfg.demo_mode:
        return events, None
    return events, demo_fill_job(order)


def demo_fill_price(run_id: str, limit_price: float) -> float:
    return DEMO_E3_FILL_PRICE if run_id == DEMO_E3_RUN else js_round(limit_price * DEMO_FILL_FACTOR * 100) / 100


def demo_fill_job(order: dict[str, Any]) -> FillJob:
    price = demo_fill_price(order["run_id"], float(order["limit_price"]))
    return FillJob(
        order["id"], order["run_id"], order["proposal_id"], order["ticker"], order["company_name"], order["qty"], price
    )


async def apply_fill(conn: AsyncConnection[Any], job: FillJob, now: datetime) -> dict[str, Any] | None:
    """The demo fill, in the caller's transaction; None when the order is no longer `accepted`."""
    order = await lock_order(conn, job.order_id)
    if order is None or order["status"] != "accepted":
        return None
    doc = fill_doc(job, now)
    terms = FillTerms(price=job.price, commission=doc["commission"], bsmv=doc["bsmv"], slippage_bps=SLIPPAGE_BPS)
    return await book_fill(conn, {**order, "qty": job.qty}, terms, now, filled_by="demo_timer")


async def run_fill(app: Any, job: FillJob) -> None:
    """The timer's body: its own pooled connection and transaction, SSE `fill` after commit."""
    async with app.state.pool.connection() as conn, conn.transaction():
        fill = await apply_fill(conn, job, app.state.clock.now())
    if fill is not None:
        await publish(app, "desk", "fill", fill)


def schedule_fill(app: Any, job: FillJob, delay_s: float | None = None) -> asyncio.Task[None]:
    """`FILL_DELAY_S` later, via the demo timer registry (/demo/reset and shutdown cancel it)."""
    delay = FILL_DELAY_S if delay_s is None else delay_s
    task = later(app, delay, lambda: run_fill(app, job), name=f"fill:{job.order_id}")
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return task


PENDING_DEMO_FILLS_SQL: Final = """
SELECT o.id, o.run_id, o.proposal_id, o.ticker, o.company_name, o.qty, o.limit_price, o.created_at
FROM trading.orders o
WHERE o.broker = 'simbist' AND o.status = 'accepted' AND NOT o.is_fixture
  AND NOT EXISTS (SELECT 1 FROM trading.fills f WHERE f.order_id = o.id)
ORDER BY o.created_at, o.id
"""


async def resume_pending_fills(app: Any) -> int:
    """Startup (DEMO_MODE): re-schedule every demo fill a restart dropped (an `accepted` SimBIST order
    without a fill) for what is left of its 1.8 s, at once if that has passed. Idempotent: the fill
    re-checks the order under a row lock, so a second schedule of the same order is a no-op."""
    try:
        async with app.state.pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(PENDING_DEMO_FILLS_SQL)
            rows = await cur.fetchall()
    except Exception:
        log.exception("demo fills: pending orders could not be read; none resumed")
        return 0
    now = app.state.clock.now()
    for row in rows:
        waited = (now - row["created_at"]).total_seconds()
        schedule_fill(app, demo_fill_job(dict(row)), delay_s=max(0.0, FILL_DELAY_S - waited))
    if rows:
        log.info("demo fills: %d pending fill(s) resumed after restart", len(rows))
    return len(rows)


async def wait_for_fills() -> None:
    """Tests: wait until every scheduled fill has run (or was cancelled)."""
    while _TASKS:
        await asyncio.gather(*list(_TASKS), return_exceptions=True)
