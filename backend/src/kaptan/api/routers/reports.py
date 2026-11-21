"""Reports — agent REPORT (wave 4). Read-only; every endpoint needs the sign-in only.

    GET /reports/track?from=&to=         -> TrackRecord  every buy suggestion, what you did, what the price did after
    GET /reports/benchmark?from=&to=     -> Benchmark    your money line vs BIST 100 over the same days
    GET /reports/karne?period=month|year&at=2026-11|2026 -> Karne   (default: the current month)
    GET /reports/quiet?day=YYYY-MM-DD    -> QuietDay     why a day has no suggestion (default today)

TrackRecord: items oldest first. `return_ratio` is the adjusted price move from the opening of the first session after
the suggestion to the close of the last day of the card's planned period (commission not in it), `index_ratio` BIST 100
over the same sessions; both null and `result_tr` "Sonuç 6 Aralık'ta belli olur" while the period is open, and
`status` "no_data" when it is over but no prices are stored (never estimated). `summary.caveat_tr` says "bu kadar azla
bir şey söylemek erken" under 30 finished results. Benchmark: `available` false with `reason_tr` when fewer than two
days of closes or a BIST 100 close are missing: show nothing. Karne: nulls are unknown (left out by the page);
`dividends_try` null until the book has dividend rows. Errors: 422 validation "Tarih bekleniyor (YYYY-MM-DD)" /
"Dönem bekleniyor ...".
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.reports import Benchmark, Karne, KarnePeriod, QuietDay, TrackRecord
from kaptan.prices.calendar import IST, istanbul_date
from kaptan.reports import benchmark as bench
from kaptan.reports.karne import karne, parse_period
from kaptan.reports.quiet import quiet_day
from kaptan.reports.track import summarize, track_items

router = APIRouter(tags=["reports"])

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
AT_PATTERN = r"^\d{4}(-(0[1-9]|1[0-2]))?$"
BAD_DAY = "Tarih bekleniyor (YYYY-MM-DD)"


def _day(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(422, "validation", BAD_DAY) from exc


def _start(d: date | None) -> datetime | None:
    return None if d is None else datetime.combine(d, time(0), IST)


@router.get("/reports/track", response_model=TrackRecord)
async def track(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    from_: Annotated[str | None, Query(alias="from", pattern=DATE_PATTERN)] = None,
    to: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Any:
    now = clock.now()
    last = _day(to)
    items = await track_items(
        conn, now, lo=_start(_day(from_)), hi=None if last is None else _start(last + timedelta(days=1))
    )
    await conn.rollback()
    return {"as_of": iso_ms(now), "items": items, "summary": summarize(items)}


@router.get("/reports/benchmark", response_model=Benchmark)
async def benchmark(
    user: CurrentUser,
    conn: Conn,
    from_: Annotated[str | None, Query(alias="from", pattern=DATE_PATTERN)] = None,
    to: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Any:
    out = await bench.benchmark(conn, _day(from_), _day(to))
    await conn.rollback()
    return out


@router.get("/reports/karne", response_model=Karne)
async def report(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    period: KarnePeriod = "month",
    at: Annotated[str | None, Query(pattern=AT_PATTERN)] = None,
) -> Any:
    now = clock.now()
    today = istanbul_date(now)
    default = f"{today.year}" if period == "year" else f"{today.year}-{today.month:02d}"
    try:
        p = parse_period(period, at or default)
    except ValueError as exc:
        raise ApiError(422, "validation", "Dönem bekleniyor (ay için 2026-11, yıl için 2026)") from exc
    out = await karne(conn, p, now)
    await conn.rollback()
    return out


@router.get("/reports/quiet", response_model=QuietDay)
async def quiet(
    user: CurrentUser, conn: Conn, clock: ClockDep, day: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None
) -> Any:
    now = clock.now()
    out = await quiet_day(conn, now, _day(day) or istanbul_date(now))
    await conn.rollback()
    return out
