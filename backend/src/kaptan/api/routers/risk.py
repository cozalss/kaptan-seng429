"""Risk numbers (information only).

    GET  /risk/status    -> RiskStatus

There is no stop and no automatic brake: KAPtan never halts anything because of a loss. RiskStatus only reports
the money book marked to market now (equity, peak, fall from the peak, the day's change), the market regime,
whether live mode is armed and the data quotas. The person decides.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.domain.schemas import RiskStatus
from kaptan.risk.status import risk_status

router = APIRouter(tags=["risk"])


@router.get("/risk/status", response_model=RiskStatus)
async def status(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await risk_status(conn, clock.now())
