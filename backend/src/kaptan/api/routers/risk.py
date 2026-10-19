"""Risk and the kill switch — owner: wave-2 package B.

    GET  /risk/status                                       -> RiskStatus (all roles)
    POST /risk/kill-switch               {"reason"} (>= 5)  -> RiskStatus (kill.stop: risk_officer, admin)
    POST /risk/kill-switch/reset/request {"reason"} (>= 10) -> RiskStatus (kill.reset_start: admin, 1/2)
    POST /risk/kill-switch/reset/confirm {"reason"} (>= 10) -> RiskStatus (kill.reset_confirm: risk_officer, 2/2)

Rules (mock enterprise.ts / scenarios.ts):
- stop: 409 already_on "Zaten durduruldu."; cancels open orders (pending_open/accepted -> canceled,
  cancel_reason kill_switch); positions managed by exit rules; audit `kill_switch.on`
  {reason, role, canceled_orders}.
- request: 409 not_on "Sistem çalışıyor; yeniden başlatılacak bir şey yok." · 409 already_started
  "Yeniden başlatma zaten başlatıldı; Risk Sorumlusu’nun onayını bekliyor." · audit
  `kill_switch.reset_started` {step: 1, role, reason}.
- confirm: 409 not_on · 409 not_started "Önce Yönetici yeniden başlatmayı başlatmalı (1/2)." · 403
  same_person via ensure_second_signer(started_by, actor, "kill_reset") · drawdown floored at −0.049
  · audit `kill_switch.reset` {step: 2, role, reason, started_by}.
SSE desk `kill_switch` after each. RiskStatus derivation: mock selectors.riskStatus() + liveEquity().
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.db import Conn
from kaptan.domain.schemas import KillResetInput, KillSwitchInput, RiskStatus
from kaptan.events.publish import publish
from kaptan.risk import kill_switch as ks
from kaptan.risk.status import risk_status

router = APIRouter(tags=["risk"])


def _live(request: Request) -> bool:
    """Outside DEMO_MODE the status is the paper book marked to market (kaptan.risk.book)."""
    settings = getattr(request.app.state, "settings", None)
    return settings is not None and not settings.demo_mode


async def _status_after_write(request: Request, conn: Conn, clock: ClockDep) -> dict[str, Any]:
    """The new RiskStatus (read after the commit), published on SSE desk `kill_switch`."""
    status = await risk_status(conn, clock.now(), live=_live(request))
    await conn.commit()
    await publish(request.app, "desk", "kill_switch", status)
    return status


@router.get("/risk/status", response_model=RiskStatus)
async def status(user: CurrentUser, conn: Conn, clock: ClockDep, request: Request) -> Any:
    return await risk_status(conn, clock.now(), live=_live(request))


@router.post("/risk/kill-switch", response_model=RiskStatus)
async def kill_switch(
    body: KillSwitchInput,
    actor: Annotated[Actor, Depends(require("kill.stop"))],
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await ks.engage(conn, by=actor.audit_actor, reason=body.reason, role=actor.role, now=clock.now())
    return await _status_after_write(request, conn, clock)


@router.post("/risk/kill-switch/reset/request", response_model=RiskStatus)
async def reset_request(
    body: KillResetInput,
    actor: Annotated[Actor, Depends(require("kill.reset_start"))],
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    await ks.start_reset(conn, uid=actor.uid, name=actor.name, role=actor.role, reason=body.reason, now=clock.now())
    return await _status_after_write(request, conn, clock)


@router.post("/risk/kill-switch/reset/confirm", response_model=RiskStatus)
async def reset_confirm(
    body: KillResetInput,
    actor: Annotated[Actor, Depends(require("kill.reset_confirm"))],
    conn: Conn,
    clock: ClockDep,
    request: Request,
) -> Any:
    settings = getattr(request.app.state, "settings", None)
    personal = settings is not None and settings.kaptan_mode == "personal"
    await ks.confirm_reset(conn, uid=actor.uid, role=actor.role, reason=body.reason, now=clock.now(), personal=personal)
    return await _status_after_write(request, conn, clock)
