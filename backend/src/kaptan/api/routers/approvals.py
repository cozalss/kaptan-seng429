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

from fastapi import APIRouter, Depends

from kaptan.api.deps import Actor, CurrentUser, require
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import ApprovalCard, ApprovalDecision, NoteInput, ProposalNote

router = APIRouter(tags=["approvals"])


@router.get("/approvals", response_model=list[ApprovalCard])
async def list_approvals(user: CurrentUser, conn: Conn, status: Literal["pending", "all"] = "pending") -> Any:
    raise not_implemented("GET /approvals")


@router.post("/approvals/{proposal_id}/decision", response_model=ApprovalCard)
async def decide(
    proposal_id: str,
    body: ApprovalDecision,
    actor: Annotated[Actor, Depends(require("proposal.decide"))],
    conn: Conn,
) -> Any:
    raise not_implemented("POST /approvals/{proposal_id}/decision")


@router.get("/approvals/{proposal_id}/notes", response_model=list[ProposalNote])
async def list_notes(proposal_id: str, user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /approvals/{proposal_id}/notes")


@router.post("/approvals/{proposal_id}/notes", response_model=ProposalNote)
async def add_note(
    proposal_id: str,
    body: NoteInput,
    actor: Annotated[Actor, Depends(require("proposal.note"))],
    conn: Conn,
) -> Any:
    raise not_implemented("POST /approvals/{proposal_id}/notes")
