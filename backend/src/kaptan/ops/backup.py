"""Backup checks. The dump/restore themselves are POSIX scripts (`ops/backup.sh`, `ops/restore.sh`: they
need only pg_dump/pg_restore and optionally age, so they run in the postgres image).

    uv run python -m kaptan.ops.backup verify --url postgresql://...@host/kaptan_restore [--anchors FILE]

`verify` walks the audit hash chain of the (restored) database exactly as `/audit/verify` does and checks
that the schema revision is this code's head. `--anchors` also compares the off-Docker AUDIT_ANCHOR_FILE: a
dump rewritten together with its own `audit.anchors` table still disagrees with that file. An anchor newer
than the dump is normal. Exit 0 = everything verifies, 1 = it does not, 2 = usage.
The URL may also come from RESTORE_DATABASE_URL; it is never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from kaptan.api.loop import run
from kaptan.audit.verify import verify_db
from kaptan.db import connect
from kaptan.domain.schemas._base import iso_ms
from kaptan.ops.health import code_heads, db_revisions, migration_state


def read_anchor_lines(path: Path) -> list[tuple[int, str]]:
    """(chain_pos, hash) of each line of the anchor file. A torn last line (power cut) is skipped."""
    if not path.is_file():
        return []
    out: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            doc = json.loads(line)
            out.append((int(doc["chain_pos"]), str(doc["hash"])))
        except (ValueError, KeyError, TypeError):
            continue
    return out


def compare_anchors(anchors: Sequence[tuple[int, str]], hash_at: Callable[[int], str | None]) -> dict[str, Any]:
    matched, later, mismatched = 0, 0, []
    for pos, expected in anchors:
        found = hash_at(pos)
        if found is None:
            later += 1
        elif found == expected:
            matched += 1
        else:
            mismatched.append(pos)
    return {"matched": matched, "later": later, "mismatched": mismatched}


async def _ledger_hashes(conn: Any) -> dict[int, str]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT chain_pos, hash FROM audit.audit_log")
        return {int(r["chain_pos"]): str(r["hash"]) for r in await cur.fetchall()}


async def verify_database(url: str, anchors: Sequence[tuple[int, str]] = ()) -> dict[str, Any]:
    """{"ok", "checked", "head_hash", "migrations", "anchors"} of the database at `url`."""
    conn = await connect(url)
    try:
        verdict = await verify_db(conn, iso_ms(datetime.now(UTC)))
        ledger = await _ledger_hashes(conn)
        await conn.rollback()
        revisions = await db_revisions(conn)
    finally:
        await conn.close()
    witness = compare_anchors(anchors, ledger.get)
    return {
        "ok": bool(verdict["ok"]) and not witness["mismatched"],
        "checked": int(verdict["checked"]),
        "head_hash": verdict.get("head_hash"),
        "migrations": migration_state(revisions, code_heads()),
        "anchors": witness,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m kaptan.ops.backup")
    sub = parser.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verify", help="walk the audit chain of a (restored) database")
    v.add_argument("--url", default=os.environ.get("RESTORE_DATABASE_URL"))
    v.add_argument("--anchors", type=Path, default=None, help="the AUDIT_ANCHOR_FILE to compare with")
    args = parser.parse_args(argv)
    if not args.url:
        print("verify: give --url or RESTORE_DATABASE_URL", file=sys.stderr)
        return 2
    result = run(verify_database(args.url, read_anchor_lines(args.anchors) if args.anchors else ()))
    head = str(result["head_hash"] or "")[:16]
    print(f"audit verify: ok={result['ok']} checked={result['checked']} head={head}...")
    print(f"migrations: {result['migrations']}")
    print(
        f"anchors: matched={result['anchors']['matched']} later={result['anchors']['later']} "
        f"mismatched={result['anchors']['mismatched']}"
    )
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
