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

from fastapi import APIRouter, Depends

from kaptan.api.deps import Actor, CurrentUser, require
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import KillResetInput, KillSwitchInput, RiskStatus

router = APIRouter(tags=["risk"])


@router.get("/risk/status", response_model=RiskStatus)
async def status(user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /risk/status")


@router.post("/risk/kill-switch", response_model=RiskStatus)
async def kill_switch(body: KillSwitchInput, actor: Annotated[Actor, Depends(require("kill.stop"))], conn: Conn) -> Any:
    raise not_implemented("POST /risk/kill-switch")


@router.post("/risk/kill-switch/reset/request", response_model=RiskStatus)
async def reset_request(
    body: KillResetInput, actor: Annotated[Actor, Depends(require("kill.reset_start"))], conn: Conn
) -> Any:
    raise not_implemented("POST /risk/kill-switch/reset/request")


@router.post("/risk/kill-switch/reset/confirm", response_model=RiskStatus)
async def reset_confirm(
    body: KillResetInput, actor: Annotated[Actor, Depends(require("kill.reset_confirm"))], conn: Conn
) -> Any:
    raise not_implemented("POST /risk/kill-switch/reset/confirm")
