"""The personal-money stage — M3 B3 (backend-only, API.md §5.3; 12 §1).

GET /personal/stage -> PersonalStageStatus (all roles)
GET /me/overview     -> MeOverview          (all roles; the single-user dashboard)
POST /me/suggestions/{id}/hold {"kind": "held"|"skipped", "note"?} -> SuggestionHoldOut (proposal.decide)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path

from kaptan.api.deps import Actor, ClockDep, CurrentUser, SettingsDep, require
from kaptan.db import Conn
from kaptan.domain.schemas.overview import MeOverview, SuggestionHoldInput, SuggestionHoldOut
from kaptan.domain.schemas.personal import PersonalStageStatus
from kaptan.evalreports.stage import personal_stage
from kaptan.portfolio.overview import hold_suggestion, me_overview
from kaptan.text.turkish import IST

router = APIRouter(tags=["personal"])


@router.get("/personal/stage", response_model=PersonalStageStatus)
async def stage(user: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    now = clock.now()
    return await personal_stage(conn, now=now, today=now.astimezone(IST).date(), is_sample=settings.demo_mode)


@router.get("/me/overview", response_model=MeOverview)
async def overview(user: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    """The single-user dashboard in one call (kaptan.portfolio.overview; all roles)."""
    return await me_overview(
        conn,
        now=clock.now(),
        wall=clock.real_now(),
        live=not settings.demo_mode,
        prices_live=settings.prices_live,
        capital=settings.paper_capital_try,
    )


@router.post("/me/suggestions/{suggestion_id}/hold", response_model=SuggestionHoldOut)
async def hold(
    suggestion_id: Annotated[str, Path(max_length=120)],
    body: SuggestionHoldInput,
    actor: Annotated[Actor, Depends(require("proposal.decide"))],
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
