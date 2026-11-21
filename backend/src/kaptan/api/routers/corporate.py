"""Company actions on the person's shares: dividends, bonus issues, rights issues, and the KAP notices about them.

GET  /me/corporate                         -> CorporateBook (dividends this year / in all, per share, every record)
POST /me/corporate/dividends               DividendInput -> CorporateBook
POST /me/corporate/bonus                   BonusInput -> CorporateBook   (a bonus issue or a split)
POST /me/corporate/rights                  RightsInput -> CorporateBook
POST /me/corporate/{record_id}/undo        -> CorporateBook              (a correction row; nothing is deleted)
GET  /me/corporate/notices                 -> NoticeAnswer               (KAP notices about shares held now)
POST /me/corporate/notices/{id}/dismiss    -> NoticeAnswer

Errors are `{detail, code}` (Turkish detail): 409 not_started "Önce başlangıç paranı gir." · 409 not_held "Bu hisse şu
an elinde görünmüyor." (bonus, rights) · 422 never_held "Bu hisse defterinde hiç yok." (dividend) · 422 future_date
"Gelecekteki bir tarihi giremezsin." · 422 not_more "Yeni adet, şimdiki adetten büyük olmalı." · 422 over_cash
"Kasandaki paradan fazlasını ödeyemezsin." (rights) · 409 already_undone / is_undo / changed · 404 not_found.
Audit `dividend.recorded` {ticker, company, net_try, received_on}, `bonus.recorded` {ticker, company, qty_before,
qty_after, ex_date}, `rights.recorded` {ticker, company, qty, price, paid_try}, `<kind>.corrected` {ticker, company,
corrects}, `corporate.dismissed`. A dividend is income: cash and "since the start" rise by it and it is no outside
flow. A bonus or a rights issue moves no gain: the total cost stays (bonus) or grows by what was paid (rights).
A bonus takes effect at the first price of its ex-date; the stored closes from then on are written again.
KAP notices are read from the stored disclosures (no live KAP call); facts the code could not read are null and
`facts_note` says so. Nothing in the book changes without a POST above.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.domain.schemas.corporate import (
    BonusInput,
    CorporateBook,
    DividendInput,
    NoticeAnswer,
    RightsInput,
)
from kaptan.portfolio import corporate, corporate_notices

router = APIRouter(tags=["corporate"])


@router.get("/me/corporate", response_model=CorporateBook)
async def get_book(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await corporate.corporate_book(conn, clock.now())


@router.post("/me/corporate/dividends", response_model=CorporateBook)
async def post_dividend(body: DividendInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await corporate.record_dividend(conn, body, actor, now=clock.now())


@router.post("/me/corporate/bonus", response_model=CorporateBook)
async def post_bonus(body: BonusInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await corporate.record_bonus(conn, body, actor, now=clock.now())


@router.post("/me/corporate/rights", response_model=CorporateBook)
async def post_rights(body: RightsInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await corporate.record_rights(conn, body, actor, now=clock.now())


@router.get("/me/corporate/notices", response_model=NoticeAnswer)
async def get_notices(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return {"notices": await corporate_notices.notices(conn, clock.now())}


@router.post("/me/corporate/notices/{notice_id}/dismiss", response_model=NoticeAnswer)
async def dismiss_notice(
    notice_id: Annotated[str, Path(max_length=40)], actor: CurrentUser, conn: Conn, clock: ClockDep
) -> Any:
    now = clock.now()
    await corporate_notices.dismiss(conn, notice_id, actor, now=now)
    return {"notices": await corporate_notices.notices(conn, now)}


@router.post("/me/corporate/{record_id}/undo", response_model=CorporateBook)
async def undo(record_id: Annotated[str, Path(max_length=40)], actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await corporate.undo_record(conn, record_id, actor, now=clock.now())
