"""Company pages, search and the watchlist (agent INSIGHT).

    GET    /companies/{ticker}?period=1m|3m|1y|all -> Company   identity, why KAPtan follows it or not (plain words),
                                                    daily closes, the person's position, KAP disclosures, KAPtan's past
                                                    decisions on it; 404 `not_found` "Bu kodla bir şirket bulamadım."
    GET    /search?q=                  -> SearchResult  companies by ticker/name (Turkish letters folded) and
                                                    disclosures by words; q shorter than 2 letters answers empty lists
    GET    /watchlist                  -> WatchItem[]   starred companies with last close, change, newest disclosure
    PUT    /watchlist/{ticker}         -> WatchItem[]   star (audited `watchlist.added`; 409 `watchlist_full` at 50)
    DELETE /watchlist/{ticker}         -> WatchItem[]   un-star (audited `watchlist.removed`)

Nothing here calls KAP, a price source or an LLM: it reads what is stored.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.companies.profile import Period, company_profile
from kaptan.companies.search import MAX_QUERY, search
from kaptan.companies.watch import add_watch, remove_watch, watchlist_strip
from kaptan.db import Conn
from kaptan.domain.schemas.company import Company, SearchResult
from kaptan.domain.schemas.watchlist import WatchItem

router = APIRouter(tags=["companies"])
Code = Annotated[str, Path(pattern=r"^[A-Za-z0-9]{3,6}$")]


@router.get("/companies/{ticker}", response_model=Company)
async def company(ticker: Code, user: CurrentUser, conn: Conn, clock: ClockDep, period: Period = "3m") -> Any:
    doc = await company_profile(conn, ticker.upper(), now=clock.now(), period=period)
    if doc is None:
        raise ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.")
    return doc


@router.get("/search", response_model=SearchResult)
async def find(
    user: CurrentUser, conn: Conn, clock: ClockDep, q: Annotated[str, Query(max_length=MAX_QUERY * 2)] = ""
) -> Any:
    return await search(conn, q, clock.now())


@router.get("/watchlist", response_model=list[WatchItem])
async def watchlist(user: CurrentUser, conn: Conn) -> Any:
    return await watchlist_strip(conn)


@router.put("/watchlist/{ticker}", response_model=list[WatchItem])
async def watch(ticker: Code, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await add_watch(conn, ticker.upper(), uid=user.uid, now=clock.now())
    return await watchlist_strip(conn)


@router.delete("/watchlist/{ticker}", response_model=list[WatchItem])
async def unwatch(ticker: Code, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await remove_watch(conn, ticker.upper(), uid=user.uid, now=clock.now())
    return await watchlist_strip(conn)
