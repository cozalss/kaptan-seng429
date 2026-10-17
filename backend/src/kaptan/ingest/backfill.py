"""CLI: KAP backfill by day (07 §4).

    uv run python -m kaptan.ingest.backfill --from 2026-10-15 --to 2026-10-16
    uv run python -m kaptan.ingest.backfill --from 2025-01-01 --to 2025-01-31 --details --drain 20
    uv run python -m kaptan.ingest.backfill --from 2026-10-15 --to 2026-10-15 --raw-dir ../data/raw --force

--details   queue target subjects for full text (the ingest worker drains the queue)
--drain N   then fetch up to N queued detail texts here (≥ KAP_MIN_INTERVAL_S apart)
--raw-dir   also keep each day's raw answer as raw_kap_daily/yyyy/mm/dd.json.gz
--force     re-fetch days already marked done
Writes with DATABASE_URL (app role). Exit code 2 when KAP's WAF stopped the run (rerun later: resumes).
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

from kaptan.api.loop import run
from kaptan.db import create_pool
from kaptan.ingest.detail_fetcher import fetch_one
from kaptan.ingest.kap_backfill import BackfillReport, backfill, refresh_members
from kaptan.ingest.kap_client import KapBlockedError, KapClient
from kaptan.settings import Settings, get_settings

log = logging.getLogger("kaptan.ingest.backfill")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.ingest.backfill", description="KAP disclosure backfill")
    p.add_argument("--from", dest="start", required=True, type=date.fromisoformat, help="first day (YYYY-MM-DD)")
    p.add_argument("--to", dest="end", required=True, type=date.fromisoformat, help="last day, inclusive")
    p.add_argument("--details", action="store_true", help="queue target subjects for full text")
    p.add_argument("--drain", type=int, default=0, metavar="N", help="fetch up to N queued detail texts")
    p.add_argument("--raw-dir", type=Path, default=None, help="keep raw day answers (json.gz) here")
    p.add_argument("--force", action="store_true", help="re-fetch days already done")
    p.add_argument("--no-members", action="store_true", help="skip the KAP member (issuer) refresh")
    args = p.parse_args(argv)
    if args.end < args.start:
        p.error("--to is before --from")
    if args.drain < 0:
        p.error("--drain must be >= 0")
    return args


async def main_async(args: argparse.Namespace, settings: Settings) -> BackfillReport:
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)
    try:
        async with KapClient.from_settings(settings) as client:
            companies = None
            if not args.no_members:
                companies = await refresh_members(pool, client, datetime.now(UTC).date())
            report = await backfill(
                pool,
                client,
                args.start,
                args.end,
                companies=companies,
                raw_dir=args.raw_dir,
                queue_details=args.details,
                force=args.force,
            )
            for _ in range(args.drain):
                if await fetch_one(pool, client) is None:
                    break
            log.info("KAP requests made: %d", client.requests_made)
        return report
    finally:
        await pool.close()


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    try:
        report = run(main_async(args, get_settings()))
    except KapBlockedError:
        return 2
    log.info(
        "done: %d days (%d skipped, partial %s, failed %s), %d rows: %d new, %d updated, %d skipped; "
        "%d detail texts queued; %d row errors",
        report.days,
        report.skipped_days,
        report.partial_days or "-",
        report.failed_days or "-",
        report.rows,
        report.inserted,
        report.updated,
        report.skipped,
        report.queued_details,
        len(report.errors),
    )
    return 1 if report.failed_days else 0


if __name__ == "__main__":
    sys.exit(main())
