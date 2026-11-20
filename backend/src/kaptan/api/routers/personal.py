"""The personal-money stage — M3 B3 (backend-only, API.md §5.3; 12 §1).

GET /personal/stage -> PersonalStageStatus (all roles)
GET /me/overview     -> MeOverview          (the person's own book; `needs_setup` until the starting money exists)
GET /me/money        -> MoneyBook           (cash, money put in, every movement, newest first)
POST /me/money       MoneyInput -> MoneyBook
POST /me/holdings    HoldingInput -> Position
POST /me/holdings/{position_id}/sell  HoldingSellInput -> Position | null
POST /me/suggestions/{id}/hold {"kind": "held"|"skipped", "note"?} -> SuggestionHoldOut (proposal.decide)

Errors are `{detail, code}` (Turkish detail):
- POST /me/money: 409 already_started "Başlangıç paranı zaten girdin. Para eklemek için 'Para ekle'yi kullan." ·
  409 not_started "Önce başlangıç paranı gir." (deposit / withdrawal first) · 422 over_cash
  "Kasandaki paradan fazlasını çekemezsin." (withdrawal above the free cash: cash minus buy tickets waiting to be
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
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path, Request

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.disclosures.counters import publish_counters
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput, MoneyBook, MoneyInput
from kaptan.domain.schemas.overview import MeOverview, SuggestionHoldInput, SuggestionHoldOut
from kaptan.domain.schemas.personal import PersonalStageStatus
from kaptan.domain.schemas.trading import Position
from kaptan.evalreports.stage import personal_stage
from kaptan.portfolio import money
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
