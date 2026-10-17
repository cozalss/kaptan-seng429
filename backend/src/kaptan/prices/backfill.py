"""Backfill daily prices and corporate actions.

    uv run python -m kaptan.prices.backfill --tickers THYAO,FROTO,XU100 --from 2025-01-01 --to 2025-06-30
    uv run python -m kaptan.prices.backfill --tickers TRKCM --from 2020-01-01 --to 2020-03-31 --sources isyatirim
    uv run python -m kaptan.prices.backfill --tickers THYAO --from 2026-09-01 --to 2026-09-30 --dry-run

Writes with DATABASE_URL (app role; `--test` = TEST_DATABASE_URL). Requests are serialised and paced
(≥ 2 s apart by default, with jitter); idempotent, so re-running a window refreshes it.
Exit code 0 = every ticker succeeded, 1 = at least one source failed (the others are still stored).
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.prices.http import PoliteClient, SourceError, make_http_client
from kaptan.prices.ingest import ALL_SOURCES, Source, TickerReport, fetch_ticker, store_fetched
from kaptan.prices.models import InvalidTickerError, normalise_ticker
from kaptan.settings import get_settings

log = logging.getLogger("kaptan.prices.backfill")
MAX_SPAN_DAYS = 366 * 10


def _tickers(raw: str) -> list[str]:
    parts = [p for chunk in raw.split(",") for p in chunk.split()]
    try:
        return list(dict.fromkeys(normalise_ticker(p) for p in parts if p))
    except InvalidTickerError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def _sources(raw: str) -> list[Source]:
    out: list[Source] = []
    for s in raw.split(","):
        if s not in ALL_SOURCES:
            raise argparse.ArgumentTypeError(f"unknown source {s!r} (choose from {', '.join(ALL_SOURCES)})")
        out.append(s)  # checked against ALL_SOURCES above
    return out


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.prices.backfill", description=__doc__.split("\n\n")[0])
    p.add_argument("--tickers", required=True, type=_tickers, help="comma/space separated BIST codes (XU100 too)")
    p.add_argument("--from", dest="start", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    p.add_argument("--to", dest="end", required=True, type=date.fromisoformat, help="YYYY-MM-DD (inclusive)")
    p.add_argument("--sources", type=_sources, default=list(ALL_SOURCES), help="isyatirim,yfinance (default both)")
    p.add_argument(
        "--min-interval", type=float, default=None, help="seconds between requests (PRICES_MIN_INTERVAL_S, 2)"
    )
    p.add_argument("--dry-run", action="store_true", help="fetch and summarise, write nothing")
    p.add_argument("--test", action="store_true", help="write to TEST_DATABASE_URL")
    args = p.parse_args(argv)
    if args.end < args.start:
        p.error("--to is before --from")
    if (args.end - args.start).days > MAX_SPAN_DAYS:
        p.error("window longer than 10 years: split it")
    if args.min_interval is not None and args.min_interval < 0.5:
        p.error("--min-interval below 0.5 s is not polite")
    return args


def _summary(r: TickerReport) -> str:
    kinds = ", ".join(f"{a.ex_date} {a.kind} x{a.factor.normalize()}" for a in r.actions) or "none"
    return (
        f"{r.ticker:6s} raw={r.raw_rows:4d} (open {r.opens_filled}) adjusted={r.adjusted_rows:4d} "
        f"yahoo_zero_volume_dropped={r.yahoo_zero_volume_dropped} actions: {kinds}"
    )


async def main(args: argparse.Namespace) -> int:
    settings = get_settings()
    url = settings.test_database_url if args.test else settings.database_url
    conn = None
    if not args.dry_run:
        if url is None:
            print("TEST_DATABASE_URL is not set", file=sys.stderr)
            return 2
        conn = await connect(url.get_secret_value())
    failures = 0
    try:
        async with make_http_client() as http:
            client = PoliteClient(http, min_interval_s=args.min_interval or settings.prices_min_interval_s)
            for ticker in args.tickers:
                try:
                    fetched = await fetch_ticker(client, ticker, args.start, args.end, args.sources)
                except SourceError as exc:
                    failures += 1
                    print(f"{ticker:6s} FAILED: {exc}", file=sys.stderr)
                    continue
                if conn is None:
                    report = TickerReport(ticker, len(fetched.raw), len(fetched.adjusted), fetched.actions,
                                          sum(1 for b in fetched.raw if b.open is not None),
                                          fetched.yahoo_zero_volume_dropped)  # fmt: skip
                else:
                    report = await store_fetched(conn, fetched, datetime.now(UTC))
                print(_summary(report))
            print(f"{client.requests} HTTP requests")
    finally:
        if conn is not None:
            await conn.close()
    return 1 if failures else 0


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(run(main(parse_args())))
