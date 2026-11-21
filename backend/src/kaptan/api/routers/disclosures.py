"""Disclosures — owner: wave-2 package C.

    GET /disclosures/counters?day=YYYY-MM-DD -> DayCounters   (all roles; default today, Istanbul)
    GET /disclosures?day=YYYY-MM-DD&limit=200&ticker=THYAO -> DisclosureListItem[]  (all roles; newest first)
        optional filters, combined with AND: `type=E1|E2|E3|E4|IGNORE` (what KAPtan thought it was), `acted=true`
        (a suggestion came of it), `scope=watchlist|mine` (starred companies / starred or held)
    GET /disclosures/{index} -> DisclosureReading  (full text, the numbers KAPtan read, what it did; 404 not_found)

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
from kaptan.disclosures.reading import disclosure_reading
from kaptan.domain.schemas import DayCounters, DisclosureListItem
from kaptan.domain.schemas.company import DisclosureReading

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
    type: Annotated[str | None, Query(pattern=r"^(E1|E2|E3|E4|IGNORE)$")] = None,
    acted: bool = False,
    scope: Annotated[str | None, Query(pattern=r"^(watchlist|mine)$")] = None,
) -> Any:
    """The day's disclosures (default: today on the API clock), newest first."""
    on = _day(day) or istanbul_date(clock.now())
    return await list_disclosures(conn, on, limit=limit, ticker=ticker, event_type=type, acted=acted, scope=scope)


@router.get("/disclosures/{index}", response_model=DisclosureReading)
async def disclosure(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    """One disclosure in full (`/disclosures/counters` is a separate route, matched first)."""
    doc = await disclosure_reading(conn, index, now=clock.now())
    if doc is None:
        raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")
    return doc
