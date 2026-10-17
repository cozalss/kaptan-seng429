"""Positions: the read model (GET /portfolio/positions) and `open_position()` (used by package A).

Paper book: a SimBIST fill opens a position. Personal book: an order ticket marked "entered" with
the fill you saw at your own broker. `holding_days`, `last_price`, `unrealized_pnl` and
`managed_by_exit_rule` are computed at read time (selectors.ts positions() / personalPositions()).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.portfolio.marks import (
    PERSONAL_HOLD_SESSIONS,
    add_sessions,
    holding_days,
    js_round,
    mark_price,
    round_to,
)

Book = Literal["paper", "personal"]

POSITION_SELECT: Final = """
SELECT p.book, p.ticker, p.company_name, p.qty, p.avg_cost, p.opened_at, p.planned_exit_date,
       p.source_proposal, p.run_id, p.event_type, p.strategy_version, p.realized_pnl,
       i.price AS issuer_price, r.disclosure_index,
       COALESCE((SELECT positions_managed_by_exit FROM trading.risk_state WHERE id = 1), false) AS managed
FROM trading.positions p
JOIN trading.agent_runs r ON r.run_id = p.run_id
LEFT JOIN core.issuers i ON i.ticker = p.ticker
"""
LIST_SQL: Final = POSITION_SELECT + "ORDER BY p.opened_at DESC, (p.book = 'personal'), p.id"
ONE_SQL: Final = POSITION_SELECT + "WHERE p.book = %s AND p.source_proposal = %s"


def position_view(row: dict[str, Any], now: datetime) -> dict[str, Any]:
    """One DB row (LIST_SQL) → a Position document."""
    issuer_price = row["issuer_price"]
    last = (
        float(row["avg_cost"])
        if issuer_price is None
        else mark_price(
            book=row["book"],
            run_id=row["run_id"],
            issuer_price=float(issuer_price),
            disclosure_index=int(row["disclosure_index"]),
        )
    )
    qty = int(row["qty"])
    avg = float(row["avg_cost"])
    return {
        "ticker": row["ticker"],
        "company_name": row["company_name"],
        "qty": qty,
        "avg_cost": avg,
        "last_price": round_to(last, 2),
        "opened_at": row["opened_at"],
        "planned_exit_date": row["planned_exit_date"],
        "holding_days": holding_days(row["opened_at"], now),
        "source_proposal": row["source_proposal"],
        "run_id": row["run_id"],
        "event_type": row["event_type"],
        "strategy_version": row["strategy_version"],
        "unrealized_pnl": js_round((last - avg) * qty),
        "realized_pnl": float(row["realized_pnl"]),
        "managed_by_exit_rule": bool(row["managed"]),
        "book": row["book"],
    }


async def list_positions(conn: AsyncConnection[Any], now: datetime) -> list[dict[str, Any]]:
    """Every open position, newest opened first (paper before personal on a tie)."""
    async with conn.cursor() as cur:
        await cur.execute(LIST_SQL)
        rows = await cur.fetchall()
    return [position_view(r, now) for r in rows]


RUN_SQL: Final = """
SELECT r.ticker, r.event_type, r.strategy_version, r.disclosure_index,
       COALESCE(i.name, r.company_name) AS company_name, i.price AS issuer_price,
       (tp.doc->>'holding_days_min')::int AS holding_days_min
FROM trading.agent_runs r
JOIN trading.trade_proposals tp ON tp.proposal_id = %s AND tp.run_id = r.run_id
LEFT JOIN core.issuers i ON i.ticker = r.ticker
WHERE r.run_id = %s
"""

UPSERT_SQL: Final = """
INSERT INTO trading.positions (book, ticker, company_name, qty, avg_cost, last_price, opened_at,
  planned_exit_date, source_proposal, run_id, event_type, strategy_version, realized_pnl)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0)
ON CONFLICT (book, source_proposal) DO UPDATE SET qty = EXCLUDED.qty, avg_cost = EXCLUDED.avg_cost,
  last_price = EXCLUDED.last_price, opened_at = EXCLUDED.opened_at, planned_exit_date = EXCLUDED.planned_exit_date
"""


class PositionError(ValueError):
    """open_position() was called for a run/proposal that cannot hold a position."""


async def open_position(
    conn: AsyncConnection[Any],
    *,
    book: Book,
    proposal_id: str,
    run_id: str,
    qty: int,
    avg_cost: float,
    opened_at: datetime,
) -> dict[str, Any]:
    """Open (or, for the same book + proposal, replace) a position; returns the Position document.

    Call it inside the caller's transaction (no commit here). Ticker, company, event type and
    strategy version come from the run; the planned exit date is `holding_days_min` sessions after
    the fill (paper) or five sessions (personal), counted from the fill's UTC date like the mock.
    """
    if qty <= 0 or avg_cost <= 0:
        raise PositionError("qty and avg_cost must be positive")
    if opened_at.tzinfo is None:
        raise PositionError("opened_at must be timezone-aware")
    async with conn.cursor() as cur:
        await cur.execute(RUN_SQL, (proposal_id, run_id))
        run = await cur.fetchone()
        if run is None:
            raise PositionError(f"no proposal {proposal_id!r} for run {run_id!r}")
        if run["event_type"] not in ("E1", "E2", "E3", "E4"):
            raise PositionError(f"run {run_id!r} has no tradable event type")
        sessions = PERSONAL_HOLD_SESSIONS if book == "personal" else int(run["holding_days_min"] or 0)
        exit_date = add_sessions(opened_at.astimezone(UTC).date(), sessions)
        issuer_price = run["issuer_price"]
        last = (
            avg_cost
            if issuer_price is None
            else mark_price(
                book=book,
                run_id=run_id,
                issuer_price=float(issuer_price),
                disclosure_index=int(run["disclosure_index"]),
            )
        )
        await cur.execute(
            UPSERT_SQL,
            (
                book,
                run["ticker"],
                run["company_name"],
                qty,
                avg_cost,
                round_to(last, 2),
                opened_at,
                exit_date,
                proposal_id,
                run_id,
                run["event_type"],
                run["strategy_version"],
            ),
        )
        await cur.execute(ONE_SQL, (book, proposal_id))
        row = await cur.fetchone()
    assert row is not None
    return position_view(row, opened_at)
