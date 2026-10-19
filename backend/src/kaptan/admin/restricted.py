"""The R13 team blocklist in `core.restricted_securities` (06 R13, 09 §RBAC row "İçeriden-öğrenen engel listesi").

- Adding is immediate (Yönetici): a `tb:<hex>` row, kind `team_insider` or `other`, `added_by` `user:<uid>`.
- Removing takes two signatures: the Yönetici requests (1/2, written into `detail.pending_removal`), the Risk
  Sorumlusu confirms (2/2, another person) and only then is the row deleted.
- Rows the tedbir sync owns (`ts:` prefix, `system:` adders) and the SPK/VBTS kinds are never removable by
  hand; this module never touches them (the sync prunes only `ts:` rows). Team rows added by a person
  (`user:` adder, kind team_insider/other) are removable, whatever their id.
"""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any, Final, Literal

from psycopg.types.json import Jsonb

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.db import DictConn
from kaptan.domain.schemas._base import iso_ms
from kaptan.reference._sql import execute, fetch_all, fetch_one
from kaptan.reference.tedbir import ACTIVE_PREFIX

TEAM_PREFIX: Final = "tb:"
TEAM_KINDS: Final = frozenset({"team_insider", "other"})
ENTITY: Final = "restricted_security"

LIST_SQL: Final = """
SELECT id, ticker, kind, source_ref, added_at, added_by, detail
  FROM core.restricted_securities
 ORDER BY added_at DESC, id
"""
ONE_SQL: Final = "SELECT id, ticker, kind, added_by, detail FROM core.restricted_securities WHERE id = %s FOR UPDATE"
DUP_SQL: Final = "SELECT id FROM core.restricted_securities WHERE ticker = %s AND kind = %s AND id LIKE 'tb:%%'"
INSERT_SQL: Final = """
INSERT INTO core.restricted_securities (id, ticker, kind, source_ref, added_at, added_by, available_at, detail)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""
SET_DETAIL_SQL: Final = "UPDATE core.restricted_securities SET detail = %s WHERE id = %s"
DELETE_SQL: Final = "DELETE FROM core.restricted_securities WHERE id = %s"


def _entry(row: dict[str, Any]) -> dict[str, Any]:
    return {k: row[k] for k in ("id", "ticker", "kind", "source_ref", "added_at", "added_by")}


def _pending(row: dict[str, Any]) -> dict[str, Any] | None:
    p = (row.get("detail") or {}).get("pending_removal")
    return None if not p else {"id": row["id"], "ticker": row["ticker"], **p}


async def restricted_view(conn: DictConn) -> dict[str, Any]:
    rows = await fetch_all(conn, LIST_SQL)
    pending = [p for p in (_pending(r) for r in rows) if p is not None]
    return {"entries": [_entry(r) for r in rows], "pending_removals": pending}


def _signature(uid: str, name: str, role: str, reason: str, now: datetime) -> dict[str, Any]:
    return {"uid": uid, "name": name, "role": role, "at": iso_ms(now), "reason": reason}


async def add_entry(
    conn: DictConn,
    *,
    ticker: str,
    kind: Literal["team_insider", "other"],
    source_ref: str | None,
    reason: str,
    uid: str,
    name: str,
    role: str,
    now: datetime,
) -> str:
    async with conn.transaction():
        if await fetch_one(conn, DUP_SQL, (ticker, kind)) is not None:
            raise ApiError(409, "already_listed", "Bu hisse bu nedenle zaten engel listesinde.")
        entry_id = f"{TEAM_PREFIX}{secrets.token_hex(6)}"
        detail = {"reason": reason, "added": _signature(uid, name, role, reason, now)}
        await execute(conn, INSERT_SQL, (entry_id, ticker, kind, source_ref, now, user_actor(uid), now, Jsonb(detail)))
        await append(
            conn,
            [
                AuditDraft(
                    actor=user_actor(uid),
                    action="restricted.added",
                    entity_type=ENTITY,
                    entity_id=entry_id,
                    payload={"ticker": ticker, "kind": kind, "role": role, "reason": reason},
                    occurred_at=now,
                )
            ],
            now=now,
        )
    return entry_id


async def _removable(conn: DictConn, entry_id: str) -> dict[str, Any]:
    row = await fetch_one(conn, ONE_SQL, (entry_id,))
    if row is None:
        raise ApiError(404, "not_found", "Bu kayıt engel listesinde yok.")
    synced = entry_id.startswith(ACTIVE_PREFIX) or not str(row["added_by"]).startswith("user:")
    if synced or row["kind"] not in TEAM_KINDS:
        raise ApiError(409, "synced", "Bu kayıt tedbir eşitlemesinden geliyor; elle çıkarılamaz.")
    return row


async def request_removal(
    conn: DictConn, entry_id: str, *, reason: str, uid: str, name: str, role: str, now: datetime
) -> None:
    async with conn.transaction():
        row = await _removable(conn, entry_id)
        detail = dict(row.get("detail") or {})
        if detail.get("pending_removal"):
            raise ApiError(409, "pending_exists", "Bu kaydın çıkarılması zaten ikinci imzayı bekliyor.")
        detail["pending_removal"] = {"requested_by": _signature(uid, name, role, reason, now)}
        await execute(conn, SET_DETAIL_SQL, (Jsonb(detail), entry_id))
        await append(
            conn,
            [
                AuditDraft(
                    actor=user_actor(uid),
                    action="restricted.removal_requested",
                    entity_type=ENTITY,
                    entity_id=entry_id,
                    payload={"ticker": row["ticker"], "role": role, "reason": reason},
                    occurred_at=now,
                )
            ],
            now=now,
        )


async def confirm_removal(
    conn: DictConn, entry_id: str, *, reason: str, uid: str, name: str, role: str, now: datetime
) -> None:
    async with conn.transaction():
        row = await _removable(conn, entry_id)
        pending = (row.get("detail") or {}).get("pending_removal")
        if not pending:
            raise ApiError(409, "not_started", "Önce Yönetici çıkarmayı başlatmalı (1/2).")
        first = pending["requested_by"]
        if first["uid"] == uid:
            raise ApiError(403, "same_person", "İkinci imzayı çıkarmayı başlatan kişi atamaz.")
        await execute(conn, DELETE_SQL, (entry_id,))
        await append(
            conn,
            [
                AuditDraft(
                    actor=user_actor(uid),
                    action="restricted.removed",
                    entity_type=ENTITY,
                    entity_id=entry_id,
                    payload={
                        "ticker": row["ticker"],
                        "kind": row["kind"],
                        "role": role,
                        "reason": reason,
                        "requested_by": first["uid"],
                    },
                    occurred_at=now,
                )
            ],
            now=now,
        )
