"""Approvals and notes — owner: wave-2 package A.

    GET  /approvals?status=pending|all              -> ApprovalCard[]   (all roles; newest first; no run-hist-*)
    POST /approvals/{proposal_id}/decision          -> ApprovalCard     (proposal.decide = risk_officer)
    GET  /approvals/{proposal_id}/notes             -> ProposalNote[]   (all roles)
    POST /approvals/{proposal_id}/notes  {"body"}   -> ProposalNote     (proposal.note)

Decision rules (mock-api.ts decideApproval): 404 not_found "Öneri bulunamadı." · 409 kill_switch
"Her şey durduruldu: yeni emir onaylanamaz." · 409 conflict "Bu öneri zaten karara bağlandı ya da
süresi doldu." · 422 grow_not_allowed "Tutar yalnızca küçültülebilir; büyütme yok." · 409 halted
"Günlük −%1 durdurması: bugün yeni emir verilemez." (approve only). Effective status: pending + kill
switch on -> cancelled; pending past expires_at (demo clock) -> expired. Audit `approval.decided`
{ticker, company, decision, role, note: bool}; SSE desk `approval.decided`; on approve -> execute
(order + fill + ticket, see PLAN.md package A/B). Notes: 404 "Öneri bulunamadı."; id "not-<n>";
audit `note.added` {ticker, company, role}.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.approvals import service
from kaptan.approvals.execute import schedule_fill
from kaptan.approvals.reads import list_cards
from kaptan.db import Conn
from kaptan.domain.schemas import ApprovalCard, ApprovalDecision, NoteInput, ProposalNote
from kaptan.events.publish import publish

router = APIRouter(tags=["approvals"])


@router.get("/approvals", response_model=list[ApprovalCard])
async def list_approvals(
    user: CurrentUser, conn: Conn, clock: ClockDep, status: Literal["pending", "all"] = "pending"
) -> Any:
    cards = await list_cards(conn, now=clock.now(), wall=clock.real_now())
    cards = [c for c in cards if not c["run_id"].startswith("run-hist")]
    return cards if status == "all" else [c for c in cards if c["status"] == status]


@router.post("/approvals/{proposal_id}/decision", response_model=ApprovalCard)
async def decide(
    request: Request,
    proposal_id: str,
    body: ApprovalDecision,
    actor: Annotated[Actor, Depends(require("proposal.decide"))],
    conn: Conn,
    clock: ClockDep,
) -> Any:
    outcome = await service.decide(conn, proposal_id, body, actor, now=clock.now(), wall=clock.real_now())
    for event, data in outcome.events:  # after commit
        await publish(request.app, "desk", event, data)
    if outcome.fill is not None:
        schedule_fill(request.app, outcome.fill)
    return outcome.body


@router.get("/approvals/{proposal_id}/notes", response_model=list[ProposalNote])
async def list_notes(proposal_id: str, user: CurrentUser, conn: Conn) -> Any:
    return await service.list_notes(conn, proposal_id)


@router.post("/approvals/{proposal_id}/notes", response_model=ProposalNote)
async def add_note(
    proposal_id: str,
    body: NoteInput,
    actor: Annotated[Actor, Depends(require("proposal.note"))],
    conn: Conn,
    clock: ClockDep,
) -> Any:
    return await service.add_note(conn, proposal_id, body.body, actor, now=clock.now(), wall=clock.real_now())
