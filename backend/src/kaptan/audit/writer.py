"""Append to the hash-chained audit ledger (audit.audit_log).

Every write endpoint calls `append()` inside the same transaction as its state change, so the
ledger and the state never disagree. Writers are serialised with a transaction-scoped advisory
lock; chain_pos, prev_hash and hash are computed here with the panel's exact canonical form
(audit/canonical.py), which is why the hash is not computed by a database trigger.
The app role may only INSERT and SELECT this table (migration 0001).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.audit.canonical import GENESIS_PREV_HASH, ChainFields, hash_of
from kaptan.audit.verify import StoredEntry
from kaptan.domain.schemas._base import iso_ms

AUDIT_LOCK_KEY = "audit.audit_log"


@dataclass(frozen=True, slots=True)
class AuditDraft:
    """What a caller knows; the writer adds chain_pos, prev_hash and hash."""

    actor: str  # "user:uye-3" | "agent:<node>" | "system:<job>"
    action: str  # "approval.decided", ...
    entity_type: str
    entity_id: str
    payload: Mapping[str, Any] = field(default_factory=dict)
    run_id: str | None = None
    strategy_version: str | None = None
    occurred_at: datetime | None = None  # default: now (UTC); truncated to milliseconds


def user_actor(uid: str) -> str:
    return f"user:{uid}"


def _ms(dt: datetime) -> datetime:
    utc = dt.astimezone(UTC)
    return utc.replace(microsecond=(utc.microsecond // 1000) * 1000)


def chain_entries(
    drafts: Sequence[AuditDraft], *, last_pos: int, last_hash: str | None, now: datetime
) -> list[StoredEntry]:
    """Pure: the entries `drafts` become when appended after (last_pos, last_hash)."""
    out: list[StoredEntry] = []
    prev = last_hash or GENESIS_PREV_HASH
    pos = last_pos
    for d in drafts:
        pos += 1
        fields = ChainFields(
            chain_pos=pos,
            occurred_at=iso_ms(_ms(d.occurred_at or now)),
            actor=d.actor,
            action=d.action,
            entity_type=d.entity_type,
            entity_id=d.entity_id,
            run_id=d.run_id,
            strategy_version=d.strategy_version,
            payload=dict(d.payload),
        )
        digest = hash_of(prev, fields)
        out.append(StoredEntry(seq=pos, fields=fields, prev_hash=prev, hash=digest))
        prev = digest
    return out


INSERT_SQL = """
INSERT INTO audit.audit_log
  (seq, chain_pos, occurred_at, actor, action, entity_type, entity_id, run_id, strategy_version,
   payload, prev_hash, hash)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


def insert_params(e: StoredEntry) -> tuple[Any, ...]:
    f = e.fields
    return (
        e.seq,
        f.chain_pos,
        datetime.fromisoformat(f.occurred_at.replace("Z", "+00:00")),
        f.actor,
        f.action,
        f.entity_type,
        f.entity_id,
        f.run_id,
        f.strategy_version,
        Jsonb(dict(f.payload)),
        e.prev_hash,
        e.hash,
    )


async def append(
    conn: AsyncConnection[Any], drafts: Sequence[AuditDraft], *, now: datetime | None = None
) -> list[StoredEntry]:
    """Append drafts to the chain. Must run inside the caller's transaction (`async with conn.transaction()`)."""
    if not drafts:
        return []
    async with conn.cursor() as cur:
        await cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (AUDIT_LOCK_KEY,))
        await cur.execute("SELECT chain_pos, hash FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
        row = await cur.fetchone()
        last_pos, last_hash = (0, None) if row is None else (int(_get(row, 0, "chain_pos")), _get(row, 1, "hash"))
        entries = chain_entries(drafts, last_pos=last_pos, last_hash=last_hash, now=now or datetime.now(UTC))
        await cur.executemany(INSERT_SQL, [insert_params(e) for e in entries])
    return entries


def _get(row: Any, index: int, key: str) -> Any:
    return row[key] if isinstance(row, Mapping) else row[index]
