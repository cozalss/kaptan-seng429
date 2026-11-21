"""What is coming up and how the market is (agent HOME).

    GET /me/calendar?days=60 -> Calendar    events from today for the shares held and watched: dividend payment and
                                            right-to-dividend days and general meetings read from the company's KAP
                                            notice, financial-report windows (last year's day, `approximate`), and the
                                            central bank's rate-decision days. `notes` says what is not shown and why
                                            (inflation release days; a year the bank has not published yet).
                                            days 1 to 120 (default 60); other values answer 422.
    GET /market/strip        -> MarketStrip BIST 100 (last stored close and day change), open/closed with the next
                                            opening day, USD/TRY (TCMB bulletin). Missing values are null.

Nothing here calls KAP or a price source: it reads what is stored.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.agenda import events, market
from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.domain.schemas.agenda import Calendar, MarketStrip

router = APIRouter(tags=["agenda"])


@router.get("/me/calendar", response_model=Calendar, response_model_by_alias=True)
async def my_calendar(
    user: CurrentUser, conn: Conn, clock: ClockDep, days: Annotated[int, Query(ge=1, le=events.MAX_DAYS)] = 60
) -> Any:
    return await events.calendar(conn, clock.now(), days)


@router.get("/market/strip", response_model=MarketStrip)
async def market_strip(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await market.strip(conn, clock.now())
