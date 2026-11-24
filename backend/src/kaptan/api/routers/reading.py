"""Reading marks and the two-company compare (agent READ, wave 5).

    GET    /me/reading                 -> ReadingState  unread = important (kaptan.signal) disclosures of starred or
                                          held companies, published since "hepsini okundu say", not opened, not put in a
                                          triage state; `unread_other` counts the important ones of other companies;
                                          the newest unread indexes (<= 500), the saved ("sonra") indexes, `triage`
                                          (state per disclosure) and `act_count` ("yapilacak")
    POST   /me/reading/read-all        -> ReadingState  body {"important": bool} (optional, default false): noise and
                                          archive-only disclosures are read from the start, so the plain call clears
                                          nothing that counts; with `important` true everything up to now counts as read
    PUT    /me/reading/read-through    -> ReadingState  "Geri al": the mark goes back to `read_through` (only
                                          backwards; 422 `validation` for a time after now)
    PUT    /me/reading/read/{index}    -> ReadingState  one disclosure was opened (404 `not_found`)
    GET    /me/reading/saved           -> DisclosureListItem[]  saved ("sonra oku"), newest save first (<= 200)
    PUT    /me/reading/saved/{index}   -> ReadingState  save one (404 `not_found` "Bu bildirimi bulamadım.")
    DELETE /me/reading/saved/{index}   -> ReadingState  un-save
    GET    /compare?a=&b=&period=      -> Compare  two companies: price line, statistics, 90-day KAP counts;
                                          404 `not_found` "<KOD> diye bir şirket bulamadım."; 422 `validation`
                                          "İki farklı şirket seç." for the same code twice

These marks are the person's own bookmarks, not money: no audit record. Nothing here calls KAP or a price source.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.companies.compare import compare as compare_companies
from kaptan.companies.profile import Period
from kaptan.db import Conn
from kaptan.domain.schemas import DisclosureListItem
from kaptan.domain.schemas._base import IsoDateTime, KModel
from kaptan.domain.schemas.reading import Compare, ReadingState
from kaptan.reading.marks import mark_read, read_all, reading_state, restore_through, saved_disclosures, set_saved

router = APIRouter(tags=["reading"])
Code = Annotated[str, Query(pattern=r"^[A-Za-z0-9]{3,6}$")]


@router.get("/me/reading", response_model=ReadingState)
async def state(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await reading_state(conn, clock.now())


class ReadAllBody(KModel):
    important: bool = False


@router.post("/me/reading/read-all", response_model=ReadingState)
async def everything_read(user: CurrentUser, conn: Conn, clock: ClockDep, body: ReadAllBody | None = None) -> Any:
    await read_all(conn, now=clock.now(), important=body is not None and body.important)
    return await reading_state(conn, clock.now())


class ThroughBody(KModel):
    read_through: IsoDateTime


@router.put("/me/reading/read-through", response_model=ReadingState)
async def undo_read_all(body: ThroughBody, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await restore_through(conn, body.read_through, now=clock.now())
    return await reading_state(conn, clock.now())


@router.put("/me/reading/read/{index}", response_model=ReadingState)
async def opened(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await mark_read(conn, index, now=clock.now())
    return await reading_state(conn, clock.now())


@router.get("/me/reading/saved", response_model=list[DisclosureListItem])
async def saved(user: CurrentUser, conn: Conn) -> Any:
    return await saved_disclosures(conn)


@router.put("/me/reading/saved/{index}", response_model=ReadingState)
async def save(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await set_saved(conn, index, saved=True, now=clock.now())
    return await reading_state(conn, clock.now())


@router.delete("/me/reading/saved/{index}", response_model=ReadingState)
async def unsave(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await set_saved(conn, index, saved=False, now=clock.now())
    return await reading_state(conn, clock.now())


@router.get("/compare", response_model=Compare)
async def compare(user: CurrentUser, conn: Conn, clock: ClockDep, a: Code, b: Code, period: Period = "3m") -> Any:
    if a.upper() == b.upper():
        raise ApiError(422, "validation", "İki farklı şirket seç.")
    return await compare_companies(conn, a.upper(), b.upper(), now=clock.now(), period=period)
