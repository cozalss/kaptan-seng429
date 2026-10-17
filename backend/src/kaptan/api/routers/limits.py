"""Limits with two signatures — owner: wave-2 package B.

    GET  /limits                                                 -> LimitsView (all roles)
    POST /limits/proposals                    LimitProposalInput -> LimitsView (limits.propose: admin, 1/2)
    POST /limits/proposals/{version}/decision LimitDecisionInput -> LimitsView (limits.decide: risk_officer, 2/2)

LimitsView = {active, pending (status proposed) | null, history (newest first, proposed excluded)}.
Propose (mock enterprise.ts): 409 pending_exists "İkinci imzayı bekleyen bir değişiklik zaten var." ·
422 no_change "Yeni değer şimdikiyle aynı." · 422 looser = first of limit_violations() · version =
max+1; values = the active values with the one key changed · audit `limits.proposed`
{key, from, to, role}. Decide: 409 conflict "Bu değişiklik artık imza beklemiyor." · 403 same_person
via ensure_second_signer(proposed_by.uid, actor, "limits") · approve: new active, old active
superseded, effective_from = now · audit `limits.approved|limits.rejected` {proposed_by, role}.
SSE desk `limits.changed` after each.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path

from kaptan.api.deps import Actor, CurrentUser, require
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput, LimitsView

router = APIRouter(tags=["limits"])


@router.get("/limits", response_model=LimitsView)
async def limits(user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /limits")


@router.post("/limits/proposals", response_model=LimitsView)
async def propose(
    body: LimitProposalInput, actor: Annotated[Actor, Depends(require("limits.propose"))], conn: Conn
) -> Any:
    raise not_implemented("POST /limits/proposals")


@router.post("/limits/proposals/{version}/decision", response_model=LimitsView)
async def decide(
    version: Annotated[int, Path(gt=0)],
    body: LimitDecisionInput,
    actor: Annotated[Actor, Depends(require("limits.decide"))],
    conn: Conn,
) -> Any:
    raise not_implemented("POST /limits/proposals/{version}/decision")
