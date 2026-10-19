"""Disclosures — owner: wave-2 package C.

    GET /disclosures/counters -> DayCounters   (all roles)

Counters for "today" (demo clock, Istanbul day): kaptan.disclosures.counters.day_counters(), the port
of the panel mock's selectors.counters(). SSE `counters` (feed) via publish_counters() after changes.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.disclosures.counters import day_counters
from kaptan.domain.schemas import DayCounters

router = APIRouter(tags=["disclosures"])


@router.get("/disclosures/counters", response_model=DayCounters)
async def counters(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await day_counters(conn, clock.now(), demo=clock.demo)
