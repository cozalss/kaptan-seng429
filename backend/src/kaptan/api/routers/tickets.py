"""Order tickets (emir fişi) — owner: wave-2 package A.

    GET  /tickets                                   -> OrderTicket[]  (all roles; newest first)
    POST /tickets/{ticket_no}/mark  TicketMarkInput -> OrderTicket    (ticket.mark = risk_officer)

Rules (mock-api.ts markTicket): 404 not_found "Fiş bulunamadı." · 409 already_marked "Bu fiş zaten
işaretlendi." (only awaiting/expired may be marked) · entered: 422 over_qty "Gerçekleşen adet fişteki
adetten büyük olamaz." · 422 over_limit "Limit emirde ortalama fiyat limit fiyatı aşamaz." · 422
after_ttl "Fişin geçerlilik süresinden sonra girilen emir sayılmaz (R16)." An unmarked ticket past
valid_until reads as `expired` (demo clock). Audit `ticket.<mark>` ({qty, price} for entered);
SSE desk `ticket`; an entered ticket becomes a `personal` position.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Request

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.approvals import service
from kaptan.approvals.reads import list_tickets as read_tickets
from kaptan.db import Conn
from kaptan.domain.schemas import OrderTicket, TicketMarkInput
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
    actor: Annotated[Actor, Depends(require("ticket.mark"))],
    conn: Conn,
    clock: ClockDep,
) -> Any:
    outcome = await service.mark_ticket(conn, ticket_no, body, actor, now=clock.now())
    for event, data in outcome.events:  # after commit
        await publish(request.app, "desk", event, data)
    return outcome.body
