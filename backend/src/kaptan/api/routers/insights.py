"""What Param says about the person's own money — agent PARAM (wave 5). Reads need the sign-in only.

    GET    /me/insights/allocation      -> Allocation     share per holding and sector of the whole money, the limit
    PUT    /me/insights/concentration   ConcentrationInput {threshold_pct 5..100} -> Allocation
                                          audit `concentration.threshold_set`; only changes a sentence
    GET    /me/insights/closed-trades   -> ClosedTrades   every sale: gain after commission, days held, win rate
    GET    /me/insights/stats           -> ReturnStats    time-weighted return, best / worst day, biggest fall
    GET    /me/insights/dividends       -> DividendIncome recorded dividends: 12 months, yield on cost
    GET    /me/insights/versus          -> Versus         your money vs the dollar (inflation / deposit hidden)
    GET    /me/notes                    -> HoldingNotes   the person's private notes, newest first
    PUT    /me/notes/{ticker}           HoldingNoteInput {body 3..500} -> HoldingNotes   audit `note.saved`
    DELETE /me/notes/{ticker}           -> HoldingNotes   audit `note.cleared`

Percentages are plain percent numbers (41.3 = %41,3). Every figure is derived from the ledger, the stored closes
and stored exchange rates; a number that cannot be known honestly is null and its `*_tr` field says why. Errors are
`{detail, code}`: 404 `not_in_book` "Bu hisse defterinde yok." (a note for a share never in the book), 404 `no_note`
"Bu hisse için yazılmış bir not yok.", 422 `validation` (limit outside 5..100, note outside 3..500 characters).
Moves nothing: no endpoint here touches cash, shares or the stops.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.domain.schemas.insights import (
    Allocation,
    ClosedTrades,
    ConcentrationInput,
    DividendIncome,
    HoldingNoteInput,
    HoldingNotes,
    ReturnStats,
    Versus,
)
from kaptan.insights import allocation as alloc
from kaptan.insights import notes
from kaptan.insights.closed import closed_trades
from kaptan.insights.dividends import dividend_income
from kaptan.insights.stats import return_stats
from kaptan.insights.versus import versus as versus_doc

router = APIRouter(tags=["insights"])

Code = Annotated[str, Path(pattern=r"^[A-Z0-9]{3,6}$")]


@router.get("/me/insights/allocation", response_model=Allocation, response_model_by_alias=True)
async def get_allocation(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    out = await alloc.allocation(conn, clock.now())
    await conn.rollback()
    return out


@router.put("/me/insights/concentration", response_model=Allocation)
async def put_concentration(body: ConcentrationInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await alloc.set_threshold(conn, body.threshold_pct, actor, clock.now())


@router.get("/me/insights/closed-trades", response_model=ClosedTrades)
async def get_closed_trades(user: CurrentUser, conn: Conn) -> Any:
    out = await closed_trades(conn)
    await conn.rollback()
    return out


@router.get("/me/insights/stats", response_model=ReturnStats, response_model_by_alias=True)
async def get_stats(user: CurrentUser, conn: Conn) -> Any:
    out = await return_stats(conn)
    await conn.rollback()
    return out


@router.get("/me/insights/dividends", response_model=DividendIncome)
async def get_dividends(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    out = await dividend_income(conn, clock.now())
    await conn.rollback()
    return out


@router.get("/me/insights/versus", response_model=Versus, response_model_by_alias=True)
async def get_versus(user: CurrentUser, conn: Conn) -> Any:
    out = await versus_doc(conn)
    await conn.rollback()
    return out


@router.get("/me/notes", response_model=HoldingNotes)
async def get_notes(user: CurrentUser, conn: Conn) -> Any:
    out = await notes.list_notes(conn)
    await conn.rollback()
    return out


@router.put("/me/notes/{ticker}", response_model=HoldingNotes)
async def put_note(ticker: Code, body: HoldingNoteInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await notes.save_note(conn, ticker, body.body, actor, clock.now())


@router.delete("/me/notes/{ticker}", response_model=HoldingNotes)
async def delete_note(ticker: Code, actor: CurrentUser, conn: Conn) -> Any:
    return await notes.clear_note(conn, ticker, actor)
