"""Seed the demo day (owner connection) and check the ledger.

    uv run python scripts/seed_demo.py            # DATABASE_OWNER_URL
    uv run python scripts/seed_demo.py --test     # TEST_DATABASE_OWNER_URL

Prints the row counts and the result of walking the audit chain (must be ok on a fresh seed).
"""

from __future__ import annotations

import argparse
import sys

from kaptan.api.loop import run
from kaptan.audit.verify import verify_db
from kaptan.db import connect
from kaptan.demo.seed import reseed
from kaptan.domain.schemas import iso_ms
from kaptan.settings import get_settings


async def main(test: bool) -> int:
    settings = get_settings()
    url = settings.test_database_owner_url if test else settings.database_owner_url
    if url is None:
        print("DATABASE_OWNER_URL / TEST_DATABASE_OWNER_URL is not set", file=sys.stderr)
        return 2
    conn = await connect(url.get_secret_value())
    try:
        result = await reseed(conn)
        for table, n in result.counts.items():
            print(f"{table:32s} {n:6d}")
        verdict = await verify_db(conn, iso_ms(result.started_at))
        await conn.commit()
    finally:
        await conn.close()
    print(f"demo clock started at {iso_ms(result.started_at)} (reads 2027-01-11T10:40:00.000Z now)")
    print(f"audit verify: ok={verdict['ok']} checked={verdict['checked']} head={verdict['head_hash'][:16]}...")
    return 0 if verdict["ok"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="seed the integration-test database")
    args = parser.parse_args()
    sys.exit(run(main(args.test)))
