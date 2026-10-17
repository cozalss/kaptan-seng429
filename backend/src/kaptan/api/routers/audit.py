"""The audit ledger — owner: wave-2 package C.

    GET  /audit?scope=today|all&q=&limit=  -> AuditPage          (all roles; newest first)
    POST /audit/verify                     -> ChainVerifyResult  (audit.verify: risk_officer, admin, auditor)

List (mock enterprise.ts auditList): scope today = Istanbul day of the demo clock; q = free text
(kaptan.audit.search, the panel's auditMatches()); limit 1..500 (default 200); total = rows after the
filters; length = the whole chain; tamper_on from ops.demo_state. Verify walks the stored chain
(verify_db): no audit entry; only ops.demo_state.verified_at remembers the walk, like the mock.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import ValidationError

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.api.errors import ApiError
from kaptan.audit.search import audit_matches
from kaptan.audit.verify import entry_from_row, verify_db
from kaptan.clock import istanbul_date
from kaptan.db import Conn, DictConn
from kaptan.domain.schemas import AuditPage, ChainVerifyResult
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.governance import AuditListQuery

router = APIRouter(tags=["audit"])

_COLUMNS: Final = (
    "seq, chain_pos, occurred_at, actor, action, entity_type, entity_id, run_id, strategy_version, "
    "payload, prev_hash, hash"
)
_TODAY: Final = "(%(all)s OR ((occurred_at AT TIME ZONE 'UTC') + interval '3 hours')::date = %(today)s)"
# Constant SQL below; every value is a bound parameter.
PAGE_SQL: Final = f"SELECT {_COLUMNS} FROM audit.audit_log WHERE {_TODAY} ORDER BY chain_pos DESC LIMIT %(limit)s"  # noqa: S608
ALL_SQL: Final = f"SELECT {_COLUMNS} FROM audit.audit_log WHERE {_TODAY} ORDER BY chain_pos DESC"  # noqa: S608
COUNT_SQL: Final = f"""
SELECT (SELECT count(*) FROM audit.audit_log WHERE {_TODAY}) AS total,
       (SELECT count(*) FROM audit.audit_log) AS length,
       coalesce((SELECT tamper_on FROM ops.demo_state WHERE id = 1), false) AS tamper_on
"""  # noqa: S608


def parse_query(scope: str, q: str | None, limit: int) -> AuditListQuery:
    """AuditListQuery (trimmed q ≤ 100) or 422 `validation` with its Turkish text."""
    try:
        return AuditListQuery.model_validate({"scope": scope, "q": q, "limit": limit})
    except ValidationError as exc:
        first = exc.errors()[0]
        raise ApiError(422, "validation", str(first.get("msg", "")).removeprefix("Value error, ")) from exc


async def _rows(conn: DictConn, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [entry_from_row(r).to_api() for r in await cur.fetchall()]


async def _issuer_names(conn: DictConn) -> dict[str, str]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT ticker, name FROM core.issuers")
        return {r["ticker"]: r["name"] for r in await cur.fetchall()}


async def audit_page(conn: DictConn, query: AuditListQuery, today: date) -> dict[str, Any]:
    params: dict[str, Any] = {"all": query.scope == "all", "today": today, "limit": query.limit}
    async with conn.cursor() as cur:
        await cur.execute(COUNT_SQL, params)
        counts = await cur.fetchone()
    assert counts is not None
    if query.q:
        issuers = await _issuer_names(conn)
        needle = query.q
        hits = [e for e in await _rows(conn, ALL_SQL, params) if audit_matches(e, needle, issuers)]
        items, total = hits[: query.limit], len(hits)
    else:
        items, total = await _rows(conn, PAGE_SQL, params), int(counts["total"])
    return {"items": items, "total": total, "length": int(counts["length"]), "tamper_on": bool(counts["tamper_on"])}


@router.get("/audit", response_model=AuditPage)
async def audit_list(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    scope: Literal["today", "all"] = "today",
    q: Annotated[str | None, Query(max_length=1000)] = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 200,
) -> Any:
    return await audit_page(conn, parse_query(scope, q, limit), istanbul_date(clock.now()))


@router.post("/audit/verify", response_model=ChainVerifyResult)
async def verify(actor: Annotated[Actor, Depends(require("audit.verify"))], conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    result = await verify_db(conn, iso_ms(now))
    async with conn.transaction():
        await conn.execute("UPDATE ops.demo_state SET verified_at = %s WHERE id = 1", (now,))
    return result
