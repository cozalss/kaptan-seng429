"""The loss simulation (demo scenario `loss_simulation`, mock scenarios.ts runLossSimulation()).

Package C audits `demo.injected` and then calls `run_loss_step(conn, i)` for i = 0 … 5, one step every
LOSS_STEP_MS (1.4 s) from a background task. Each step moves the live strategy's daily P&L along
LOSS_DAILY; the drawdown comes from the same equity curve as the P&L chart (live_equity), so the
daily −1 % halt fires at step 2 and the −5 % drawdown kill switch at the last step.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.audit.writer import AuditDraft, append
from kaptan.clock import DEMO_ANCHOR
from kaptan.events.publish import publish
from kaptan.portfolio.pnl import last_live_point
from kaptan.risk.equity import live_equity
from kaptan.risk.kill_switch import RISK_MONITOR, engage
from kaptan.risk.status import risk_status

LOSS_DAILY: Final[tuple[float, ...]] = (-0.004, -0.0075, -0.0112, -0.021, -0.03, -0.0392)
LOSS_STEP_MS: Final = 1_400
#: Canonical v1 thresholds (06 §11: R02 daily halt, R01 drawdown kill).
DAILY_HALT_PCT: Final = -0.01
KILL_DRAWDOWN_PCT: Final = -0.05
KILL_REASON: Final = "Zirveden −%5 düşüş (R01)"

LossEvent = Literal["halt", "kill_switch"]


@dataclass(frozen=True, slots=True)
class LossStep:
    """What a step did: `event` is the SSE desk event to publish with `status` (a RiskStatus)."""

    step: int
    daily_pnl_pct: float
    drawdown_pct: float
    halted: bool
    killed: bool
    event: LossEvent
    status: dict[str, Any]


async def demo_now(conn: AsyncConnection[Any]) -> datetime:
    """The demo clock read from ops.demo_state (for callers without the app's Clock)."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT started_at FROM ops.demo_state WHERE id = 1")
        row = await cur.fetchone()
    real = datetime.now(UTC)
    if row is None:
        return DEMO_ANCHOR
    started: datetime = row["started_at"]
    return DEMO_ANCHOR + max(real - started, timedelta(0))


async def run_loss_step(
    conn: AsyncConnection[Any], step: int, *, now: datetime | None = None, app: Any | None = None
) -> LossStep:
    """Apply loss-simulation step `step` (0-based) in one transaction, then publish SSE desk
    `halt` / `kill_switch` when `app` (FastAPI app, request or Redis client) is given.

    ≤ −1 % daily (first time): halted_today + audit `risk.halted` {daily_pnl_pct} → `halt`.
    Else ≤ −5 % drawdown with the switch off: kill switch on by system:risk_monitor → `kill_switch`.
    Otherwise → `halt` with the new numbers. `now` defaults to app.state.clock, then the demo clock.
    Use a connection that is not inside a `conn.transaction()` block: the step commits before publishing.
    """
    if not 0 <= step < len(LOSS_DAILY):
        raise ValueError(f"loss step must be 0..{len(LOSS_DAILY) - 1}, got {step}")
    if now is None:
        clock = getattr(getattr(app, "state", None), "clock", None)
        now = clock.now() if clock is not None else await demo_now(conn)
    daily = LOSS_DAILY[step]
    halted = killed = False
    async with conn.transaction():
        live = live_equity(daily, await last_live_point(conn))
        async with conn.cursor() as cur:
            await cur.execute("SELECT kill_switch, halted_today FROM trading.risk_state WHERE id = 1 FOR UPDATE")
            state = await cur.fetchone()
            if state is None:
                raise RuntimeError("trading.risk_state is empty")
            await cur.execute(
                "UPDATE trading.risk_state SET daily_pnl_pct = %s, drawdown_pct = %s, updated_at = now() WHERE id = 1",
                (daily, live.drawdown),
            )
            if daily <= DAILY_HALT_PCT and not state["halted_today"]:
                await cur.execute("UPDATE trading.risk_state SET halted_today = true WHERE id = 1")
                halted = True
        if halted:
            await append(
                conn,
                [
                    AuditDraft(
                        actor=RISK_MONITOR,
                        action="risk.halted",
                        entity_type="system_flag",
                        entity_id="halted_today",
                        payload={"daily_pnl_pct": daily},
                        occurred_at=now,
                    )
                ],
            )
        elif live.drawdown <= KILL_DRAWDOWN_PCT and state["kill_switch"] == "off":
            await engage(conn, by=RISK_MONITOR, reason=KILL_REASON, role=None, now=now, check_off=False)
            killed = True
    status = await risk_status(conn, now)
    await conn.commit()  # end the read transaction; the pooled connection stays clean
    result = LossStep(
        step=step,
        daily_pnl_pct=daily,
        drawdown_pct=live.drawdown,
        halted=halted,
        killed=killed,
        event="kill_switch" if killed else "halt",
        status=status,
    )
    if app is not None:
        await publish(app, "desk", result.event, status)
    return result
