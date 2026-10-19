"""The in-session risk monitor (06 §11, FR-20): meant to run every 5 minutes outside DEMO_MODE.

    result = await run_risk_monitor(conn, now, redis=app)      # the scheduler comes later

One transaction: mark the paper book to market (risk/book.py), write today's daily P&L and drawdown
into trading.risk_state, and with the *active* limit version (FR-33)
- lift yesterday's daily halt at the next session (R02 lifts by itself, the kill switch never does);
- daily P&L ≤ `daily_loss_halt_pct` (−1 %) → `halted_today`, audit `risk.halted` → SSE desk `halt`;
- drawdown ≤ `kill_drawdown_pct` (−5 % from the peak) → kill switch by `system:risk_monitor`
  (open orders cancelled, positions kept; audit `kill_switch.on` with the equity/peak snapshot)
  → SSE desk `kill_switch`.
After a confirmed restart (risk_state.reset_at) the peak is not reset: the monitor records the
equity it sees then, keeps the gate's drawdown just inside the threshold (−4.9 %, as the demo does)
until a further −3 % from that level kills again, and ends the reset mode once the drawdown is back
inside −2.5 % (06 §11 step 4). The demo's loss simulation (risk/loss_simulation.py) is untouched.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.audit.writer import AuditDraft, append
from kaptan.events.publish import publish
from kaptan.prices.calendar import CalendarRangeError, is_trading_day, istanbul_date
from kaptan.risk.active_limits import active_limits
from kaptan.risk.book import effective_drawdown, paper_book
from kaptan.risk.kill_switch import RISK_MONITOR, engage
from kaptan.risk.pnl_eod import run_pnl_eod
from kaptan.risk.status import risk_status
from kaptan.rules.format import fmt_pct
from kaptan.settings import get_settings

RESET_RECOVER_DD: Final = Decimal("-0.025")

ENSURE_SQL: Final = "INSERT INTO trading.risk_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
LOCK_SQL: Final = """
SELECT kill_switch, halted_today, halted_on, reset_at, reset_equity FROM trading.risk_state WHERE id = 1 FOR UPDATE
"""
NUMBERS_SQL: Final = """
UPDATE trading.risk_state SET daily_pnl_pct = %s, drawdown_pct = %s, reset_equity = %s, reset_at = %s,
  updated_at = now() WHERE id = 1
"""
HALT_SQL: Final = "UPDATE trading.risk_state SET halted_today = true, halted_on = %s WHERE id = 1"
UNHALT_SQL: Final = "UPDATE trading.risk_state SET halted_today = false, halted_on = NULL WHERE id = 1"

MonitorEvent = Literal["halt", "kill_switch"]


@dataclass(frozen=True, slots=True)
class MonitorResult:
    ran: bool
    equity: Decimal = Decimal(0)
    daily_pnl_pct: Decimal = Decimal(0)
    drawdown_pct: Decimal = Decimal(0)
    halted: bool = False
    halt_cleared: bool = False
    killed: bool = False
    events: tuple[MonitorEvent, ...] = ()
    status: dict[str, Any] | None = None


def _trading_day(d: Any) -> bool:
    try:
        return bool(is_trading_day(d))
    except CalendarRangeError:
        return False


def _audit(action: str, entity_id: str, payload: dict[str, Any], now: datetime) -> AuditDraft:
    return AuditDraft(RISK_MONITOR, action, "system_flag", entity_id, payload, occurred_at=now)


def _f(x: Decimal, places: int = 5) -> float:
    return round(float(x), places)


async def run_risk_monitor(
    conn: AsyncConnection[Any],
    now: datetime,
    *,
    redis: Any = None,
    capital: float | None = None,
    demo: bool | None = None,
) -> MonitorResult:
    """One monitor tick. `demo` (default: DEMO_MODE) → does nothing: the demo has its own loss simulation.
    `redis`: an app / request / Redis client for the SSE events (after commit); None = no events.
    Use a connection that is not inside a transaction block: the tick commits before publishing."""
    settings = get_settings()
    if settings.demo_mode if demo is None else demo:
        return MonitorResult(ran=False)
    cap = capital or settings.paper_capital_try
    today = istanbul_date(now)
    halted = cleared = killed = False
    async with conn.transaction():
        await conn.execute(ENSURE_SQL)
        async with conn.cursor() as cur:
            await cur.execute(LOCK_SQL)
            state = dict(await cur.fetchone() or {})
        active = await active_limits(conn)
        lim = active.limits
        book = await paper_book(conn, now, capital=cap)
        reset_at, reset_eq = state["reset_at"], state["reset_equity"]
        reset_equity = None if reset_eq is None else Decimal(str(reset_eq))
        if reset_at is not None and reset_equity is None:
            reset_equity = book.equity  # the level the restart happened at
        if reset_equity is not None and book.drawdown_pct >= RESET_RECOVER_DD:
            reset_at, reset_equity = None, None  # back inside −2.5 %: the normal rule again
        drawdown = effective_drawdown(book, reset_equity, reset_active=reset_at is not None)
        daily = book.daily_pnl_pct
        snapshot = {
            "equity": _f(book.equity, 2),
            "peak_equity": _f(book.peak_equity, 2),
            "day_start_equity": _f(book.day_start_equity, 2),
            "limits_version": active.version,
        }
        await conn.execute(
            NUMBERS_SQL,
            (_f(daily), _f(drawdown), None if reset_equity is None else float(reset_equity), reset_at),
        )
        is_halted = bool(state["halted_today"])
        halted_on = state["halted_on"]
        if is_halted and halted_on is not None and halted_on < today and _trading_day(today):
            await conn.execute(UNHALT_SQL)
            await append(conn, [_audit("risk.halt_cleared", "halted_today", {"halted_on": str(halted_on)}, now)])
            is_halted, cleared = False, True
        if daily <= lim.daily_loss_halt_pct and not is_halted:
            await conn.execute(HALT_SQL, (today,))
            payload = {"daily_pnl_pct": _f(daily), **snapshot}
            await append(conn, [_audit("risk.halted", "halted_today", payload, now)])
            halted = True
        if drawdown <= lim.kill_drawdown_pct and state["kill_switch"] == "off":
            reason = f"Zirveden {fmt_pct(float(lim.kill_drawdown_pct), 0)} düşüş (R01)"
            extra = {"drawdown_pct": _f(drawdown), **snapshot}
            await engage(conn, by=RISK_MONITOR, reason=reason, role=None, now=now, check_off=False, extra=extra)
            killed = True
    status = await risk_status(conn, now, live=True, capital=cap)
    await conn.commit()
    fired: list[MonitorEvent] = []
    if halted:
        fired.append("halt")
    if killed:
        fired.append("kill_switch")
    events = tuple(fired)
    if redis is not None:
        for event in events:
            await publish(redis, "desk", event, status)
    return MonitorResult(True, book.equity, daily, drawdown, halted, cleared, killed, events, status)


__all__ = ["MonitorResult", "effective_drawdown", "run_pnl_eod", "run_risk_monitor"]
