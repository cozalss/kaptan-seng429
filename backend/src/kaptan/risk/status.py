"""RiskStatus (GET /risk/status, SSE desk `kill_switch` / `halt`): port of selectors.ts riskStatus().

Quota: the mock shows `base + per_injection × injected demo runs`. Package E may also count its
calls into `trading.quota_usage.used`; taking the larger of the two never double-counts.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from functools import cache
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.demo.fixtures import DemoFixtures
from kaptan.portfolio.marks import js_round
from kaptan.portfolio.pnl import last_live_point
from kaptan.risk.book import effective_drawdown, paper_book
from kaptan.risk.equity import live_equity
from kaptan.settings import get_settings

STATE_SQL: Final = """
SELECT rs.kill_switch, rs.kill_reason, rs.kill_at, rs.kill_by, rs.halted_today, rs.daily_pnl_pct,
       rs.drawdown_pct, rs.regime, rs.reset_started, rs.reset_at, rs.reset_equity,
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


async def risk_status(
    conn: AsyncConnection[Any], now: datetime, *, live: bool = False, capital: float | None = None
) -> dict[str, Any]:
    """`live` (DEMO_MODE=false): equity, peak, drawdown and daily P&L from the paper book marked to
    market now (kaptan.risk.book); otherwise the demo's fixture curve (mock selectors.riskStatus())."""
    async with conn.cursor() as cur:
        await cur.execute(STATE_SQL)
        r = await cur.fetchone()
        if r is None:
            raise RiskStateMissingError("trading.risk_state is empty")
        await cur.execute(QUOTA_SQL)
        quota_rows = await cur.fetchall()
    if live:
        book = await paper_book(conn, now, capital=capital or get_settings().paper_capital_try)
        equity, peak = js_round(float(book.equity)), float(js_round(float(book.peak_equity)))
        reset_eq = None if r["reset_equity"] is None else Decimal(str(r["reset_equity"]))
        dd = effective_drawdown(book, reset_eq, reset_active=r["reset_at"] is not None)
        daily, drawdown = round(float(book.daily_pnl_pct), 5), round(float(dd), 5)
    else:
        fixture = live_equity(float(r["daily_pnl_pct"]), await last_live_point(conn))
        daily, drawdown, equity = float(r["daily_pnl_pct"]), min(0.0, float(r["drawdown_pct"])), fixture.equity
        # The fixture's running peak; only a post-reset override (drawdown floor) re-derives it.
        peak = fixture.peak if drawdown == fixture.drawdown else js_round(fixture.equity / (1 + drawdown))
    injected = int(r["injected"])
    on = r["kill_switch"] == "on"
    return {
        "kill_switch": r["kill_switch"],
        "kill_reason": r["kill_reason"],
        "kill_at": r["kill_at"],
        "kill_by": r["kill_by"],
        "halted_today": bool(r["halted_today"]),
        "daily_pnl_pct": daily,
        "drawdown_pct": drawdown,
        "peak_equity": _whole(peak),
        "equity": equity,
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
