"""GET /runs/{run_id}/explain: the stored "Neden bu işlem?" document plus its live parts.

Port of kaptan-panel/src/lib/api/mock/selectors.ts explainFor(). The base document is
`trading.agent_runs.explain` (fixture or pipeline output); on top of it:
- approval: the card with its effective status;
- run.status: `completed` once approved;
- orders/fills: the run's SimBIST orders from trading.orders, then the ticket's derived order;
- ticket: the run's order ticket (effective entry); audit_positions: last 8 ledger rows of the run.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.approvals.reads import (
    card_from_row,
    card_rows,
    orders_for_run,
    risk_flags,
    ticket_from_row,
    ticket_rows,
)
from kaptan.approvals.ticket_doc import ticket_order

AUDIT_POSITIONS_LIMIT: Final = 8

RUN_SQL: Final = """
SELECT run_id, kind, visible, explain FROM trading.agent_runs WHERE run_id = %s
"""

AUDIT_SQL: Final = """
SELECT chain_pos, action, hash FROM (
  SELECT chain_pos, action, hash FROM audit.audit_log WHERE run_id = %s ORDER BY chain_pos DESC LIMIT %s
) last ORDER BY chain_pos
"""


async def audit_positions(conn: AsyncConnection[Any], run_id: str) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(AUDIT_SQL, (run_id, AUDIT_POSITIONS_LIMIT))
        rows = await cur.fetchall()
    return [{"chain_pos": int(r["chain_pos"]), "action": r["action"], "hash": r["hash"]} for r in rows]


async def _approval(conn: AsyncConnection[Any], base: dict[str, Any], *, now: datetime) -> dict[str, Any] | None:
    proposal = base.get("proposal") or base.get("approval")
    if proposal is None:
        return None
    rows = await card_rows(conn, proposal_id=proposal["proposal_id"])
    if not rows:
        return None
    flags = await risk_flags(conn)
    return card_from_row(rows[0], kill_on=flags.kill_on, now=now)


async def explain_for(conn: AsyncConnection[Any], run_id: str, *, now: datetime) -> dict[str, Any] | None:
    """The overlaid Explain document, or None (unknown run, or one that is not visible)."""
    async with conn.cursor() as cur:
        await cur.execute(RUN_SQL, (run_id,))
        run = await cur.fetchone()
    if run is None or not run["visible"]:
        return None
    base: dict[str, Any] = run["explain"]
    approval = await _approval(conn, base, now=now)
    ticket = None
    if approval is not None and approval["status"] == "approved":
        rows = await ticket_rows(conn, run_id=run_id)
        ticket = ticket_from_row(rows[0], now) if rows else None
    orders = await orders_for_run(conn, run_id)
    if ticket is not None:
        orders.append(ticket_order(ticket, approval["decided_at"] if approval else None))
    orders.sort(key=lambda o: o["broker"] != "simbist")  # stable: paper orders first, then the ticket's
    status = "completed" if approval and approval["status"] == "approved" else base["run"]["status"]
    return {
        **base,
        "run": {**base["run"], "status": status},
        "approval": approval,
        "orders": orders,
        "fills": [f for o in orders for f in o["fills"]],
        "ticket": ticket,
        "audit_positions": await audit_positions(conn, run_id),
    }
