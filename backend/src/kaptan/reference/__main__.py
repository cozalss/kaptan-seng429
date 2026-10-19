"""Run one reference-data job by hand (the scheduler calls the same coroutines).

    uv run python -m kaptan.reference universe --day 2026-10-20
    uv run python -m kaptan.reference tedbir
    uv run python -m kaptan.reference fundamentals --tickers THYAO,ASELS
    uv run python -m kaptan.reference intraday-archive --day 2026-10-19 --tickers THYAO
    uv run python -m kaptan.reference dq --day 2026-10-20 --test

Writes with DATABASE_URL (app role; `--test` = TEST_DATABASE_URL) and commits at the end. Network jobs
(profiles, fundamentals, intraday-*) are paced like the price backfill (PRICES_MIN_INTERVAL_S).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from dataclasses import asdict, is_dataclass
from datetime import UTC, date, datetime
from typing import Any, Final

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.prices.calendar import istanbul_date
from kaptan.prices.http import PoliteClient, make_http_client
from kaptan.settings import Settings, get_settings

JOBS: Final = (
    "profiles", "markets", "universe", "tedbir", "quotes", "intraday-archive", "event-returns", "fundamentals",
    "dq", "retention",
)  # fmt: skip


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.reference", description=__doc__.split("\n\n")[0])
    p.add_argument("job", choices=JOBS)
    p.add_argument("--day", type=date.fromisoformat, default=None, help="YYYY-MM-DD (default: today, Istanbul)")
    p.add_argument("--tickers", default="", help="comma separated codes (fundamentals, quotes, intraday-archive)")
    p.add_argument("--test", action="store_true", help="use TEST_DATABASE_URL")
    return p.parse_args(argv)


def _jsonable(x: Any) -> Any:
    if is_dataclass(x) and not isinstance(x, type):
        return {k: _jsonable(v) for k, v in asdict(x).items()}
    if isinstance(x, list | tuple):
        return [_jsonable(v) for v in x]
    if isinstance(x, dict):
        return {str(k): _jsonable(v) for k, v in x.items()}
    return x if isinstance(x, int | float | str | bool) or x is None else str(x)


async def _job(conn: Any, args: argparse.Namespace, settings: Settings, now: datetime) -> Any:
    from kaptan import dq, fundamentals, reference
    from kaptan.prices import intraday

    day = args.day or istanbul_date(now)
    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    if args.job == "markets":
        return await reference.sync_market_changes(conn, now)
    if args.job == "universe":
        return await reference.run_universe(conn, day, now=now)
    if args.job == "tedbir":
        return await reference.run_tedbir_sync(
            conn, now, bulletin=reference.spk_bulletin_source(settings, clock=lambda: now)
        )
    if args.job == "event-returns":
        return await reference.run_event_returns(conn, day, now=now)
    if args.job == "dq":
        return await dq.run_dq(conn, day)
    if args.job == "retention":
        return await dq.run_retention(conn, now)
    async with make_http_client() as http:
        client = PoliteClient(http, min_interval_s=settings.prices_min_interval_s)
        if args.job == "profiles":
            return await reference.run_issuer_profiles(conn, now, client=client)
        if args.job == "fundamentals":
            return await fundamentals.run_fundamentals(conn, now, client=client, tickers=tickers or None)
        if args.job == "quotes":
            return await intraday.refresh_quotes(conn, tickers, now, client=client)
        return await intraday.run_intraday_archive(conn, day, client=client, tickers=tickers or None, now=now)


async def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    settings = get_settings()
    url = settings.test_database_url if args.test else settings.database_url
    if url is None:
        print("TEST_DATABASE_URL is not set", file=sys.stderr)
        return 2
    conn = await connect(url.get_secret_value())
    try:
        result = await _job(conn, args, settings, datetime.now(UTC))
        await conn.commit()
    finally:
        await conn.close()
    print(json.dumps(_jsonable(result), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(run(main()))
