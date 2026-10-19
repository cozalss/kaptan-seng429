"""Nightly audit verify + anchor (FR-32; scheduler 23:30).

    report = await anchor_chain(conn, now, write=True, anchor_file=Path("/var/kaptan/anchors.jsonl"))

Walks the whole ledger exactly as `/audit/verify` does. When it verifies, the head (chain_pos, hash) is
written to `audit.anchors` (target `db`, or `db+file` when AUDIT_ANCHOR_FILE is set and the JSON line
was appended there too). The next walk then also checks that the anchored position still has that hash
(`anchor_mismatch`), so a rewritten history cannot slip past a fresh re-hash.

A broken chain is never anchored: it is logged at ERROR, recorded in the ledger itself
(`audit.verify_failed` {first_bad_pos, kind, checked}) and `kaptan:audit:chain_ok` is set to 0 in Redis
(the `/metrics` gauge `kaptan_audit_chain_ok` walks the chain itself, so it reads 0 as well).
Runs inside the caller's transaction.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.audit.verify import verify_db
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.schemas._base import iso_ms

log = logging.getLogger("kaptan.audit.anchor")

ACTOR: Final = "system:audit_anchor"
CHAIN_OK_KEY: Final = "kaptan:audit:chain_ok"
INSERT_SQL: Final = """
INSERT INTO audit.anchors (anchored_at, chain_pos, hash, target) VALUES (%s, %s, %s, %s)
ON CONFLICT (anchored_at) DO NOTHING
"""


@dataclass(frozen=True, slots=True)
class AnchorReport:
    ok: bool
    checked: int
    head_hash: str | None
    anchored: bool
    target: str | None = None
    first_bad_pos: int | None = None
    kind: str | None = None


def append_line(path: Path, line: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(line, sort_keys=True) + "\n")


async def _flag(redis: Any, ok: bool) -> None:
    if redis is None:
        return
    try:
        await redis.set(CHAIN_OK_KEY, "1" if ok else "0")
    except Exception as exc:  # the verdict is already logged and in the ledger
        log.warning("audit chain flag not written: %s", type(exc).__name__)


async def anchor_chain(
    conn: AsyncConnection[Any],
    now: datetime,
    *,
    write: bool = True,
    anchor_file: Path | None = None,
    redis: Any = None,
) -> AnchorReport:
    """Verify the ledger; anchor its head when it verifies and `write` (False: verify only, DEMO_MODE)."""
    verdict = await verify_db(conn, iso_ms(now))
    checked = int(verdict["checked"])
    head = verdict.get("head_hash")
    if not verdict["ok"]:
        log.error(
            "AUDIT CHAIN BROKEN: first bad position %s (%s) after %d verified entries",
            verdict["first_bad_pos"],
            verdict["kind"],
            checked,
        )
        if write:
            payload = {"first_bad_pos": verdict["first_bad_pos"], "kind": verdict["kind"], "checked": checked}
            draft = AuditDraft(ACTOR, "audit.verify_failed", "audit_log", "chain", payload, occurred_at=now)
            await append(conn, [draft], now=now)
        await _flag(redis, False)
        return AnchorReport(False, checked, head, False, None, verdict["first_bad_pos"], verdict["kind"])
    await _flag(redis, True)
    if not write or checked == 0 or head is None:
        return AnchorReport(True, checked, head, False)
    target = "db"
    if anchor_file is not None:
        append_line(anchor_file, {"anchored_at": iso_ms(now), "chain_pos": checked, "hash": head})
        target = "db+file"
    await conn.execute(INSERT_SQL, (now, checked, head, target))
    log.info("audit chain verified (%d entries); anchored head %s… (%s)", checked, str(head)[:16], target)
    return AnchorReport(True, checked, head, True, target)
