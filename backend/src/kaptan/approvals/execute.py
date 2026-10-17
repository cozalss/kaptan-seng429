"""After an approval: the order ticket, the SimBIST paper order and (intraday) its fill 1.8 s later.

Port of kaptan-panel/src/lib/api/mock/scenarios.ts executeApproved(). `execute_approved()` runs
inside the decision's transaction and returns the SSE events to publish after commit; the fill is
a demo timer (`schedule_fill` → kaptan.demo.timers.later) that re-checks the order in its own transaction, so a kill
switch (order cancelled) or a demo reset (order gone) in the meantime turns it into a no-op.
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import datetime
from functools import cache
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.approvals.fmt_tr import ist_date
from kaptan.approvals.reads import ticket_from_row, ticket_rows
from kaptan.approvals.ticket_doc import TICKET_SEQ_BASE, build_ticket, parse_iso
from kaptan.audit.writer import AuditDraft, append
from kaptan.clock import DEMO_DAY
from kaptan.demo.fixtures import DemoFixtures
from kaptan.demo.timers import later
from kaptan.domain.schemas import iso_ms
from kaptan.events.publish import publish
from kaptan.portfolio.marks import js_round
from kaptan.portfolio.positions import open_position

#: Real time between an intraday order and its SimBIST fill (scenarios.ts `later(1_800, …)`).
FILL_DELAY_S: float = 1.8
DEMO_E3_RUN: Final = "run-demo-e3-ornek"
DEMO_E3_FILL_PRICE: Final = 48.32
#: Mock db.audit(): entries tied to a run carry the live strategy version.
RUN_STRATEGY_VERSION: Final = "v1.1-fwd"
COMMISSION_RATE: Final = 0.0005
BSMV_RATE: Final = 0.05
SLIPPAGE_BPS: Final = 6

Event = tuple[str, dict[str, Any]]
_TASKS: set[asyncio.Task[None]] = set()


@dataclass(frozen=True, slots=True)
class FillJob:
    order_id: str
    run_id: str
    proposal_id: str
    ticker: str
    company_name: str
    qty: int
    price: float


@cache
def _fixture_run_ids() -> tuple[str, ...]:
    return tuple(r["explain"]["run"]["run_id"] for r in DemoFixtures().runs if r["set"] != "demo")


@cache
def _demo_ticket() -> dict[str, Any]:
    doc: dict[str, Any] = DemoFixtures().json("demo_order_ticket.json")
    return doc


async def ticket_seq(conn: AsyncConnection[Any], run_id: str) -> int:
    """10 + the run's index in allSpecs() (day runs, then history; anything else after them)."""
    ids = _fixture_run_ids()
    if run_id in ids:
        return TICKET_SEQ_BASE + ids.index(run_id)
    async with conn.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM trading.order_tickets")
        row = await cur.fetchone()
    return TICKET_SEQ_BASE + len(ids) + int(row["n"] if row else 0)


def run_audit(
    actor: str, action: str, entity_type: str, entity_id: str, payload: dict[str, Any], run_id: str
) -> AuditDraft:
    return AuditDraft(actor, action, entity_type, entity_id, payload, run_id, RUN_STRATEGY_VERSION)


async def _issue_ticket(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    """selectors.ts ticketFor(): one ticket per approval decided on or after the demo day."""
    decided_at: str = card["decided_at"]
    if ist_date(parse_iso(decided_at)) < DEMO_DAY:
        return None
    if card["run_id"] == DEMO_E3_RUN:
        raw = {k: v for k, v in _demo_ticket().items() if k != "entry"}
    else:
        async with conn.cursor() as cur:
            await cur.execute("SELECT explain FROM trading.agent_runs WHERE run_id = %s", (card["run_id"],))
            run = await cur.fetchone()
        explain = run["explain"] if run else {}
        seq = await ticket_seq(conn, card["run_id"])
        raw = {k: v for k, v in build_ticket(card, explain, seq=seq, decided_at=decided_at).items() if k != "entry"}
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO trading.order_tickets (ticket_no, order_id, proposal_id, run_id, doc, created_at, valid_until)
            VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
            (
                raw["ticket_no"],
                raw["order_id"],
                raw["proposal_id"],
                raw["run_id"],
                Jsonb(raw),
                parse_iso(raw["created_at"]),
                parse_iso(raw["valid_until"]),
            ),
        )
    rows = await ticket_rows(conn, ticket_no=raw["ticket_no"])
    return ticket_from_row(rows[0], now) if rows else None


def paper_order(card: dict[str, Any], now: datetime) -> dict[str, Any]:
    order_id = "ord-s-" + card["run_id"].removeprefix("run-")
    auction = card["entry"] == "next_open_auction"
    approved = card["approved_notional_try"]
    qty = max(1, math.floor(approved / card["limit_price"])) if approved else card["qty"]
    return {
        "id": order_id,
        "client_order_id": f"kaptan-{order_id}",
        "proposal_id": card["proposal_id"],
        "run_id": card["run_id"],
        "ticker": card["ticker"],
        "company_name": card["company_name"],
        "side": "buy",
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


ORDER_UPSERT: Final = """
INSERT INTO trading.orders (id, client_order_id, proposal_id, run_id, ticker, company_name, side, order_type, tif,
  qty, limit_price, status, broker, cancel_reason, is_fixture, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET qty = EXCLUDED.qty, tif = EXCLUDED.tif, status = EXCLUDED.status,
  cancel_reason = NULL, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
"""


async def execute_approved(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime
) -> tuple[list[Event], FillJob | None]:
    """Ticket (audit `ticket.issued`) and paper order for an approved card; returns (events, fill job)."""
    events: list[Event] = []
    ticket = await _issue_ticket(conn, card, now)
    if ticket is not None:
        payload = {"qty": ticket["qty"], "limit_price": ticket["limit_price"], "stage": ticket["stage"]}
        draft = run_audit(
            "system:order_ticket", "ticket.issued", "order_ticket", ticket["ticket_no"], payload, card["run_id"]
        )
        await append(conn, [draft], now=now)
        events.append(("ticket", ticket))
    order = paper_order(card, now)
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM trading.fills WHERE order_id = %s", (order["id"],))
        await cur.execute(
            ORDER_UPSERT,
            (
                *(order[k] for k in ("id", "client_order_id", "proposal_id", "run_id", "ticker", "company_name")),
                *(order[k] for k in ("side", "order_type", "tif", "qty", "limit_price", "status", "broker")),
                order["is_fixture"],
                now,
                now,
            ),
        )
    events.append(("order", order))
    if order["status"] != "accepted":
        return events, None
    price = DEMO_E3_FILL_PRICE if card["run_id"] == DEMO_E3_RUN else js_round(card["limit_price"] * 0.995 * 100) / 100
    job = FillJob(
        order["id"], card["run_id"], card["proposal_id"], card["ticker"], card["company_name"], order["qty"], price
    )
    return events, job


def fill_doc(job: FillJob, now: datetime) -> dict[str, Any]:
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


async def apply_fill(conn: AsyncConnection[Any], job: FillJob, now: datetime) -> dict[str, Any] | None:
    """The fill, in the caller's transaction; None when the order is no longer `accepted`."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT status FROM trading.orders WHERE id = %s FOR UPDATE", (job.order_id,))
        row = await cur.fetchone()
        if row is None or row["status"] != "accepted":
            return None
        fill = fill_doc(job, now)
        await cur.execute(
            "INSERT INTO trading.fills VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                fill["id"],
                job.order_id,
                job.qty,
                job.price,
                fill["commission"],
                fill["bsmv"],
                SLIPPAGE_BPS,
                now,
                "simbist",
            ),
        )
        await cur.execute(
            "UPDATE trading.orders SET status = 'filled', updated_at = %s WHERE id = %s", (now, job.order_id)
        )
    payload = {"ticker": job.ticker, "company": job.company_name, "qty": job.qty, "price": job.price}
    await append(
        conn, [run_audit("system:simbist", "order.filled", "order", job.order_id, payload, job.run_id)], now=now
    )
    await open_position(
        conn,
        book="paper",
        proposal_id=job.proposal_id,
        run_id=job.run_id,
        qty=job.qty,
        avg_cost=job.price,
        opened_at=now,
    )
    return {**fill, "ticker": job.ticker}


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


async def wait_for_fills() -> None:
    """Tests: wait until every scheduled fill has run (or was cancelled)."""
    while _TASKS:
        await asyncio.gather(*list(_TASKS), return_exceptions=True)
