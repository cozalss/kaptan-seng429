"""Limits with two signatures (mock enterprise.ts limitsView() / proposeLimit() / decideLimit()).

A change is proposed by the Yönetici (1/2) and approved or rejected by someone else (2/2). Limits
may only tighten the canonical v1 set (`limit_violations()`). Writes run in one transaction with
their audit record; the caller publishes SSE desk `limits.changed` after the commit.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.permissions import SAME_PERSON_TEXT
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput
from kaptan.domain.schemas.governance import limit_violations
from kaptan.risk.kill_switch import signature

PENDING_EXISTS: Final = "İkinci imzayı bekleyen bir değişiklik zaten var."
NO_CHANGE: Final = "Yeni değer şimdikiyle aynı."
NOT_PENDING: Final = "Bu değişiklik artık imza beklemiyor."
NO_ACTIVE: Final = "Geçerli sınır sürümü bulunamadı."

VERSIONS_SQL: Final = """
SELECT version, status, reason, created_at, effective_from, proposed_by, decided_by
FROM trading.limit_versions ORDER BY version DESC
"""
VALUES_SQL: Final = "SELECT version, key, value FROM trading.limits ORDER BY version, ord"


def _num(x: float) -> float | int:
    return int(x) if float(x).is_integer() else float(x)


async def limits_view(conn: AsyncConnection[Any]) -> dict[str, Any]:
    """LimitsView = {active, pending (status proposed) | null, history (newest first, proposed excluded)}."""
    async with conn.cursor() as cur:
        await cur.execute(VERSIONS_SQL)
        versions = await cur.fetchall()
        await cur.execute(VALUES_SQL)
        values = await cur.fetchall()
    by_version: dict[int, list[dict[str, Any]]] = {}
    for v in values:
        by_version.setdefault(int(v["version"]), []).append({"key": v["key"], "value": _num(v["value"])})
    docs = [{**dict(v), "values": by_version.get(int(v["version"]), [])} for v in versions]
    active = next((d for d in docs if d["status"] == "active"), None)
    if active is None:
        raise ApiError(500, "no_active_limits", NO_ACTIVE)
    return {
        "active": active,
        "pending": next((d for d in docs if d["status"] == "proposed"), None),
        "history": [d for d in docs if d["status"] != "proposed"],
    }


async def propose(
    conn: AsyncConnection[Any], body: LimitProposalInput, *, uid: str, name: str, role: str, now: datetime
) -> int:
    """New version = the active values with one key changed (status proposed). Returns its number."""
    async with conn.transaction():
        await conn.execute("LOCK TABLE trading.limit_versions IN SHARE ROW EXCLUSIVE MODE")
        view = await limits_view(conn)
        if view["pending"] is not None:
            raise ApiError(409, "pending_exists", PENDING_EXISTS)
        active_values: list[dict[str, Any]] = view["active"]["values"]
        current = next((v["value"] for v in active_values if v["key"] == body.key), None)
        if current == body.value:
            raise ApiError(422, "no_change", NO_CHANGE)
        values = [{**v, "value": body.value} if v["key"] == body.key else v for v in active_values]
        problems = limit_violations([(v["key"], v["value"]) for v in values])
        if problems:
            raise ApiError(422, "looser", problems[0])
        all_versions = [view["active"], *view["history"]]
        version = max(int(v["version"]) for v in all_versions) + 1
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO trading.limit_versions (version, status, reason, created_at, effective_from, proposed_by)
                VALUES (%s, 'proposed', %s, %s, NULL, %s)""",
                (version, body.reason, now, Jsonb(signature(uid, name, role, now, body.reason))),
            )
            await cur.executemany(
                "INSERT INTO trading.limits (version, key, value, ord) VALUES (%s, %s, %s, %s)",
                [(version, v["key"], v["value"], i) for i, v in enumerate(values)],
            )
        await append(
            conn,
            [
                AuditDraft(
                    actor=f"user:{uid}",
                    action="limits.proposed",
                    entity_type="limit_version",
                    entity_id=str(version),
                    payload={"key": body.key, "from": current, "to": _num(body.value), "role": role},
                    occurred_at=now,
                )
            ],
        )
    return version


async def decide(
    conn: AsyncConnection[Any],
    version: int,
    body: LimitDecisionInput,
    *,
    uid: str,
    name: str,
    role: str,
    now: datetime,
) -> None:
    """Approve (new active, the old one superseded, effective now) or reject a proposed version."""
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT status, proposed_by FROM trading.limit_versions WHERE version = %s FOR UPDATE", (version,)
            )
            row = await cur.fetchone()
            if row is None or row["status"] != "proposed":
                raise ApiError(409, "conflict", NOT_PENDING)
            proposed_by = row["proposed_by"]["uid"]
            if proposed_by == uid:
                raise ApiError(403, "same_person", SAME_PERSON_TEXT["limits"])
            approve = body.decision == "approve"
            decided = Jsonb(signature(uid, name, role, now, body.comment or None))
            if approve:
                await cur.execute("UPDATE trading.limit_versions SET status = 'superseded' WHERE status = 'active'")
            await cur.execute(
                "UPDATE trading.limit_versions SET status = %s, effective_from = %s, decided_by = %s "
                "WHERE version = %s",
                ("active" if approve else "rejected", now if approve else None, decided, version),
            )
        await append(
            conn,
            [
                AuditDraft(
                    actor=f"user:{uid}",
                    action="limits.approved" if approve else "limits.rejected",
                    entity_type="limit_version",
                    entity_id=str(version),
                    payload={"proposed_by": proposed_by, "role": role},
                    occurred_at=now,
                )
            ],
        )
