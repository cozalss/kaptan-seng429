"""Morning brief (FR-35) — backend-only (the panel does not call it yet), M3 B1.

    GET /brief/today  -> MorningBrief  (all roles; today = the clock's Istanbul day)
    GET /brief/{date} -> MorningBrief  (all roles; YYYY-MM-DD)

The scheduler builds the brief at 08:45 (kaptan.brief, ops.morning_briefs). 404 `not_found`
"Bu gün için sabah özeti yok." when none was built for that day; 422 for a malformed date.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.brief.store import get_brief
from kaptan.db import Conn
from kaptan.domain.schemas.reports import MorningBrief
from kaptan.prices.calendar import istanbul_date

router = APIRouter(tags=["brief"])

NOT_FOUND_TEXT = "Bu gün için sabah özeti yok."


async def _one(conn: Conn, day: date) -> dict[str, Any]:
    doc = await get_brief(conn, day)
    await conn.rollback()
    if doc is None:
        raise ApiError(404, "not_found", NOT_FOUND_TEXT)
    return doc


@router.get("/brief/today", response_model=MorningBrief)
async def brief_today(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await _one(conn, istanbul_date(clock.now()))


@router.get("/brief/{day}", response_model=MorningBrief)
async def brief_of(day: date, user: CurrentUser, conn: Conn) -> Any:
    return await _one(conn, day)
