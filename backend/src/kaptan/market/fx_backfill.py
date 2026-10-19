"""Backfill TCMB exchange rates into core.fx_rates (migration 0013).

    uv run python -m kaptan.market.fx_backfill --from 2026-01-01 --to 2026-10-20
    uv run python -m kaptan.market.fx_backfill --today
    uv run python -m kaptan.market.fx_backfill --from 2026-10-01 --to 2026-10-20 --dry-run

One archive request per weekday (TCMB answers 404 on holidays; those days are skipped), paced
`--min-interval` seconds apart; idempotent (upsert), so re-running a window refreshes it. Writes with
DATABASE_URL (`--test` = TEST_DATABASE_URL). Exit 0 = every day fetched, 1 = some day failed.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Final

import httpx

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.market.fx import FxRate, FxSourceError, fetch_day, fetch_today, make_client
from kaptan.market.fx_store import Conn, upsert_rates
from kaptan.settings import get_settings

log = logging.getLogger("kaptan.market.fx_backfill")
MAX_SPAN_DAYS: Final = 366 * 10
#: The currencies E3 amounts come in (others are stored too; this is only the summary line).
SUMMARY: Final = ("USD", "EUR")


@dataclass
class Report:
    days: int = 0
    bulletins: int = 0
    rows: int = 0
    failed: list[date] = field(default_factory=list)


def weekdays(start: date, end: date) -> list[date]:
    out, d = [], start
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


async def backfill(
    http: httpx.AsyncClient,
    conn: Conn | None,
    days: Sequence[date],
    *,
    min_interval_s: float = 1.0,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> Report:
    report = Report()
    for i, d in enumerate(days):
        if i:
            await sleep(min_interval_s)
        report.days += 1
        try:
            rates = await fetch_day(http, d, sleep=sleep)
        except FxSourceError as exc:
            report.failed.append(d)
            log.warning("fx %s failed: %s", d, exc)
            continue
        if rates is None:
            continue
        report.bulletins += 1
        report.rows += await _store(conn, rates)
    return report


async def _store(conn: Conn | None, rates: list[FxRate]) -> int:
    if conn is None:
        return len(rates)
    async with conn.transaction():
        return await upsert_rates(conn, rates)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.market.fx_backfill", description=__doc__.split("\n\n")[0])
    p.add_argument("--from", dest="start", type=date.fromisoformat, help="YYYY-MM-DD")
    p.add_argument("--to", dest="end", type=date.fromisoformat, help="YYYY-MM-DD (inclusive)")
    p.add_argument("--today", action="store_true", help="fetch today.xml only")
    p.add_argument("--min-interval", type=float, default=1.0, help="seconds between requests (≥ 0.5)")
    p.add_argument("--dry-run", action="store_true", help="fetch and summarise, write nothing")
    p.add_argument("--test", action="store_true", help="write to TEST_DATABASE_URL")
    args = p.parse_args(argv)
    if not args.today and (args.start is None or args.end is None):
        p.error("give --from and --to, or --today")
    if not args.today and args.end < args.start:
        p.error("--to is before --from")
    if not args.today and (args.end - args.start).days > MAX_SPAN_DAYS:
        p.error("window longer than 10 years: split it")
    if args.min_interval < 0.5:
        p.error("--min-interval below 0.5 s is not polite")
    return args


async def main(args: argparse.Namespace, transport: httpx.AsyncBaseTransport | None = None) -> int:
    settings = get_settings()
    url = settings.test_database_url if args.test else settings.database_url
    conn: Any = None
    if not args.dry_run:
        if url is None:
            print("TEST_DATABASE_URL is not set", file=sys.stderr)
            return 2
        conn = await connect(url.get_secret_value())
    try:
        async with make_client(transport) as http:
            if args.today:
                try:
                    rates = await fetch_today(http)
                except FxSourceError as exc:
                    print(f"today FAILED: {exc}", file=sys.stderr)
                    return 1
                report = Report(days=1, bulletins=1, rows=await _store(conn, rates))
                shown = {r.currency: r.rate for r in rates if r.currency in SUMMARY}
                print(f"{rates[0].d}: " + ", ".join(f"{k}={v.normalize()}" for k, v in sorted(shown.items())))
            else:
                report = await backfill(http, conn, weekdays(args.start, args.end), min_interval_s=args.min_interval)
    finally:
        if conn is not None:
            await conn.close()
    failed = ", ".join(str(d) for d in report.failed) or "none"
    print(f"{report.days} days, {report.bulletins} bulletins, {report.rows} rows, failed: {failed}")
    return 1 if report.failed else 0


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(run(main(parse_args())))
