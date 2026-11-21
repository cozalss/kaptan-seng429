"""Read side of approvals, tickets and orders: the stored rows plus the mock's live overlays.

- An approval card = `trading.approvals.card` with the decision columns on top; its *effective*
  status follows selectors.ts patchApproval(): pending past `expires_at` → `expired`.
- A ticket = `order_tickets.doc` + its entry (your mark, or awaiting/expired by valid_until).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.approvals.ticket_doc import effective_entry
from kaptan.domain.schemas import iso_ms

DECISION_FIELDS: Final = (
    "status",
    "decided_by",
    "decided_role",
    "decided_at",
    "decision_comment",
    "approved_notional_try",
)

CARD_SQL: Final = """
SELECT a.proposal_id, a.run_id, a.card, a.status, a.decided_by, a.decided_role, a.decided_at,
       a.decision_comment, a.approved_notional_try, a.created_at, a.expires_at, r.injected_at
FROM trading.approvals a JOIN trading.agent_runs r ON r.run_id = a.run_id
WHERE r.visible AND (%(pid)s::text IS NULL OR a.proposal_id = %(pid)s)
ORDER BY a.created_at DESC, a.proposal_id
"""

TICKET_SQL: Final = """
SELECT t.ticket_no, t.doc, t.entry_status, t.filled_qty, t.avg_price, t.filled_at, t.note, t.marked_at,
       t.valid_until, t.created_at, t.commission_try, t.commission_estimated, t.late,
       t.commission_rate, t.commission_rate_own, t.corrected_at
FROM trading.order_tickets t JOIN trading.agent_runs r ON r.run_id = t.run_id
WHERE r.visible AND (%(no)s::text IS NULL OR t.ticket_no = %(no)s)
  AND (%(run)s::text IS NULL OR t.run_id = %(run)s)
ORDER BY t.created_at DESC, t.ticket_no
"""

ORDERS_SQL: Final = """
SELECT o.id, o.client_order_id, o.proposal_id, o.run_id, o.ticker, o.company_name, o.side, o.order_type,
       o.tif, o.qty, o.limit_price, o.status, o.broker, o.cancel_reason, o.is_fixture, o.created_at,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', f.id, 'order_id', f.order_id, 'qty', f.qty, 'price', f.price, 'commission', f.commission,
           'bsmv', f.bsmv, 'slippage_bps', f.slippage_bps, 'filled_at', f.filled_at, 'source', f.source)
           ORDER BY f.filled_at, f.id)
         FROM trading.fills f WHERE f.order_id = o.id), '[]'::jsonb) AS fills
FROM trading.orders o
WHERE o.run_id = %s
ORDER BY o.created_at, o.id
"""


def _iso(value: datetime | None) -> str | None:
    return None if value is None else iso_ms(value)


def card_from_row(row: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    """The card with its decision columns and effective status."""
    card: dict[str, Any] = {
        **row["card"],
        "status": row["status"],
        "decided_by": row["decided_by"],
        "decided_at": _iso(row["decided_at"]),
        "decision_comment": row["decision_comment"],
        "approved_notional_try": row["approved_notional_try"],
    }
    if card["status"] == "pending" and row["expires_at"] <= now:
        return {**card, "status": "expired"}
    return card


async def card_rows(
    conn: AsyncConnection[Any], *, proposal_id: str | None = None, lock: bool = False
) -> list[dict[str, Any]]:
    """Approval rows of visible runs, newest first."""
    sql = CARD_SQL + (" FOR UPDATE OF a" if lock else "")
    async with conn.cursor() as cur:
        await cur.execute(sql, {"pid": proposal_id})
        return list(await cur.fetchall())


async def list_cards(
    conn: AsyncConnection[Any], *, now: datetime, proposal_id: str | None = None
) -> list[dict[str, Any]]:
    rows = await card_rows(conn, proposal_id=proposal_id)
    return [card_from_row(r, now=now) for r in rows]


def ticket_from_row(row: dict[str, Any], now: datetime) -> dict[str, Any]:
    mark = None
    if row["entry_status"] != "awaiting" or row["marked_at"] is not None:
        mark = {
            "status": row["entry_status"],
            "filled_qty": row["filled_qty"],
            "avg_price": row["avg_price"],
            "filled_at": _iso(row["filled_at"]),
            "note": row["note"],
            "marked_at": _iso(row["marked_at"]),
            "commission_try": float(row["commission_try"] or 0),
            "commission_estimated": bool(row["commission_estimated"]),
            "late": bool(row["late"]),
            "commission_rate": None if row["commission_rate"] is None else float(row["commission_rate"]),
            "commission_rate_own": bool(row["commission_rate_own"]),
            "corrected": row["corrected_at"] is not None,
        }
    return {**row["doc"], "entry": effective_entry(row["valid_until"], mark, now)}


async def ticket_rows(
    conn: AsyncConnection[Any], *, ticket_no: str | None = None, run_id: str | None = None, lock: bool = False
) -> list[dict[str, Any]]:
    sql = TICKET_SQL + (" FOR UPDATE OF t" if lock else "")
    async with conn.cursor() as cur:
        await cur.execute(sql, {"no": ticket_no, "run": run_id})
        return await cur.fetchall()


async def list_tickets(conn: AsyncConnection[Any], *, now: datetime) -> list[dict[str, Any]]:
    return [ticket_from_row(r, now) for r in await ticket_rows(conn)]


def _order_doc(row: dict[str, Any]) -> dict[str, Any]:
    doc = {k: row[k] for k in row if k not in ("created_at", "fills", "cancel_reason")}
    fills = [{**f, "filled_at": iso_ms(datetime.fromisoformat(f["filled_at"]))} for f in row["fills"]]
    doc.update(created_at=iso_ms(row["created_at"]), fills=fills)
    if row["cancel_reason"] is not None:
        doc["cancel_reason"] = row["cancel_reason"]
    return doc


async def orders_for_run(conn: AsyncConnection[Any], run_id: str) -> list[dict[str, Any]]:
    """SimBIST orders of a run (fixture + session), each with its fills."""
    async with conn.cursor() as cur:
        await cur.execute(ORDERS_SQL, (run_id,))
        rows = await cur.fetchall()
    return [_order_doc(r) for r in rows]
