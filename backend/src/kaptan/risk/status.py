"""RiskStatus (GET /risk/status, SSE desk `kill_switch` / `halt`): port of selectors.ts riskStatus().

Quota: the mock shows `base + per_injection × injected demo runs`. Package E may also count its
calls into `trading.quota_usage.used`; taking the larger of the two never double-counts.
"""

from __future__ import annotations

from datetime import datetime
from functools import cache
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.demo.fixtures import DemoFixtures
from kaptan.portfolio.marks import js_round
from kaptan.portfolio.pnl import last_live_point
from kaptan.risk.equity import live_equity

STATE_SQL: Final = """
SELECT rs.kill_switch, rs.kill_reason, rs.kill_at, rs.kill_by, rs.halted_today, rs.daily_pnl_pct,
       rs.drawdown_pct, rs.regime, rs.reset_started,
       COALESCE((SELECT armed FROM trading.live_arm WHERE id = 1), false) AS live_armed,
       (SELECT count(*) FROM ops.demo_injections WHERE scenario <> 'loss_simulation') AS injected
FROM trading.risk_state rs WHERE rs.id = 1
"""

QUOTA_SQL: Final = "SELECT provider, used, per_injection, limit_n FROM trading.quota_usage ORDER BY ord"


class RiskStateMissingError(RuntimeError):
    """trading.risk_state has no row (the database was not seeded)."""


@cache
def _quota_base() -> dict[str, int]:
    try:
        return {q["provider"]: int(q["used"]) for q in DemoFixtures().meta["quota_base"]}
    except (OSError, KeyError, ValueError):  # pragma: no cover - fixtures ship with the backend
        return {}


def quota_used(provider: str, used: int, per_injection: int, injected: int) -> int:
    base = _quota_base().get(provider, used)
    return max(used, base + per_injection * injected)


def _whole(x: float) -> float | int:
    return int(x) if float(x).is_integer() else x


async def risk_status(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(STATE_SQL)
        r = await cur.fetchone()
        if r is None:
            raise RiskStateMissingError("trading.risk_state is empty")
        await cur.execute(QUOTA_SQL)
        quota_rows = await cur.fetchall()
    live = live_equity(float(r["daily_pnl_pct"]), await last_live_point(conn))
    drawdown = min(0.0, float(r["drawdown_pct"]))
    # The fixture's running peak; only a post-reset override (drawdown floor) re-derives it.
    peak = live.peak if drawdown == live.drawdown else js_round(live.equity / (1 + drawdown))
    injected = int(r["injected"])
    on = r["kill_switch"] == "on"
    return {
        "kill_switch": r["kill_switch"],
        "kill_reason": r["kill_reason"],
        "kill_at": r["kill_at"],
        "kill_by": r["kill_by"],
        "halted_today": bool(r["halted_today"]),
        "daily_pnl_pct": float(r["daily_pnl_pct"]),
        "drawdown_pct": drawdown,
        "peak_equity": _whole(peak),
        "equity": live.equity,
        "regime": r["regime"],
        "live_armed": bool(r["live_armed"]),
        "quota": [
            {
                "provider": q["provider"],
                "used": quota_used(q["provider"], int(q["used"]), int(q["per_injection"]), injected),
                "limit": int(q["limit_n"]),
            }
            for q in quota_rows
        ],
        "reset": {"started": r["reset_started"]} if on else None,
        "as_of": now,
    }
