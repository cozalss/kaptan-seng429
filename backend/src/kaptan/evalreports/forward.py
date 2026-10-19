"""`GET /reports/forward/weekly?week=YYYY-Www` (08 §4.2): the weekly forward-paper report as data.

Sections 1–5 of the template from the tables (Istanbul Monday 00:00 → next Monday 00:00): pipeline counts,
portfolio per strategy (week and cumulative return, max drawdown), closed trades, shadow signals and agent
health. Sections 6–7 (incidents, comments) are written by people and are not part of the payload.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Final

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.reference._sql import fetch_all, fetch_one
from kaptan.text.turkish import IST

PIPELINE_SQL: Final = """
SELECT count(*)::int AS disclosures,
       count(*) FILTER (WHERE is_noise)::int AS noise,
       count(*) FILTER (WHERE NOT is_noise AND classification IS NOT NULL)::int AS classified,
       count(*) FILTER (WHERE classification ->> 'event_type' = 'E1')::int AS e1,
       count(*) FILTER (WHERE classification ->> 'event_type' = 'E2')::int AS e2,
       count(*) FILTER (WHERE classification ->> 'event_type' = 'E3')::int AS e3,
       count(*) FILTER (WHERE classification ->> 'event_type' = 'E4')::int AS e4,
       count(*) FILTER (WHERE classification ->> 'event_type' = 'X')::int AS x
  FROM core.disclosures WHERE published_at >= %(lo)s AND published_at < %(hi)s
"""
RUNS_SQL: Final = """
SELECT count(*) FILTER (WHERE outcome = 'QUARANTINED')::int AS quarantined,
       count(*) FILTER (WHERE outcome = 'PROPOSE')::int AS signals,
       count(*) FILTER (WHERE status = 'hold_quota')::int AS quota_holds,
       count(*) FILTER (WHERE outcome = 'HOLD')::int AS holds,
       count(*)::int AS runs,
       coalesce(sum(tokens_in + tokens_out), 0)::bigint AS tokens,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms > 0) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms > 0) AS p95
  FROM trading.agent_runs WHERE started_at >= %(lo)s AND started_at < %(hi)s AND NOT is_fixture
"""
APPROVALS_SQL: Final = """
SELECT count(*)::int AS to_approval,
       count(*) FILTER (WHERE status = 'approved')::int AS approved,
       count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
       count(*) FILTER (WHERE status = 'expired')::int AS expired
  FROM trading.approvals WHERE created_at >= %(lo)s AND created_at < %(hi)s
"""
PORTFOLIO_SQL: Final = """
WITH w AS (
  SELECT strategy, d, equity, drawdown,
         first_value(equity) OVER (PARTITION BY strategy ORDER BY d) AS first_equity
    FROM trading.pnl_daily WHERE d < %(hi_d)s
)
SELECT strategy,
       (array_agg(equity ORDER BY d DESC))[1] AS last_equity,
       (array_agg(equity ORDER BY d DESC) FILTER (WHERE d < %(lo_d)s))[1] AS week_open_equity,
       min(first_equity) AS first_equity,
       min(drawdown) AS max_dd,
       count(*) FILTER (WHERE d >= %(lo_d)s)::int AS days
  FROM w GROUP BY strategy ORDER BY strategy
"""
TRADES_SQL: Final = """
SELECT strategy_version, ticker, event_type, opened_at, closed_at, exit_rule, avg_cost, exit_price, realized_pnl
  FROM trading.closed_positions WHERE closed_at >= %(lo)s AND closed_at < %(hi)s ORDER BY closed_at, id
"""
SHADOW_SQL: Final = """
SELECT strategy_version, ticker, event_type, reason_source, reason_code, excess_5d, excess_20d
  FROM trading.shadow_signals WHERE decided_at >= %(lo)s AND decided_at < %(hi)s ORDER BY decided_at, signal_id
"""
HEAD_SQL: Final = "SELECT hash FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1"


def week_bounds(week: str) -> tuple[date, date]:
    """ISO week 'YYYY-Www' → (Monday, next Monday)."""
    try:
        year, num = week.split("-W")
        monday = date.fromisocalendar(int(year), int(num), 1)
    except ValueError as exc:
        raise ApiError(422, "validation", "Hafta YYYY-Www biçiminde olmalı (ör. 2026-W46).") from exc
    return monday, monday + timedelta(days=7)


def iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _ret(last: Any, base: Any) -> float | None:
    return None if last is None or not base else round(float(last) / float(base) - 1.0, 6)


def _f(value: Any) -> float | None:
    return None if value is None else float(value)


def _portfolio(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "strategy": r["strategy"],
            "week_return": _ret(r["last_equity"], r["week_open_equity"] or r["first_equity"]) if r["days"] else None,
            "cumulative": _ret(r["last_equity"], r["first_equity"]),
            "max_dd": float(r["max_dd"] or 0.0),
        }
        for r in rows
    ]


def _trade(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": r["strategy_version"],
        "ticker": r["ticker"],
        "event_type": r["event_type"],
        "opened_at": r["opened_at"],
        "closed_at": r["closed_at"],
        "exit_rule": r["exit_rule"],
        "return": round(float(r["exit_price"]) / float(r["avg_cost"]) - 1.0, 6),
        "realized_pnl_try": float(r["realized_pnl"]),
    }


def _shadow(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": r["strategy_version"],
        "ticker": r["ticker"],
        "event_type": r["event_type"],
        "rejected_by": f"{r['reason_source']}:{r['reason_code']}",
        "excess_5d": _f(r["excess_5d"]),
        "excess_20d": _f(r["excess_20d"]),
    }


async def forward_weekly(conn: DictConn, *, week: str, now: datetime, config_hash: str) -> dict[str, Any]:
    lo_d, hi_d = week_bounds(week)
    q = {
        "lo": datetime.combine(lo_d, time(0), IST),
        "hi": datetime.combine(hi_d, time(0), IST),
        "lo_d": lo_d,
        "hi_d": hi_d,
    }
    pipe = await fetch_one(conn, PIPELINE_SQL, q) or {}
    runs = await fetch_one(conn, RUNS_SQL, q) or {}
    appr = await fetch_one(conn, APPROVALS_SQL, q) or {}
    head = await fetch_one(conn, HEAD_SQL)
    n_runs = int(runs.get("runs") or 0)
    return {
        "week": iso_week(lo_d),
        "start": lo_d,
        "end": hi_d - timedelta(days=1),
        "generated_at": now,
        "config_hash": config_hash,
        "audit_head": None if head is None else str(head["hash"])[:12],
        "pipeline": {
            "disclosures": int(pipe.get("disclosures") or 0),
            "noise": int(pipe.get("noise") or 0),
            "classified": int(pipe.get("classified") or 0),
            "by_event": {k.upper(): int(pipe.get(k) or 0) for k in ("e1", "e2", "e3", "e4", "x")},
            "quarantined": int(runs.get("quarantined") or 0),
            "signals": int(runs.get("signals") or 0),
            "to_approval": int(appr.get("to_approval") or 0),
            "approved": int(appr.get("approved") or 0),
            "rejected": int(appr.get("rejected") or 0),
            "expired": int(appr.get("expired") or 0),
        },
        "portfolio": _portfolio(await fetch_all(conn, PORTFOLIO_SQL, q)),
        "trades": [_trade(r) for r in await fetch_all(conn, TRADES_SQL, q)],
        "shadow": [_shadow(r) for r in await fetch_all(conn, SHADOW_SQL, q)],
        "agent_health": {
            "runs": n_runs,
            "p50_s": None if runs.get("p50") is None else round(float(runs["p50"]) / 1000, 3),
            "p95_s": None if runs.get("p95") is None else round(float(runs["p95"]) / 1000, 3),
            "tokens_per_run": int(runs.get("tokens") or 0) // n_runs if n_runs else 0,
            "hold_rate": round(int(runs.get("holds") or 0) / n_runs, 4) if n_runs else 0.0,
            "quota_holds": int(runs.get("quota_holds") or 0),
        },
    }
