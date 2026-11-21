"""The personal-money stage — M3 B3 (backend-only, API.md §5.3; 12 §1).

GET /personal/stage -> PersonalStageStatus (all roles)
GET /me/overview     -> MeOverview          (the person's own book; `needs_setup` until the starting money exists)
GET /me/money        -> MoneyBook           (cash, money put in, every movement, newest first)
POST /me/money       MoneyInput -> MoneyBook
POST /me/holdings    HoldingInput -> Position
POST /me/holdings/{position_id}/sell  HoldingSellInput -> Position | null
POST /me/suggestions/{id}/hold {"kind": "held"|"skipped", "note"?} -> SuggestionHoldOut (proposal.decide)
POST /me/money/{movement_id}/correct  MovementCorrectInput -> MoneyBook   (the amount was typed wrong)
POST /me/money/{movement_id}/undo     -> MoneyBook                        ("Bunu yanlış girdim")
GET/PUT /me/fee                       BrokerFee / BrokerFeeInput -> BrokerFee  (my broker's commission rate)
POST /me/book/reset                   BookResetInput -> BookResetOut      ("Baştan başla")
GET /me/books                         -> PreviousBook[]                   ("önceki defter", read-only)
GET /me/export.csv                    -> text/csv (UTF-8 BOM, ";" and decimal comma; streamed)

Errors are `{detail, code}` (Turkish detail):
- POST /me/money: 409 already_started "Başlangıç paranı zaten girdin. Para eklemek için 'Para ekle'yi kullan." ·
  409 not_started "Önce başlangıç paranı gir." (deposit / withdrawal first) · 422 over_cash
  "Elindeki nakitten fazlasını çekemezsin." (withdrawal above the free cash: cash minus buy tickets waiting to be
  entered) · 422 validation (amount_try must be > 0 and <= 1e10, note <= 200 characters).
  Audit `money.started` / `money.deposited` / `money.withdrawn` {amount_try}. A deposit or withdrawal is not a gain
  or a loss: the day's P&L, the peak and both stops do not move because of it (`kaptan.risk.book`).
- POST /me/holdings: 409 not_started · 422 unknown_ticker "Bu hisse kodunu tanımıyorum." · 422 future_date
  "Gelecekteki bir tarihi giremezsin.". Cash is not touched; the cost joins `capital_start`; a `holding` movement.
  Audit `holding.added` {ticker, company, qty, avg_cost}. KAPtan raises no exit for it, but it counts in equity,
  the sector / group caps and both stops. The Position has `origin` "own".
- POST /me/holdings/{position_id}/sell (position_id as in `Position.id`): 404 not_found "Pozisyon bulunamadı." ·
  409 use_ticket "Bu pozisyonu önerinin işlem fişinden sat." (a suggested position) · 422 over_qty
  "Elinde olandan fazlasını satamazsın." · 422 future_time "Gelecekteki bir zamanı giremezsin.". Cash rises by
  `qty x price - commission` (commission typed, else the cost model's estimate). Audit `holding.sold`
  {ticker, company, qty, price, commission_try, commission_estimated}. Returns null when nothing is left.

Fixing what was typed wrong (every fix is a NEW ledger row that points at the original; nothing is edited or deleted;
a deposit, a withdrawal or a correction is never a gain or a loss; the movements list keeps the row and marks it
`corrected` ("düzeltildi", with `original_amount_try`) or `undone` ("geri alındı")):
- POST /me/money/{id}/correct: start / deposit / withdrawal take `amount_try`; a hand-entered holding takes `qty` +
  `avg_cost` (+ `bought_on`). 404 not_found "Bu hareketi bulamadım." · 409 already_undone "Bunu zaten geri aldın." ·
  409 has_sales (a holding you sold from) · 422 over_cash "Bu değişiklikle boştaki nakdin eksiye düşerdi. ..." ·
  422 no_change "Bu zaten böyle yazılı." · 422 validation. Audit `money.corrected` {kind, old_amount_try,
  new_amount_try} / `holding.corrected` {ticker, company, old, new}.
- POST /me/money/{id}/undo: a reversing row. 409 cannot_undo_start (change its amount, or start over) · the
  errors above.
  Audit `money.undone` {kind, amount_try} / `holding.undone`.
- GET/PUT /me/fee: the commission rate the bank takes (a fraction, 0.002 = binde 2; BSMV comes on top). PUT
  `{commission_rate}` 0 to 0.01, null = KAPtan's built-in rate; 422 out_of_range. The commission estimate of a ticket
  fill and of a hand-entered sale uses it, and the ticket entry says which rate it used (`commission_rate`,
  `commission_rate_own`). Audit `fee.changed` {old_rate, new_rate}.
- POST /me/book/reset {confirm: "baştan"}: closes the book (open positions, P&L series and waiting tickets are kept
  as the old book's archive; waiting tickets are voided), opens an empty one: `needs_setup` again. 409 not_started ·
  422 confirm. Untouched: disclosures, KAPtan's reading, limits, the audit chain.
  Audit `book.reset`. GET /me/books lists the closed books (read-only).
- GET /me/export.csv: every ledger row of every book as `;`-separated, decimal-comma CSV with a UTF-8 BOM.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path, Request
from fastapi.responses import StreamingResponse

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.disclosures.counters import publish_counters
from kaptan.domain.schemas.money import (
    BookResetInput,
    BookResetOut,
    BrokerFee,
    BrokerFeeInput,
    HoldingInput,
    HoldingSellInput,
    MoneyBook,
    MoneyInput,
    MovementCorrectInput,
    PreviousBook,
)
from kaptan.domain.schemas.overview import MeOverview, SuggestionHoldInput, SuggestionHoldOut
from kaptan.domain.schemas.personal import PersonalStageStatus
from kaptan.domain.schemas.trading import Position
from kaptan.evalreports.stage import personal_stage
from kaptan.portfolio import export, fee, fresh_start, money
from kaptan.portfolio.overview import hold_suggestion, me_overview
from kaptan.text.turkish import IST

router = APIRouter(tags=["personal"])


@router.get("/personal/stage", response_model=PersonalStageStatus)
async def stage(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    return await personal_stage(conn, now=now, today=now.astimezone(IST).date())


@router.get("/me/overview", response_model=MeOverview)
async def overview(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    """The home in one call: the person's own book (kaptan.portfolio.overview)."""
    return await me_overview(conn, now=clock.now())


@router.get("/me/money", response_model=MoneyBook)
async def get_money(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await money.money_book(conn, clock.now())


@router.post("/me/money", response_model=MoneyBook)
async def post_money(request: Request, body: MoneyInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    outcome = await money.add_money(conn, body, actor, now=clock.now())
    if outcome.counters_changed:  # after commit: the disclosure counters' `waiting_for_money` just changed
        await publish_counters(request.app)
    return outcome.body


@router.post("/me/holdings", response_model=Position)
async def post_holding(body: HoldingInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await money.add_holding(conn, body, actor, now=clock.now())


@router.post("/me/holdings/{position_id}/sell", response_model=Position | None)
async def sell_holding(
    position_id: Annotated[str, Path(max_length=40)],
    body: HoldingSellInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    return await money.sell_holding(conn, position_id, body, actor, now=clock.now())


@router.post("/me/suggestions/{suggestion_id}/hold", response_model=SuggestionHoldOut)
async def hold(
    suggestion_id: Annotated[str, Path(max_length=120)],
    body: SuggestionHoldInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    """ "Tut" / "Geç" on a suggestion: audited, the card stays open until it expires."""
    return await hold_suggestion(
        conn,
        suggestion_id,
        kind=body.kind,
        note=body.note,
        actor=actor.audit_actor,
        role=actor.role,
        now=clock.now(),
    )


@router.post("/me/money/{movement_id}/correct", response_model=MoneyBook)
async def correct_money(
    movement_id: Annotated[str, Path(max_length=40)],
    body: MovementCorrectInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    return await money.correct_movement(conn, movement_id, body, actor, now=clock.now())


@router.post("/me/money/{movement_id}/undo", response_model=MoneyBook)
async def undo_money(
    movement_id: Annotated[str, Path(max_length=40)], actor: CurrentUser, conn: Conn, clock: ClockDep
) -> Any:
    return await money.undo_movement(conn, movement_id, actor, now=clock.now())


@router.get("/me/fee", response_model=BrokerFee)
async def get_fee(user: CurrentUser, conn: Conn) -> Any:
    return await fee.view(conn)


@router.put("/me/fee", response_model=BrokerFee)
async def put_fee(body: BrokerFeeInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await fee.set_rate(conn, body.commission_rate, actor, now=clock.now())


@router.post("/me/book/reset", response_model=BookResetOut)
async def reset_book(request: Request, body: BookResetInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    out = await fresh_start.start_over(conn, body.confirm, actor, now=clock.now())
    await publish_counters(request.app)  # after commit: `waiting_for_money` is true again
    return out


@router.get("/me/books", response_model=list[PreviousBook])
async def previous_books(user: CurrentUser, conn: Conn) -> Any:
    return await fresh_start.previous_books(conn)


@router.get("/me/export.csv")
async def export_csv(user: CurrentUser, conn: Conn, clock: ClockDep) -> StreamingResponse:
    rows = await export.records(conn)  # read first: the connection is not held while the file streams
    day = clock.now().astimezone(IST).date().isoformat()
    return StreamingResponse(
        (piece.encode("utf-8") for piece in export.csv_lines(rows)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="kayitlarim-{day}.csv"', "Cache-Control": "no-store"},
    )
