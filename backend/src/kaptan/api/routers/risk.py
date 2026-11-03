"""Risk and the kill switch — owner: wave-2 package B.

    GET  /risk/status                                       -> RiskStatus
    POST /risk/kill-switch               {"reason"} (>= 5)  -> RiskStatus
    POST /risk/kill-switch/reset/request {"reason"} (>= 10) -> RiskStatus (1/2)
    POST /risk/kill-switch/reset/confirm {"reason"} (>= 10) -> RiskStatus (2/2)

Rules (mock enterprise.ts / scenarios.ts; texts in risk/kill_switch.py):
- stop: 409 already_on; cancels open orders (pending_open/accepted -> canceled, cancel_reason kill_switch);
  positions managed by exit rules; audit `kill_switch.on` {reason, role, canceled_orders}.
- request: 409 not_on · 409 already_started · audit `kill_switch.reset_started` {step: 1, role, reason}.
- confirm: 409 not_on · 409 not_started · 409 conflict until RiskStatus.reset.ready_at (06 §11: ≥ 24 h after the
  request and ≥ 5 sessions after the stop) · audit
  `auth.single_user_waiver` · drawdown floored at −0.049 · audit `kill_switch.reset` {step: 2, role, reason,
  started_by}.
SSE desk `kill_switch` after each. RiskStatus derivation: mock selectors.riskStatus() + liveEquity().
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.db import Conn
from kaptan.domain.schemas import KillResetInput, KillSwitchInput, RiskStatus
from kaptan.events.publish import publish
from kaptan.risk import kill_switch as ks
from kaptan.risk.status import risk_status

router = APIRouter(tags=["risk"])


async def _status_after_write(request: Request, conn: Conn, clock: ClockDep) -> dict[str, Any]:
    """The new RiskStatus (read after the commit), published on SSE desk `kill_switch`."""
    status = await risk_status(conn, clock.now())
    await conn.commit()
    await publish(request.app, "desk", "kill_switch", status)
    return status


@router.get("/risk/status", response_model=RiskStatus)
async def status(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await risk_status(conn, clock.now())


@router.post("/risk/kill-switch", response_model=RiskStatus)
async def kill_switch(
    body: KillSwitchInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await ks.engage(conn, by=actor.audit_actor, reason=body.reason, role=actor.role, now=clock.now())
    return await _status_after_write(request, conn, clock)


@router.post("/risk/kill-switch/reset/request", response_model=RiskStatus)
async def reset_request(
    body: KillResetInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await ks.start_reset(conn, uid=actor.uid, name=actor.name, role=actor.role, reason=body.reason, now=clock.now())
    return await _status_after_write(request, conn, clock)


@router.post("/risk/kill-switch/reset/confirm", response_model=RiskStatus)
async def reset_confirm(
    body: KillResetInput,
    actor: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await ks.confirm_reset(conn, uid=actor.uid, role=actor.role, reason=body.reason, now=clock.now())
    return await _status_after_write(request, conn, clock)
