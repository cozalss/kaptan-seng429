"""Backup checks. The dump/restore themselves are POSIX scripts (`ops/backup.sh`, `ops/restore.sh`: they
need only pg_dump/pg_restore and optionally age, so they run in the postgres image).

    uv run python -m kaptan.ops.backup verify --url postgresql://...@host/kaptan_restore

`verify` walks the audit hash chain of the (restored) database exactly as `/audit/verify` does and checks
that the schema revision is this code's head. Exit 0 = the chain verifies, 1 = it does not, 2 = usage.
The URL may also come from RESTORE_DATABASE_URL; it is never printed.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime
from typing import Any

from kaptan.api.loop import run
from kaptan.audit.verify import verify_db
from kaptan.db import connect
from kaptan.domain.schemas._base import iso_ms
from kaptan.ops.health import code_heads, db_revisions, migration_state


async def verify_database(url: str) -> dict[str, Any]:
    """{"ok", "checked", "head_hash", "migrations"} of the database at `url`."""
    conn = await connect(url)
    try:
        verdict = await verify_db(conn, iso_ms(datetime.now(UTC)))
        await conn.rollback()
        revisions = await db_revisions(conn)
    finally:
        await conn.close()
    return {
        "ok": bool(verdict["ok"]),
        "checked": int(verdict["checked"]),
        "head_hash": verdict.get("head_hash"),
        "migrations": migration_state(revisions, code_heads()),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m kaptan.ops.backup")
    sub = parser.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verify", help="walk the audit chain of a (restored) database")
    v.add_argument("--url", default=os.environ.get("RESTORE_DATABASE_URL"))
    args = parser.parse_args(argv)
    if not args.url:
        print("verify: give --url or RESTORE_DATABASE_URL", file=sys.stderr)
        return 2
    result = run(verify_database(args.url))
    head = str(result["head_hash"] or "")[:16]
    print(f"audit verify: ok={result['ok']} checked={result['checked']} head={head}...")
    print(f"migrations: {result['migrations']}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
