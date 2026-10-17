"""Walk the audit chain (port of verifyChain() in kaptan-panel/src/lib/audit-chain.ts).

Pure: takes rows in chain order, returns a ChainVerifyResult-shaped dict. `verify_db()` reads the
whole ledger from Postgres (app role, SELECT only) and walks it — no side effects on the chain.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

from psycopg import AsyncConnection

from kaptan.audit.canonical import GENESIS_PREV_HASH, ChainFields, hash_of
from kaptan.domain.schemas._base import iso_ms

FailureKind = Literal["gap_or_duplicate", "prev_hash_mismatch", "hash_mismatch", "anchor_mismatch"]


@dataclass(frozen=True, slots=True)
class StoredEntry:
    """One ledger row as stored (AuditEntry)."""

    seq: int
    fields: ChainFields
    prev_hash: str
    hash: str

    @property
    def chain_pos(self) -> int:
        return self.fields.chain_pos

    def to_api(self) -> dict[str, Any]:
        f = self.fields
        return {
            "seq": self.seq,
            "chain_pos": f.chain_pos,
            "occurred_at": f.occurred_at,
            "actor": f.actor,
            "action": f.action,
            "entity_type": f.entity_type,
            "entity_id": f.entity_id,
            "run_id": f.run_id,
            "strategy_version": f.strategy_version,
            "payload": dict(f.payload),
            "prev_hash": self.prev_hash,
            "hash": self.hash,
        }


@dataclass(frozen=True, slots=True)
class Anchor:
    at: str
    chain_pos: int
    hash: str


def verify_chain(chain: Iterable[StoredEntry], now_iso: str, anchor: Anchor | None = None) -> dict[str, Any]:
    """Same walk, same failure kinds and same result as the panel's verifyChain()."""
    anchor_out = None if anchor is None else {"at": anchor.at, "chain_pos": anchor.chain_pos, "hash": anchor.hash}
    prev = GENESIS_PREV_HASH
    checked = 0
    head = GENESIS_PREV_HASH
    failure: tuple[int, FailureKind, int] | None = None
    for i, e in enumerate(chain):
        head = e.hash
        if failure is not None:
            continue  # keep reading only to report the real head hash, like the panel
        if e.chain_pos != i + 1:
            failure = (i + 1, "gap_or_duplicate", i)
        elif e.prev_hash != prev:
            failure = (e.chain_pos, "prev_hash_mismatch", i)
        elif hash_of(e.prev_hash, e.fields) != e.hash:
            failure = (e.chain_pos, "hash_mismatch", i)
        elif anchor is not None and anchor.chain_pos == e.chain_pos and anchor.hash != e.hash:
            failure = (e.chain_pos, "anchor_mismatch", i)
        else:
            prev = e.hash
            checked = i + 1
    if failure is not None:
        pos, kind, n_checked = failure
        return {
            "ok": False,
            "first_bad_pos": pos,
            "kind": kind,
            "checked": n_checked,
            "head_hash": head,
            "verified_at": now_iso,
            "anchor": anchor_out,
        }
    return {
        "ok": True,
        "first_bad_pos": None,
        "kind": None,
        "checked": checked,
        "head_hash": prev,
        "verified_at": now_iso,
        "anchor": anchor_out,
    }


SELECT_CHAIN_SQL = """
SELECT seq, chain_pos, occurred_at, actor, action, entity_type, entity_id, run_id, strategy_version,
       payload, prev_hash, hash
  FROM audit.audit_log
 ORDER BY chain_pos
"""


def entry_from_row(row: dict[str, Any]) -> StoredEntry:
    return StoredEntry(
        seq=int(row["seq"]),
        fields=ChainFields(
            chain_pos=int(row["chain_pos"]),
            occurred_at=iso_ms(row["occurred_at"]),
            actor=row["actor"],
            action=row["action"],
            entity_type=row["entity_type"],
            entity_id=row["entity_id"],
            run_id=row["run_id"],
            strategy_version=row["strategy_version"],
            payload=row["payload"],
        ),
        prev_hash=row["prev_hash"],
        hash=row["hash"],
    )


async def load_chain(conn: AsyncConnection[dict[str, Any]]) -> list[StoredEntry]:
    async with conn.cursor() as cur:
        await cur.execute(SELECT_CHAIN_SQL)
        return [entry_from_row(r) for r in await cur.fetchall()]


async def latest_anchor(conn: AsyncConnection[dict[str, Any]]) -> Anchor | None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT anchored_at, chain_pos, hash FROM audit.anchors ORDER BY anchored_at DESC LIMIT 1")
        row = await cur.fetchone()
    if row is None:
        return None
    return Anchor(at=iso_ms(row["anchored_at"]), chain_pos=int(row["chain_pos"]), hash=row["hash"])


async def verify_db(conn: AsyncConnection[dict[str, Any]], now_iso: str) -> dict[str, Any]:
    """Walk the stored ledger. Read-only (`/audit/verify` has no side effects)."""
    chain = await load_chain(conn)
    return verify_chain(chain, now_iso, await latest_anchor(conn))
