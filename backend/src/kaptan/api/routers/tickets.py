"""Order tickets (emir fişi) — owner: wave-2 package A.

    GET  /tickets                                   -> OrderTicket[]  (all roles; newest first)
    POST /tickets/{ticket_no}/mark  TicketMarkInput -> OrderTicket    (ticket.mark = risk_officer)
    POST /tickets/{ticket_no}/correct TicketCorrectInput -> OrderTicket (fix a recorded fill)

Rules (mock-api.ts markTicket): 404 not_found "İşlem bulunamadı." · 409 already_marked "Bunu zaten
işaretledin." (only awaiting/expired may be marked) · entered: 422 over_qty "Gerçekleşen adet, işlemdeki
adetten büyük olamaz." · 422 over_limit "Ortalama fiyat, yazdığın en yüksek fiyatı aşamaz." · 422
after_ttl "Süresi dolduktan sonra girilen işlem sayılmaz." An unmarked ticket past
valid_until reads as `expired`. Audit `ticket.<mark>` ({qty, price} for entered);
SSE desk `ticket`; an entered ticket becomes a `personal` position.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Request

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.approvals import service
from kaptan.approvals.reads import list_tickets as read_tickets
from kaptan.db import Conn
from kaptan.domain.schemas import OrderTicket, TicketCorrectInput, TicketMarkInput
from kaptan.events.publish import publish

router = APIRouter(tags=["tickets"])


@router.get("/tickets", response_model=list[OrderTicket])
async def list_tickets(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await read_tickets(conn, now=clock.now())


@router.post("/tickets/{ticket_no}/mark", response_model=OrderTicket)
async def mark_ticket(
    request: Request,
    ticket_no: str,
    body: Annotated[TicketMarkInput, Body()],
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    outcome = await service.mark_ticket(conn, ticket_no, body, actor, now=clock.now())
    for event, data in outcome.events:  # after commit
        await publish(request.app, "desk", event, data)
    return outcome.body


@router.post("/tickets/{ticket_no}/correct", response_model=OrderTicket)
async def correct_ticket(
    request: Request,
    ticket_no: str,
    body: Annotated[TicketCorrectInput, Body()],
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    """Fix the fill recorded on an entered ticket (wrong adet, price or commission typed). The ticket's own rules
    hold (adet within the ticket, buy price at most the limit, sell price at least the floor). A correction row
    changes the book; the old numbers stay in the history. Commission left out: estimated again (and says so).
    Errors `{detail, code}`: 404 not_found "İşlem bulunamadı." · 409 not_entered "Önce işlemi girdim diye
    işaretlemelisin." · 409 not_recorded · 409 sold_since "Bu alımdan sonra satış kaydettin; adedi artık
    değiştiremezsin..." · 422 over_qty / over_limit / under_limit · 422 sell_qty "Satışta adedi değiştiremezsin; ..."
    · 422 no_change "Bu zaten böyle yazılı." · 422 over_cash. Audit `ticket.corrected` {side, old, new}."""
    outcome = await service.correct_fill(conn, ticket_no, body, actor, now=clock.now())
    for event, data in outcome.events:  # after commit
        await publish(request.app, "desk", event, data)
    return outcome.body
