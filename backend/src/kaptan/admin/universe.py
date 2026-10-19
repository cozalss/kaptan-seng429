"""`/admin/universe`: a read of `core.universe_daily` (latest day ≤ `day`) plus manual include/exclude overrides.

The rules (06 §2, U1–U7) still decide `is_eligible` by code; an override is the Yönetici's written exception,
audited, and `kaptan.reference.universe.universe_on()` applies it (exclude wins; include only for a ticker
that has a row that day). `in_universe` here is the effective answer, `is_eligible` the rules' one.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final, Literal

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.db import DictConn
from kaptan.reference._sql import execute, fetch_all, fetch_one

ENTITY: Final = "universe_override"

LATEST_DAY_SQL: Final = "SELECT max(d) AS d FROM core.universe_daily WHERE d <= %s"
ROWS_SQL: Final = """
SELECT u.ticker, u.is_eligible, u.reasons, u.rule_version, u.market,
       coalesce(p.name, i.name, u.ticker) AS company_name, coalesce(p.sector, i.sector, '') AS sector,
       coalesce(g.group_name, i.group_name) AS group_name,
       coalesce(u.free_float_pct, 0)::float8 AS free_float_pct, coalesce(u.adv20_try, 0)::float8 AS adv20_try,
       (w.ticker IS NOT NULL) AS watched,
       o.mode AS o_mode, o.reason AS o_reason, o.set_by AS o_by, o.set_at AS o_at
  FROM core.universe_daily u
  LEFT JOIN core.issuer_profiles p ON p.ticker = u.ticker
  LEFT JOIN core.issuers i ON i.ticker = u.ticker
  LEFT JOIN core.issuer_groups g ON g.ticker = u.ticker
  LEFT JOIN core.watchlist w ON w.ticker = u.ticker
  LEFT JOIN core.universe_overrides o ON o.ticker = u.ticker
 WHERE u.d = %s
 ORDER BY u.ticker
"""
ORPHAN_OVERRIDES_SQL: Final = """
SELECT o.ticker, o.mode, o.reason, o.set_by, o.set_at FROM core.universe_overrides o
 WHERE NOT EXISTS (SELECT 1 FROM core.universe_daily u WHERE u.d = %s AND u.ticker = o.ticker)
 ORDER BY o.ticker
"""
ALL_OVERRIDES_SQL: Final = "SELECT ticker, mode, reason, set_by, set_at FROM core.universe_overrides ORDER BY ticker"
GET_OVERRIDE_SQL: Final = "SELECT mode FROM core.universe_overrides WHERE ticker = %s FOR UPDATE"
UPSERT_SQL: Final = """
INSERT INTO core.universe_overrides (ticker, mode, reason, set_by, set_at) VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (ticker) DO UPDATE SET mode = EXCLUDED.mode, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by,
  set_at = EXCLUDED.set_at
"""
DELETE_SQL: Final = "DELETE FROM core.universe_overrides WHERE ticker = %s"


def effective(is_eligible: bool, mode: str | None) -> bool:
    if mode == "exclude":
        return False
    return True if mode == "include" else is_eligible


def _override(mode: str | None, reason: str | None, by: str | None, at: datetime | None) -> dict[str, Any] | None:
    return None if mode is None else {"mode": mode, "reason": reason, "set_by": by, "set_at": at}


def _row(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "ticker": r["ticker"],
        "company_name": r["company_name"],
        "sector": r["sector"],
        "group": r["group_name"],
        "free_float_pct": float(r["free_float_pct"]),
        "adv20_try": float(r["adv20_try"]),
        "in_universe": effective(bool(r["is_eligible"]), r["o_mode"]),
        "watched": bool(r["watched"]),
        "is_eligible": bool(r["is_eligible"]),
        "reasons": list(r["reasons"] or []),
        "override": _override(r["o_mode"], r["o_reason"], r["o_by"], r["o_at"]),
    }


async def universe_view(conn: DictConn, day: date) -> dict[str, Any]:
    latest = await fetch_one(conn, LATEST_DAY_SQL, (day,))
    d = None if latest is None else latest["d"]
    if d is None:
        overrides = await fetch_all(conn, ALL_OVERRIDES_SQL)
        return {"d": None, "rule_version": None, "rows": [], "unmatched_overrides": overrides}
    rows = await fetch_all(conn, ROWS_SQL, (d,))
    orphans = await fetch_all(conn, ORPHAN_OVERRIDES_SQL, (d,))
    return {
        "d": d,
        "rule_version": rows[0]["rule_version"] if rows else None,
        "rows": [_row(r) for r in rows],
        "unmatched_overrides": orphans,
    }


async def set_override(
    conn: DictConn,
    ticker: str,
    mode: Literal["include", "exclude"],
    *,
    reason: str,
    uid: str,
    role: str,
    now: datetime,
) -> None:
    async with conn.transaction():
        before = await fetch_one(conn, GET_OVERRIDE_SQL, (ticker,))
        await execute(conn, UPSERT_SQL, (ticker, mode, reason, user_actor(uid), now))
        payload = {"ticker": ticker, "mode": mode, "from": None if before is None else before["mode"]}
        await _audit(conn, "universe.override_set", ticker, {**payload, "role": role, "reason": reason}, uid, now)


async def clear_override(conn: DictConn, ticker: str, *, reason: str, uid: str, role: str, now: datetime) -> None:
    async with conn.transaction():
        before = await fetch_one(conn, GET_OVERRIDE_SQL, (ticker,))
        if before is None:
            raise ApiError(404, "not_found", "Bu hisse için elle konmuş bir istisna yok.")
        await execute(conn, DELETE_SQL, (ticker,))
        payload = {"ticker": ticker, "from": before["mode"], "role": role, "reason": reason}
        await _audit(conn, "universe.override_cleared", ticker, payload, uid, now)


async def _audit(conn: DictConn, action: str, ticker: str, payload: dict[str, Any], uid: str, now: datetime) -> None:
    draft = AuditDraft(
        actor=user_actor(uid), action=action, entity_type=ENTITY, entity_id=ticker, payload=payload, occurred_at=now
    )
    await append(conn, [draft], now=now)
