"""Fetch the attachments of E2 disclosures already stored: a small, explicit, resumable job.

    uv run python -m kaptan.ingest.attachment_refetch --dry-run     # how many rows it would touch
    uv run python -m kaptan.ingest.attachment_refetch --limit 50    # the next 50, at least 5 s apart

Run by hand only; nothing schedules it. It starts no agent run. The queue row survives a stop, so a second call
continues where the first ended; a WAF signal stops the job at once (exit 2). Rows with no stored text, or with the
old fallback's React payload as text, get their form from the same page while they are here. Two requests per
disclosure, one per extra file.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, replace
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.attachment_fetcher import fetch_attachments_one
from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapClientConfig

log = logging.getLogger("kaptan.ingest.attachments")

#: A job with no deadline can afford more distance than the live loops.
JOB_MIN_INTERVAL_S: Final = 5.0
DEFAULT_LIMIT: Final = 50
EXIT_OK: Final = 0
EXIT_BLOCKED: Final = 2


@dataclass(frozen=True, slots=True)
class RefetchReport:
    pending: int
    processed: int
    blocked: bool


async def run_refetch(
    pool: Any, client: Any, *, limit: int, fetch: Callable[..., Awaitable[int | None]] | None = None
) -> RefetchReport:
    """Queue what is not settled yet, then work through at most `limit` rows."""
    step = fetch or fetch_attachments_one
    async with pool.connection() as conn:
        pending = await repo.enqueue_stored_e2(conn)
        await repo.release_running_attachments(conn, job_rows=True)
        await conn.commit()
    processed = 0
    while processed < limit:
        try:
            index = await step(pool, client, job_rows=True)
        except KapBlockedError as exc:
            log.warning("attachment job: WAF/back-off signal (%s); stopping, run it again later", exc)
            return RefetchReport(pending, processed, blocked=True)
        if index is None:
            break
        processed += 1
    return RefetchReport(pending, processed, blocked=False)


async def _main(args: argparse.Namespace) -> int:  # pragma: no cover - CLI wiring
    from kaptan.db import create_pool
    from kaptan.settings import get_settings

    settings = get_settings()
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)
    try:
        if args.dry_run:
            async with pool.connection() as conn:
                print(f"would fetch attachments of {await repo.count_stored_e2(conn)} disclosures")
            return EXIT_OK
        config = KapClientConfig.from_settings(settings)
        slower = replace(config, min_interval_s=max(config.min_interval_s, JOB_MIN_INTERVAL_S))
        async with KapClient(slower) as client:
            report = await run_refetch(pool, client, limit=args.limit)
    finally:
        await pool.close()
    print(f"pending={report.pending} processed={report.processed} blocked={report.blocked}")
    return EXIT_BLOCKED if report.blocked else EXIT_OK


def main(argv: Sequence[str] | None = None) -> int:  # pragma: no cover - CLI wiring
    from kaptan.api.loop import run

    p = argparse.ArgumentParser(prog="python -m kaptan.ingest.attachment_refetch", description=__doc__.split("\n")[0])
    p.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    p.add_argument("--dry-run", action="store_true")
    return run(_main(p.parse_args(argv)))


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
