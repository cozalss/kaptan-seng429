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

from fastapi import APIRouter, Depends, Path, Request

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.db import Conn
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput, LimitsView
from kaptan.events.publish import publish
from kaptan.risk import limits as svc

router = APIRouter(tags=["limits"])


async def _view_after_write(request: Request, conn: Conn) -> dict[str, Any]:
    """The new LimitsView (read after the commit), published on SSE desk `limits.changed`."""
    view = await svc.limits_view(conn)
    await conn.commit()
    await publish(request.app, "desk", "limits.changed", view)
    return view


@router.get("/limits", response_model=LimitsView)
async def limits(user: CurrentUser, conn: Conn) -> Any:
    return await svc.limits_view(conn)


@router.post("/limits/proposals", response_model=LimitsView)
async def propose(
    body: LimitProposalInput,
    actor: Annotated[Actor, Depends(require("limits.propose"))],
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await svc.propose(conn, body, uid=actor.uid, name=actor.name, role=actor.role, now=clock.now())
    return await _view_after_write(request, conn)


@router.post("/limits/proposals/{version}/decision", response_model=LimitsView)
async def decide(
    version: Annotated[int, Path(gt=0)],
    body: LimitDecisionInput,
    actor: Annotated[Actor, Depends(require("limits.decide"))],
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await svc.decide(conn, version, body, uid=actor.uid, name=actor.name, role=actor.role, now=clock.now())
    return await _view_after_write(request, conn)
