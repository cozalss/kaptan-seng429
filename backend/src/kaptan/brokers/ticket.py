"""OrderTicket, the manual-entry adapter (04 §8.2, FR-27, 12 §2): it sends nothing, it writes an emir fişi.

`submit_order()` takes the approved card in `intent.context` and stores the ticket (30-minute TTL, limit
price); you key it into your own broker app and record the fill later (POST /tickets/{no}/mark). A buy ticket
is sized from the approved notional and the free cash of the person's own book (`kaptan.risk.book`); a SELL
ticket (an exit) sells what the book holds of the position (`intent.context["personal_qty"]`, no short selling).
Market, price band, planned exit dates and stage are the real ones at issue time.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.approvals.reads import ticket_from_row, ticket_rows
from kaptan.approvals.ticket_doc import (
    TICKET_CREATED_AFTER,
    TICKET_SEQ_BASE,
    TicketContext,
    build_ticket,
    entry_day,
    parse_iso,
)
from kaptan.brokers.base import BrokerMode, OrderAck, OrderIntent
from kaptan.brokers.config import ExecConfig
from kaptan.evalreports.stage import current_stage
from kaptan.market.segment import limit_pct_of, market_of
from kaptan.market.ticks import price_limits
from kaptan.portfolio.marks import add_sessions
from kaptan.risk.at_send import price_band
from kaptan.risk.book import own_book
from kaptan.text.turkish import IST

INSERT_SQL: Final = """
INSERT INTO trading.order_tickets (ticket_no, order_id, proposal_id, run_id, doc, created_at, valid_until)
VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
"""
KEYS_SQL: Final = "SELECT config_live, env_enabled, ui_key FROM trading.live_arm WHERE id = 1"
MARKET_LABELS: Final = {
    "yildiz": "Yıldız Pazar",
    "ana": "Ana Pazar",
    "alt": "Alt Pazar",
    "yip": "Yakın İzleme Pazarı",
    "poip": "PÖİP",
}
UNKNOWN_MARKET: Final = "Pazar bilinmiyor"


async def ticket_seq(conn: AsyncConnection[Any]) -> int:
    """The running number of the next ticket."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM trading.order_tickets")
        row = await cur.fetchone()
    return TICKET_SEQ_BASE + int(row["n"] if row else 0)


async def _mode_keys(conn: AsyncConnection[Any]) -> dict[str, bool]:
    async with conn.cursor() as cur:
        await cur.execute(KEYS_SQL)
        keys = await cur.fetchone()
    return {
        "config": bool(keys and keys["config_live"]),
        "env": bool(keys and keys["env_enabled"]),
        "ui": bool(keys and keys["ui_key"]),
    }


async def _upper_limit(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> float:
    """Tavan: the previous close plus the market's band; without a stored close, the limit price's own band."""
    _lower, upper = await price_band(conn, str(card["ticker"]), now)
    if upper is None:
        pct = await limit_pct_of(conn, str(card["ticker"]), now)
        upper = price_limits(Decimal(str(card["limit_price"])), pct)[1]
    return float(upper)


async def ticket_context(conn: AsyncConnection[Any], card: dict[str, Any], now: datetime) -> TicketContext:
    """The person's book and the market's facts for a ticket issued now."""
    book = await own_book(conn, now)
    market = await market_of(conn, str(card["ticker"]), now)
    created = parse_iso(card["decided_at"]) + TICKET_CREATED_AFTER
    first: date = entry_day(created)
    lo, hi = card["holding_days"]
    return TicketContext(
        equity_try=float(book.equity),
        free_cash_try=float(book.free_cash),
        market_label=MARKET_LABELS.get(market or "", UNKNOWN_MARKET),
        upper_limit=await _upper_limit(conn, card, now),
        stage=current_stage(now.astimezone(IST).date()),
        exit_min=add_sessions(first, int(lo)),
        exit_max=add_sessions(first, int(hi)),
    )


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
        async with self._conn.cursor() as cur:
            await cur.execute("SELECT explain FROM trading.agent_runs WHERE run_id = %s", (card["run_id"],))
            run = await cur.fetchone()
        explain = run["explain"] if run else {}
        seq = await ticket_seq(self._conn)
        context = await ticket_context(self._conn, card, self._now)
        keys = await _mode_keys(self._conn)
        doc = build_ticket(card, explain, seq=seq, decided_at=decided_at, context=context, mode_keys=keys, qty=qty)
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
