"""The important disclosures, one meaning everywhere (wave 6 SIGNAL).

    GET    /me/signals?day=YYYY-MM-DD   -> SignalList  the important disclosures of that Istanbul day (default: today,
                                           or the last trading day when the market is closed, with `note`). Mine
                                           first (held, then watched), then the rest. Each item has a plain `line_tr`
                                           (no company name, no guessed numbers), a `tone`, `so_what_tr` (or null),
                                           `suggestion_tr` (KAPtan's word from its latest run, or null), the KAP link,
                                           `panel_path` (opens that disclosure in the reading drawer) and the person's
                                           `triage` state. 422 `validation` for a malformed day.
    GET    /me/signals/{index}          -> SignalItem  one disclosure (an unimportant one has `important` false and the
                                           KAP subject as its line); 404 `not_found` "Bu bildirimi bulamadım."
    PUT    /me/triage/{index}           -> ReadingState  body {"state": "yapilacak"|"sonra"|"tamam"}; 404 / 422.
                                           "sonra" is the old "sonra oku" star: one concept.
    DELETE /me/triage/{index}           -> ReadingState  take it out of any state

Nothing here calls KAP or a model: the lines were made from what is stored (rules; an earlier optional model line).
These are the person's own bookmarks, not money: no audit record.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas._base import KModel
from kaptan.domain.schemas.reading import ReadingState, TriageStateName
from kaptan.domain.schemas.signal import SignalItem, SignalList
from kaptan.reading.marks import reading_state
from kaptan.signal import describe
from kaptan.signal.docs import day_list, item_doc, triage_map
from kaptan.signal.triage import set_state

router = APIRouter(tags=["signals"])


class TriageBody(KModel):
    state: TriageStateName


@router.get("/me/signals", response_model=SignalList)
async def my_signals(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    day: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> Any:
    try:
        on = None if day is None else date.fromisoformat(day)
    except ValueError as exc:
        raise ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)") from exc
    return await day_list(conn, clock.now(), on)


@router.get("/me/signals/{index}", response_model=SignalItem)
async def one_signal(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    found = await describe(conn, index, clock.now())
    if found is None:
        raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")
    return item_doc(found, await triage_map(conn))


@router.put("/me/triage/{index}", response_model=ReadingState)
async def put_triage(index: int, body: TriageBody, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await set_state(conn, index, body.state, now=clock.now())
    return await reading_state(conn, clock.now())


@router.delete("/me/triage/{index}", response_model=ReadingState)
async def delete_triage(index: int, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await set_state(conn, index, None, now=clock.now())
    return await reading_state(conn, clock.now())
