"""Disclosures — owner: wave-2 package C.

    GET /disclosures/counters?day=YYYY-MM-DD -> DayCounters   (all roles; default today, Istanbul)
    GET /disclosures?day=YYYY-MM-DD&limit=200&ticker=THYAO -> DisclosureListItem[]  (all roles; newest first)

Counters for "today" (Istanbul day): kaptan.disclosures.counters.day_counters(), the port
of the panel mock's selectors.counters(). SSE `counters` (feed) via publish_counters() after changes.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.clock import istanbul_date
from kaptan.db import Conn
from kaptan.disclosures.counters import day_counters
from kaptan.disclosures.listing import MAX_LIMIT, list_disclosures
from kaptan.domain.schemas import DayCounters, DisclosureListItem

router = APIRouter(tags=["disclosures"])


def _day(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)") from exc


@router.get("/disclosures/counters", response_model=DayCounters)
async def counters(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    day: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> Any:
    """Today's counters (Istanbul, API clock); `?day=YYYY-MM-DD` counts that day instead."""
    return await day_counters(conn, clock.now(), day=_day(day))


@router.get("/disclosures", response_model=list[DisclosureListItem])
async def disclosures(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    day: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 200,
    ticker: Annotated[str | None, Query(pattern=r"^[A-Z0-9]{3,6}$")] = None,
) -> Any:
    """The day's disclosures (default: today on the API clock), newest first."""
    on = _day(day) or istanbul_date(clock.now())
    return await list_disclosures(conn, on, limit=limit, ticker=ticker)
