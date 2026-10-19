"""Admin — owner: wave-2 package C; the live-mode endpoints: M3 package A3 (backend-only, panel does not call yet).

    GET  /admin/users      -> TeamMember[]   (users.view: admin, auditor)
    GET  /admin/live       -> LiveView       (admin, risk_officer, auditor)
    POST /admin/live/arm   {action: start|confirm|disarm, reason} -> LiveView

The team from auth.users in TEAM order (uye-1, uye-2, uye-3, uye-4, denetci): {uid, name, role, duty_tr}.
Live arm (09 §8 K3): the Yönetici starts (1/2), the Risk Sorumlusu confirms (2/2, another person);
either may disarm. Arming only records the keys: with no real broker every order stays on SimBIST.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Depends, Path, Query
from pydantic import Field

from kaptan.admin import config_view as config_svc
from kaptan.admin import restricted as restricted_svc
from kaptan.admin import universe as universe_svc
from kaptan.api.deps import Actor, ClockDep, CurrentUser, SettingsDep, require
from kaptan.api.errors import ApiError
from kaptan.brokers import config as broker_config
from kaptan.brokers import live_arm
from kaptan.db import Conn
from kaptan.domain.roles import Role
from kaptan.domain.schemas import TeamMemberOut
from kaptan.domain.schemas._base import KModel
from kaptan.domain.schemas.admin import (
    AdminConfigView,
    AdminUniverseView,
    RestrictedAddInput,
    RestrictedReasonInput,
    RestrictedView,
    UniverseOverrideInput,
)
from kaptan.text.turkish import IST

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


# ── Admin management (M3 B3, FR-34, 04 §11; backend-only, API.md §5.3) ──────────────────────────
#
#   GET  /admin/restricted                           -> RestrictedView   (admin, risk_officer, auditor)
#   POST /admin/restricted       RestrictedAddInput  -> RestrictedView   (admin; effective at once)
#   POST /admin/restricted/{id}/removal         {reason} -> RestrictedView (admin, 1/2)
#   POST /admin/restricted/{id}/removal/confirm {reason} -> RestrictedView (risk_officer, 2/2, another person)
#   GET  /admin/universe?d=                          -> AdminUniverseView (admin, auditor)
#   PUT  /admin/universe/overrides/{ticker} UniverseOverrideInput -> AdminUniverseView (admin)
#   DELETE /admin/universe/overrides/{ticker}?reason= -> AdminUniverseView (admin)
#   GET  /admin/config                               -> AdminConfigView  (admin, auditor)

RESTRICTED_READERS: Final[frozenset[Role]] = frozenset({"admin", "risk_officer", "auditor"})
ADMIN_READERS: Final[frozenset[Role]] = frozenset({"admin", "auditor"})
ADMIN_ONLY: Final = "Bunu Yönetici yapar."
RISK_ONLY: Final = "Bunu Risk Sorumlusu yapar."
ADMIN_READ_DENIED: Final = "Bunu Yönetici ya da Denetçi görür."
TICKER_PATH: Final = r"^[A-Z0-9]{3,8}$"


def _only(user: Any, roles: frozenset[Role], text: str) -> None:
    if user.role not in roles:
        raise ApiError(403, "forbidden", text)


@router.get("/admin/restricted", response_model=RestrictedView)
async def restricted_list(user: CurrentUser, conn: Conn) -> Any:
    _only(user, RESTRICTED_READERS, READ_DENIED)
    return await restricted_svc.restricted_view(conn)


@router.post("/admin/restricted", response_model=RestrictedView)
async def restricted_add(body: RestrictedAddInput, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    _only(user, frozenset({"admin"}), ADMIN_ONLY)
    await restricted_svc.add_entry(
        conn,
        ticker=body.ticker,
        kind=body.kind,
        source_ref=body.source_ref,
        reason=body.reason.strip(),
        uid=user.uid,
        name=user.name,
        role=user.role,
        now=clock.now(),
    )
    return await restricted_svc.restricted_view(conn)


@router.post("/admin/restricted/{entry_id}/removal", response_model=RestrictedView)
async def restricted_remove_request(
    entry_id: Annotated[str, Path(max_length=64)],
    body: RestrictedReasonInput,
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    _only(user, frozenset({"admin"}), ADMIN_ONLY)
    await restricted_svc.request_removal(
        conn, entry_id, reason=body.reason.strip(), uid=user.uid, name=user.name, role=user.role, now=clock.now()
    )
    return await restricted_svc.restricted_view(conn)


@router.post("/admin/restricted/{entry_id}/removal/confirm", response_model=RestrictedView)
async def restricted_remove_confirm(
    entry_id: Annotated[str, Path(max_length=64)],
    body: RestrictedReasonInput,
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    _only(user, frozenset({"risk_officer"}), RISK_ONLY)
    await restricted_svc.confirm_removal(
        conn, entry_id, reason=body.reason.strip(), uid=user.uid, name=user.name, role=user.role, now=clock.now()
    )
    return await restricted_svc.restricted_view(conn)


def _today(clock: Any) -> date:
    now: datetime = clock.now()
    return now.astimezone(IST).date()


@router.get("/admin/universe", response_model=AdminUniverseView)
async def universe(user: CurrentUser, conn: Conn, clock: ClockDep, d: Annotated[date | None, Query()] = None) -> Any:
    _only(user, ADMIN_READERS, ADMIN_READ_DENIED)
    return await universe_svc.universe_view(conn, d or _today(clock))


@router.put("/admin/universe/overrides/{ticker}", response_model=AdminUniverseView)
async def universe_override_set(
    ticker: Annotated[str, Path(pattern=TICKER_PATH)],
    body: UniverseOverrideInput,
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    _only(user, frozenset({"admin"}), ADMIN_ONLY)
    now = clock.now()
    await universe_svc.set_override(
        conn, ticker, body.mode, reason=body.reason.strip(), uid=user.uid, role=user.role, now=now
    )
    return await universe_svc.universe_view(conn, _today(clock))


@router.delete("/admin/universe/overrides/{ticker}", response_model=AdminUniverseView)
async def universe_override_clear(
    ticker: Annotated[str, Path(pattern=TICKER_PATH)],
    reason: Annotated[str, Query(min_length=10, max_length=500)],
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
    _only(user, frozenset({"admin"}), ADMIN_ONLY)
    await universe_svc.clear_override(
        conn, ticker, reason=reason.strip(), uid=user.uid, role=user.role, now=clock.now()
    )
    return await universe_svc.universe_view(conn, _today(clock))


@router.get("/admin/config", response_model=AdminConfigView)
async def admin_config(user: CurrentUser, conn: Conn, settings: SettingsDep) -> Any:
    _only(user, ADMIN_READERS, ADMIN_READ_DENIED)
    return await config_svc.admin_config(conn, settings)
