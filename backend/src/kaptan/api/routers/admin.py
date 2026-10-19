"""Admin — owner: wave-2 package C; the live-mode endpoints: M3 package A3 (backend-only, panel does not call yet).

    GET  /admin/users      -> TeamMember[]   (users.view: admin, auditor)
    GET  /admin/live       -> LiveView       (admin, risk_officer, auditor)
    POST /admin/live/arm   {action: start|confirm|disarm, reason} -> LiveView

The team from auth.users in TEAM order (uye-1, uye-2, uye-3, uye-4, denetci): {uid, name, role, duty_tr}.
Live arm (09 §8 K3): the Yönetici starts (1/2), the Risk Sorumlusu confirms (2/2, another person);
either may disarm. Arming only records the keys: with no real broker every order stays on SimBIST.
"""

from __future__ import annotations

from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Depends
from pydantic import Field

from kaptan.api.deps import Actor, ClockDep, CurrentUser, require
from kaptan.api.errors import ApiError
from kaptan.brokers import config as broker_config
from kaptan.brokers import live_arm
from kaptan.db import Conn
from kaptan.domain.roles import Role
from kaptan.domain.schemas import TeamMemberOut
from kaptan.domain.schemas._base import KModel

router = APIRouter(tags=["admin"])

USERS_SQL: Final = "SELECT uid, display_name AS name, role, duty_tr FROM auth.users WHERE is_active ORDER BY ord, uid"

LIVE_READERS: Final[frozenset[Role]] = frozenset({"admin", "risk_officer", "auditor"})
ARM_ROLES: Final[dict[str, frozenset[Role]]] = {
    "start": frozenset({"admin"}),
    "confirm": frozenset({"risk_officer"}),
    "disarm": frozenset({"admin", "risk_officer"}),
}
ARM_DENIED: Final[dict[str, str]] = {
    "start": "Bunu Yönetici yapar.",
    "confirm": "Bunu Risk Sorumlusu yapar.",
    "disarm": "Bunu Risk Sorumlusu ya da Yönetici yapar.",
}
READ_DENIED: Final = "Bunu Risk Sorumlusu, Yönetici ya da Denetçi görür."


class LiveSignatureOut(KModel):
    uid: str
    name: str
    role: Role
    at: str
    reason: str | None


class LiveView(KModel):
    """LiveArmState (config_live, env_enabled, ui_key, armed, expires_at) + the arm's signatures and blockers."""

    config_live: bool
    env_enabled: bool
    ui_key: bool
    armed: bool
    expires_at: str | None
    started: LiveSignatureOut | None
    armed_by: LiveSignatureOut | None
    missing: list[str]
    real_broker: bool
    effective_mode: Literal["paper", "live"]


class LiveArmInput(KModel):
    action: Literal["start", "confirm", "disarm"]
    reason: str = Field(min_length=10, max_length=500)


@router.get("/admin/users", response_model=list[TeamMemberOut])
async def users(actor: Annotated[Actor, Depends(require("users.view"))], conn: Conn) -> Any:
    async with conn.cursor() as cur:
        await cur.execute(USERS_SQL)
        return [dict(r) for r in await cur.fetchall()]


async def _live_view(conn: Any, clock: Any) -> dict[str, Any]:
    now = clock.now()
    state = await live_arm.read_state(conn)
    return live_arm.view(broker_config.current(), state, now, kill=await live_arm.kill_on(conn))


@router.get("/admin/live", response_model=LiveView)
async def live(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    if user.role not in LIVE_READERS:
        raise ApiError(403, "forbidden", READ_DENIED)
    return await _live_view(conn, clock)


@router.post("/admin/live/arm", response_model=LiveView)
async def live_arm_change(body: LiveArmInput, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    if user.role not in ARM_ROLES[body.action]:
        raise ApiError(403, "forbidden", ARM_DENIED[body.action])
    await live_arm.change(
        conn,
        broker_config.current(),
        body.action,
        uid=user.uid,
        name=user.name,
        role=user.role,
        reason=body.reason.strip(),
        now=clock.now(),
    )
    return await _live_view(conn, clock)
