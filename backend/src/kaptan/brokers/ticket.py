"""OrderTicket, the personal-mode adapter (04 §8.2, FR-27, 12 §2): it sends nothing, it writes an emir fişi.

`submit_order()` takes the approved card in `intent.context` and stores the ticket (30-minute TTL,
limit price, the account it sizes for); you key it into your own broker app and mark it later
(POST /tickets/{no}/mark). A buy ticket is sized from the approved notional; a SELL ticket (an exit)
sells what your personal book holds (`intent.context["personal_qty"]`, no short selling).
"""

from __future__ import annotations

from datetime import datetime
from functools import cache
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.approvals.reads import ticket_from_row, ticket_rows
from kaptan.approvals.ticket_doc import TICKET_SEQ_BASE, build_ticket, parse_iso
from kaptan.brokers.base import BrokerMode, OrderAck, OrderIntent
from kaptan.brokers.config import ExecConfig
from kaptan.demo.fixtures import DemoFixtures
from kaptan.portfolio.pnl import last_live_point

DEMO_E3_RUN: Final = "run-demo-e3-ornek"
INSERT_SQL: Final = """
INSERT INTO trading.order_tickets (ticket_no, order_id, proposal_id, run_id, doc, created_at, valid_until)
VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
"""
KEYS_SQL: Final = "SELECT config_live, env_enabled, ui_key FROM trading.live_arm WHERE id = 1"


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


async def _live_sizing(conn: AsyncConnection[Any], cfg: ExecConfig) -> dict[str, Any]:
    """Outside DEMO_MODE: the configured account, the desk's last equity and the live_arm keys."""
    last = await last_live_point(conn)
    async with conn.cursor() as cur:
        await cur.execute(KEYS_SQL)
        keys = await cur.fetchone()
    return {
        "account_equity_try": float(cfg.personal_account_try),
        "paper_equity_try": last[0] if last is not None else float(cfg.paper_capital_try),
        "mode_keys": {
            "config": bool(keys and keys["config_live"]),
            "env": bool(keys and keys["env_enabled"]),
            "ui": bool(keys and keys["ui_key"]),
        },
    }


class OrderTicketBroker:
    """The Broker protocol for personal mode: an order is a ticket awaiting your manual entry."""

    name = "order_ticket"
    mode = BrokerMode.MANUAL

    def __init__(self, conn: AsyncConnection[Any], now: datetime, cfg: ExecConfig) -> None:
        self._conn = conn
        self._now = now
        self._cfg = cfg

    async def _raw_ticket(self, card: dict[str, Any], qty: int | None = None) -> dict[str, Any]:
        decided_at: str = card["decided_at"]
        if card["run_id"] == DEMO_E3_RUN and self._cfg.demo_mode:
            return {k: v for k, v in _demo_ticket().items() if k != "entry"}
        async with self._conn.cursor() as cur:
            await cur.execute("SELECT explain FROM trading.agent_runs WHERE run_id = %s", (card["run_id"],))
            run = await cur.fetchone()
        explain = run["explain"] if run else {}
        seq = await ticket_seq(self._conn, card["run_id"])
        extra = {} if self._cfg.demo_mode else await _live_sizing(self._conn, self._cfg)
        doc = build_ticket(card, explain, seq=seq, decided_at=decided_at, qty=qty, **extra)
        return {k: v for k, v in doc.items() if k != "entry"}

    async def submit_order(self, intent: OrderIntent) -> OrderAck:
        """Store the ticket for `intent.context["card"]`; `raw` is the OrderTicket document."""
        qty = intent.context.get("personal_qty")
        raw = await self._raw_ticket(dict(intent.context["card"]), None if qty is None else int(qty))
        async with self._conn.cursor() as cur:
            await cur.execute(
                INSERT_SQL,
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
        rows = await ticket_rows(self._conn, ticket_no=raw["ticket_no"])
        ticket = ticket_from_row(rows[0], self._now) if rows else None
        if ticket is None:
            return OrderAck(intent.client_order_id, None, "rejected")
        return OrderAck(intent.client_order_id, raw["order_id"], "awaiting_manual_entry", raw=ticket)

    async def get_order(self, client_order_id: str) -> OrderAck | None:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "SELECT order_id FROM trading.order_tickets WHERE 'fis-' || ticket_no = %s", (client_order_id,)
            )
            row = await cur.fetchone()
        return None if row is None else OrderAck(client_order_id, row["order_id"], "awaiting_manual_entry")

    async def cancel_order(self, client_order_id: str) -> None:
        """A ticket is cancelled by marking it (POST /tickets/{no}/mark); nothing to send."""

    async def cancel_all(self) -> int:
        return 0
