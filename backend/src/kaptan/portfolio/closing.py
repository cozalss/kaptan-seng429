"""Closing a position: an exit's SELL fill (paper) or its ticket marked "entered" (personal).

trading.positions holds open positions only; a full exit moves the row to trading.closed_positions
(with the exit price, rule and realised P&L), a partial one shrinks it and books the realised part.
A stop exit (X2) starts the P8 cooldown: no new entry in the symbol for 10 sessions (06 §7.2).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.marks import round_to
from kaptan.prices.calendar import add_sessions, istanbul_date, next_session

#: P8: sessions without a new entry in a symbol after a stop exit.
COOLDOWN_SESSIONS: Final = 10

SIGNAL_SQL: Final = "SELECT source_proposal, rule, ticker FROM trading.exit_signals WHERE proposal_id = %s"
POSITION_SQL: Final = """
SELECT id, book, ticker, company_name, qty, avg_cost, opened_at, planned_exit_date, source_proposal, run_id,
       event_type, strategy_version, realized_pnl
FROM trading.positions WHERE book = %s AND source_proposal = %s FOR UPDATE
"""
CLOSED_SQL: Final = """
INSERT INTO trading.closed_positions (book, ticker, qty, avg_cost, exit_price, realized_pnl, opened_at, closed_at,
  source_proposal, exit_proposal, exit_rule, event_type, strategy_version)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
COOLDOWN_SQL: Final = """
INSERT INTO trading.symbol_cooldowns (ticker, until_day, reason, exit_proposal, created_at)
VALUES (%s, %s, 'X2_STOP', %s, %s) ON CONFLICT DO NOTHING
"""
IN_COOLDOWN_SQL: Final = "SELECT max(until_day) AS until FROM trading.symbol_cooldowns WHERE ticker = %s"


def initial_stop(
    avg_cost: float, stop_price: float | None, ref_price: float | None
) -> tuple[float | None, float | None]:
    """(stop_price, stop_pct) at entry: the proposal's stop distance applied to the fill price (06 §6.1)."""
    if stop_price is None or ref_price is None or ref_price <= 0 or not 0 < stop_price < ref_price:
        return None, None
    pct = 1 - stop_price / ref_price
    return round_to(avg_cost * (1 - pct), 2), round_to(pct, 6)


def cooldown_until(exit_day: date) -> date:
    """The last session of the cooldown: entries are allowed again from the session after it."""
    return add_sessions(exit_day, COOLDOWN_SESSIONS)


async def close_position(
    conn: AsyncConnection[Any], *, book: str, exit_proposal: str, qty: int, price: float, at: datetime
) -> dict[str, Any] | None:
    """Sell `qty` at `price` out of the position the exit proposal was raised for (caller's transaction).

    Returns {book, ticker, qty_sold, qty_left, realized_pnl, exit_rule} or None when the exit or the
    position is unknown (already closed)."""
    async with conn.cursor() as cur:
        await cur.execute(SIGNAL_SQL, (exit_proposal,))
        signal = await cur.fetchone()
        if signal is None:
            return None
        await cur.execute(POSITION_SQL, (book, signal["source_proposal"]))
        pos = await cur.fetchone()
        if pos is None:
            return None
        sold = min(int(qty), int(pos["qty"]))
        realized = round_to((price - float(pos["avg_cost"])) * sold, 2)
        await cur.execute(
            CLOSED_SQL,
            (
                book,
                pos["ticker"],
                sold,
                pos["avg_cost"],
                price,
                realized,
                pos["opened_at"],
                at,
                signal["source_proposal"],
                exit_proposal,
                signal["rule"],
                pos["event_type"],
                pos["strategy_version"],
            ),
        )
        left = int(pos["qty"]) - sold
        if left == 0:
            await cur.execute("DELETE FROM trading.positions WHERE id = %s", (pos["id"],))
        else:
            await cur.execute(
                "UPDATE trading.positions SET qty = %s, realized_pnl = realized_pnl + %s WHERE id = %s",
                (left, realized, pos["id"]),
            )
        if signal["rule"] == "X2":
            await cur.execute(COOLDOWN_SQL, (pos["ticker"], cooldown_until(istanbul_date(at)), exit_proposal, at))
    return {
        "book": book,
        "ticker": pos["ticker"],
        "qty_sold": sold,
        "qty_left": left,
        "realized_pnl": realized,
        "exit_rule": signal["rule"],
    }


async def in_cooldown(conn: AsyncConnection[Any], ticker: str, day: date) -> bool:
    """P8: is `day` inside a stop cooldown of `ticker`?"""
    async with conn.cursor() as cur:
        await cur.execute(IN_COOLDOWN_SQL, (ticker,))
        row = await cur.fetchone()
    until = row["until"] if row else None
    return until is not None and day < next_session(until)
