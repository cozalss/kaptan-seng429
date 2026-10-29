"""Security kill (06 §11 trigger c): ≥ 3 R11 REJECTs (schema / injection) on the same day → kill switch.

Counted per Istanbul day over real runs (`run_set = 'live'`; the demo replay never counts): a run counts
once if its gate rejected at R11 (`trading.risk_checks`) or the guard quarantined its text (outcome
QUARANTINED: the injection brake that stops the run before the gate). Only runs after the last restart
(`kill_switch.reset` in the audit log) count, so a same-day restart starts a fresh count. The kill itself is
the ordinary one (`kill_switch.engage`: open orders cancelled, audit `kill_switch.on` with the run ids);
it is lifted only by the two-key restart of 06 §11 (`kill_switch.start_reset` / `confirm_reset`).
After the commit the caller publishes the new RiskStatus on SSE desk `kill_switch` (`announce_kill`), the
same event the manual kill-switch endpoint sends, so the panel sees the stop at once.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.events.publish import Target, publish
from kaptan.risk.desk import istanbul_day_bounds
from kaptan.risk.kill_switch import engage
from kaptan.risk.status import risk_status

#: 06 §11 (c): three R11 rejects on the same day.
SECURITY_KILL_THRESHOLD: Final = 3
SECURITY_MONITOR: Final = "system:security_monitor"
SECURITY_KILL_REASON: Final = "Aynı gün 3 güvenlik reddi (R11 şema/injection): güvenlik durdurması"

LAST_RESET_SQL: Final = "SELECT max(occurred_at) AS at FROM audit.audit_log WHERE action = 'kill_switch.reset'"
REJECTED_RUNS_SQL: Final = """
SELECT r.run_id FROM trading.agent_runs r
 WHERE r.run_set = 'live' AND r.finished_at >= %s AND r.finished_at < %s
   AND (r.outcome = 'QUARANTINED' OR EXISTS (
        SELECT 1 FROM trading.risk_checks c WHERE c.run_id = r.run_id AND c.rule_code = 'R11' AND c.outcome = 'reject'))
 ORDER BY r.finished_at, r.run_id
"""
KILL_STATE_SQL: Final = "SELECT kill_switch FROM trading.risk_state WHERE id = 1"


def should_kill(n_rejects: int, kill_on: bool, threshold: int = SECURITY_KILL_THRESHOLD) -> bool:
    """Pure rule: kill when the day's R11 rejects reach the threshold and the switch is still off."""
    return not kill_on and n_rejects >= threshold


async def r11_rejected_runs(conn: AsyncConnection[Any], now: datetime) -> list[str]:
    """Today's (Istanbul) live runs with an R11 reject or a quarantine, after the last restart."""
    start, end = istanbul_day_bounds(now)
    async with conn.cursor() as cur:
        await cur.execute(LAST_RESET_SQL)
        row = await cur.fetchone()
        reset_at = None if row is None else row["at"]
        if reset_at is not None and reset_at > start:
            start = reset_at
        await cur.execute(REJECTED_RUNS_SQL, (start, end))
        return [str(r["run_id"]) for r in await cur.fetchall()]


async def check_security_kill(conn: AsyncConnection[Any], now: datetime) -> bool:
    """Engage the kill switch when today's R11 rejects reach 3. Returns True if it engaged now.
    Call inside the run's persistence transaction, after its risk_checks rows are written."""
    runs = await r11_rejected_runs(conn, now)
    async with conn.cursor() as cur:
        await cur.execute(KILL_STATE_SQL)
        row = await cur.fetchone()
    kill_on = row is not None and row["kill_switch"] == "on"
    if row is None or not should_kill(len(runs), kill_on):
        return False
    extra = {"trigger": "security", "r11_rejects": len(runs), "run_ids": runs}
    await engage(
        conn, by=SECURITY_MONITOR, reason=SECURITY_KILL_REASON, role=None, now=now, check_off=False, extra=extra
    )
    return True


async def announce_kill(target: Target, conn: AsyncConnection[Any], now: datetime, *, live: bool) -> str | None:
    """SSE desk `kill_switch` with the new RiskStatus, as POST /risk/kill-switch sends it. Call after commit."""
    status = await risk_status(conn, now, live=live)
    return await publish(target, "desk", "kill_switch", status)
