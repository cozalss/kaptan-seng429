"""Your own settings behind the scenes — owner: wave-2 package C; the live-mode endpoints: M3 package A3
(backend-only, panel does not call yet).

    GET  /admin/live       -> LiveView
    POST /admin/live/arm   {action: start|confirm|disarm, reason} -> LiveView

Live arm (09 §8 K3): start (1/2), confirm (2/2, the second signature waived and audited), disarm. Arming only records
the keys: with no real broker every order stays on SimBIST.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Path, Query
from pydantic import Field

from kaptan.admin import config_view as config_svc
from kaptan.admin import restricted as restricted_svc
from kaptan.admin import universe as universe_svc
from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.brokers import config as broker_config
from kaptan.brokers import live_arm
from kaptan.db import Conn
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


class LiveSignatureOut(KModel):
    uid: str
    name: str
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


async def _live_view(conn: Any, clock: Any) -> dict[str, Any]:
    now = clock.now()
    state = await live_arm.read_state(conn)
    return live_arm.view(broker_config.current(), state, now, kill=await live_arm.kill_on(conn))


@router.get("/admin/live", response_model=LiveView)
async def live(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await _live_view(conn, clock)


@router.post("/admin/live/arm", response_model=LiveView)
async def live_arm_change(body: LiveArmInput, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
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
#   GET  /admin/restricted                           -> RestrictedView
#   POST /admin/restricted       RestrictedAddInput  -> RestrictedView   (effective at once)
#   POST /admin/restricted/{id}/removal         {reason} -> RestrictedView (1/2)
#   POST /admin/restricted/{id}/removal/confirm {reason} -> RestrictedView (2/2, waiver audited)
#   GET  /admin/universe?d=                          -> AdminUniverseView
#   PUT  /admin/universe/overrides/{ticker} UniverseOverrideInput -> AdminUniverseView
#   DELETE /admin/universe/overrides/{ticker}?reason= -> AdminUniverseView
#   GET  /admin/config                               -> AdminConfigView

TICKER_PATH: Final = r"^[A-Z0-9]{3,8}$"


@router.get("/admin/restricted", response_model=RestrictedView)
async def restricted_list(user: CurrentUser, conn: Conn) -> Any:
    return await restricted_svc.restricted_view(conn)


@router.post("/admin/restricted", response_model=RestrictedView)
async def restricted_add(body: RestrictedAddInput, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
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
    await restricted_svc.confirm_removal(
        conn,
        entry_id,
        reason=body.reason.strip(),
        uid=user.uid,
        name=user.name,
        role=user.role,
        now=clock.now(),
    )
    return await restricted_svc.restricted_view(conn)


def _today(clock: Any) -> date:
    now: datetime = clock.now()
    return now.astimezone(IST).date()


@router.get("/admin/universe", response_model=AdminUniverseView)
async def universe(user: CurrentUser, conn: Conn, clock: ClockDep, d: Annotated[date | None, Query()] = None) -> Any:
    return await universe_svc.universe_view(conn, d or _today(clock))


@router.put("/admin/universe/overrides/{ticker}", response_model=AdminUniverseView)
async def universe_override_set(
    ticker: Annotated[str, Path(pattern=TICKER_PATH)],
    body: UniverseOverrideInput,
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
) -> Any:
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
    await universe_svc.clear_override(
        conn, ticker, reason=reason.strip(), uid=user.uid, role=user.role, now=clock.now()
    )
    return await universe_svc.universe_view(conn, _today(clock))


@router.get("/admin/config", response_model=AdminConfigView)
async def admin_config(user: CurrentUser, conn: Conn, settings: SettingsDep) -> Any:
    return await config_svc.admin_config(conn, settings)
