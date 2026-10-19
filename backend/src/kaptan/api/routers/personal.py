"""The personal-money stage — M3 B3 (backend-only, API.md §5.3; 12 §1).

GET /personal/stage -> PersonalStageStatus (all roles)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.db import Conn
from kaptan.domain.schemas.personal import PersonalStageStatus
from kaptan.evalreports.stage import personal_stage
from kaptan.text.turkish import IST

router = APIRouter(tags=["personal"])


@router.get("/personal/stage", response_model=PersonalStageStatus)
async def stage(user: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    now = clock.now()
    return await personal_stage(conn, now=now, today=now.astimezone(IST).date(), is_sample=settings.demo_mode)
