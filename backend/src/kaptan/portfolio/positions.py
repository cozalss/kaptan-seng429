"""Positions: the read model (GET /portfolio/positions) and `open_position()` (an entered buy ticket).

One book, the person's own. A position is either `suggestion` (a ticket the person entered at their bank:
it has a proposal, a run and an event type) or `own` (a share the person already held, entered by hand:
none of those). `holding_days`, `last_price`, `unrealized_pnl` and `managed_by_exit_rule` are computed at
read time. Every position change writes the book's ledger in the same transaction (`kaptan.portfolio.ledger`):
a fill moves cash by `qty x price +- commission`.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio import ledger
from kaptan.portfolio.closing import close_position, initial_stop
from kaptan.portfolio.marks import PERSONAL_HOLD_SESSIONS, holding_days, js_round, round_to
from kaptan.prices.calendar import add_sessions, istanbul_date
from kaptan.prices.models import Mark
from kaptan.prices.reads import latest_marks

#: The only book there is; the column stays in the schema and in the Position document.
BOOK: Final = "personal"

POSITION_SELECT: Final = """
SELECT p.id, p.origin, p.book, p.ticker, p.company_name, p.qty, p.avg_cost, p.opened_at, p.planned_exit_date,
       p.source_proposal, p.run_id, p.event_type, p.strategy_version, p.realized_pnl,
       r.disclosure_index,
       COALESCE((SELECT positions_managed_by_exit FROM trading.risk_state WHERE id = 1), false) AS managed
FROM trading.positions p
LEFT JOIN trading.agent_runs r ON r.run_id = p.run_id
"""
LIST_SQL: Final = POSITION_SELECT + "ORDER BY p.opened_at DESC, p.id"
ONE_SQL: Final = POSITION_SELECT + "WHERE p.id = %s"
BY_PROPOSAL_SQL: Final = POSITION_SELECT + "WHERE p.book = 'personal' AND p.source_proposal = %s"


def position_view(row: dict[str, Any], now: datetime, mark: Mark | None = None) -> dict[str, Any]:
    """One DB row (LIST_SQL) -> a Position document. `mark` = the stored price; without one the cost (the
    book values a share with no stored price the same way): no price, no gain or loss.
    `price_as_of` is the mark's "known at" time (null when no stored price was used)."""
    last = float(mark.price) if mark is not None else float(row["avg_cost"])
    qty = int(row["qty"])
    avg = float(row["avg_cost"])
    own = row["origin"] == "own"
    return {
        "id": f"pozisyon-{row['id']}",
        "origin": row["origin"],
        "ticker": row["ticker"],
        "company_name": row["company_name"],
        "qty": qty,
        "avg_cost": avg,
        "last_price": round_to(last, 2),
        "opened_at": row["opened_at"],
        "planned_exit_date": row["planned_exit_date"],
        "holding_days": holding_days(row["opened_at"], now),
        "source_proposal": "" if own else row["source_proposal"],
        "run_id": "" if own else row["run_id"],
        "event_type": "IGNORE" if own else row["event_type"],
        "strategy_version": row["strategy_version"],
        "unrealized_pnl": js_round((last - avg) * qty),
        "realized_pnl": float(row["realized_pnl"]),
        "managed_by_exit_rule": bool(row["managed"]) and not own,
        "book": BOOK,
        "price_as_of": None if mark is None else mark.known_at,
    }


async def list_positions(conn: AsyncConnection[Any], now: datetime, *, live: bool = True) -> list[dict[str, Any]]:
    """Every open position, newest opened first (empty before the starting money exists).

    `live`: mark with the latest stored raw price; a ticker without one reads as `position_view` says."""
    if not await ledger.started(conn):
        return []
    async with conn.cursor() as cur:
        await cur.execute(LIST_SQL)
        rows = await cur.fetchall()
    marks = await latest_marks(conn, [r["ticker"] for r in rows], now) if live and rows else {}
    return [position_view(r, now, marks.get(r["ticker"])) for r in rows]


RUN_SQL: Final = """
SELECT r.ticker, r.event_type, r.strategy_version, r.disclosure_index,
       COALESCE(i.name, r.company_name) AS company_name, i.price AS issuer_price,
       (tp.doc->>'holding_days_min')::int AS holding_days_min,
       (tp.doc->>'stop_price')::float AS stop_price, (tp.doc->>'ref_price')::float AS ref_price,
       coalesce(tp.doc->>'side', 'buy') AS side
FROM trading.agent_runs r
JOIN trading.trade_proposals tp ON tp.proposal_id = %s AND tp.run_id = r.run_id
LEFT JOIN core.issuers i ON i.ticker = r.ticker
WHERE r.run_id = %s
"""

UPSERT_SQL: Final = """
INSERT INTO trading.positions (book, ticker, company_name, qty, avg_cost, last_price, opened_at,
  planned_exit_date, source_proposal, run_id, event_type, strategy_version, realized_pnl, stop_price, stop_pct)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s)
ON CONFLICT (book, source_proposal) DO UPDATE SET qty = EXCLUDED.qty, avg_cost = EXCLUDED.avg_cost,
  last_price = EXCLUDED.last_price, opened_at = EXCLUDED.opened_at, planned_exit_date = EXCLUDED.planned_exit_date,
  stop_price = EXCLUDED.stop_price, stop_pct = EXCLUDED.stop_pct, stop_moved_at = NULL
RETURNING id
"""


class PositionError(ValueError):
    """open_position() was called for a run/proposal that cannot hold a position."""


async def open_position(
    conn: AsyncConnection[Any],
    *,
    proposal_id: str,
    run_id: str,
    qty: int,
    avg_cost: float,
    opened_at: datetime,
    commission: Decimal = Decimal(0),
    commission_estimated: bool = False,
    ticket_no: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """The person's fill of an approved proposal: a buy opens the position and takes `qty x price +
    commission` out of cash; a sell (an exit) closes it and adds `qty x price - commission`. Returns the
    Position document (a buy) or the closing summary (a sell).

    Call it inside the caller's transaction (no commit here), with the book lock taken. Ticker, company,
    event type and strategy version come from the run; the planned exit date is `holding_days_min` sessions
    (five when the proposal has none) after the fill's Istanbul date."""
    if qty <= 0 or avg_cost <= 0:
        raise PositionError("qty and avg_cost must be positive")
    if opened_at.tzinfo is None:
        raise PositionError("opened_at must be timezone-aware")
    recorded = now or opened_at
    async with conn.cursor() as cur:
        await cur.execute(RUN_SQL, (proposal_id, run_id))
        run = await cur.fetchone()
        if run is None:
            raise PositionError(f"no proposal {proposal_id!r} for run {run_id!r}")
        if run["side"] == "sell":  # an exit (X1-X4): the fill closes the position
            closed = await close_position(
                conn, exit_proposal=proposal_id, qty=qty, price=avg_cost, at=opened_at, commission=commission,
                commission_estimated=commission_estimated, ticket_no=ticket_no, now=recorded,
            )  # fmt: skip
            if closed is None:
                raise PositionError(f"exit {proposal_id!r} has no open position")
            return closed
        if run["event_type"] not in ("E1", "E2", "E3", "E4"):
            raise PositionError(f"run {run_id!r} has no tradable event type")
        sessions = int(run["holding_days_min"] or 0) or PERSONAL_HOLD_SESSIONS
        exit_date = add_sessions(istanbul_date(opened_at), sessions)
        issuer_price = run["issuer_price"]
        last = avg_cost if issuer_price is None else float(issuer_price)
        await cur.execute(
            UPSERT_SQL,
            (
                BOOK, run["ticker"], run["company_name"], qty, avg_cost, round_to(last, 2), opened_at, exit_date,
                proposal_id, run_id, run["event_type"], run["strategy_version"],
                *initial_stop(avg_cost, run["stop_price"], run["ref_price"]),
            ),
        )  # fmt: skip
        pos_row = await cur.fetchone()
        assert pos_row is not None
        await cur.execute(ONE_SQL, (pos_row["id"],))
        row = await cur.fetchone()
    assert row is not None
    await ledger.add_fill(
        conn, side="buy", ticker=run["ticker"], qty=qty, price=Decimal(str(avg_cost)), commission=commission,
        estimated=commission_estimated, filled_at=opened_at, now=recorded, position_id=int(pos_row["id"]),
        ticket_no=ticket_no,
    )  # fmt: skip
    return position_view(row, opened_at)
