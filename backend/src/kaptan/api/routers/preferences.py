"""Personal settings: Tatil modu, alert preferences and quiet hours, and the backup box (agent COMFORT).

    GET  /me/preferences          -> Preferences {pause {active, until, since}, alerts {kinds, quiet}}
    PUT  /me/alerts/preferences   AlertPrefs -> Preferences        audit `preferences.alerts_changed`
    POST /me/pause                {days} | {until: "YYYY-MM-DD"} -> Preferences   audit `preferences.paused`
    POST /me/pause/resume         -> Preferences                  audit `preferences.resumed` (nothing if not paused)
    GET  /me/backup               -> BackupStatus {state idle|waiting|running, last_at, last_ok, requested_at,
                                      folder, message_tr}
    POST /me/backup/run           -> BackupStatus                 audit `backup.requested`; 3 a minute (429)

Ayarları sıfırla (`POST /me/settings/reset`, one transaction, one audit row `settings.reset`): the alert kinds, quiet
hours and mute list go back to the defaults (`ops.preferences.alerts` = NULL), a running pause ends, and the Telegram
Daha az / Normal / Daha çok level and daily limit go back to normal / 8. It never unpairs Telegram and never touches
money, holdings, loss limits, the password, history or backups. It answers `{preferences, telegram}`, the new state.

Pause: `days` 1..90 counts from now; `until` is the first day KAPtan works again (00:00 Istanbul), in the future
and at most 90 days away (422 `validation`, Turkish detail). While it lasts disclosures are read and stored, the
agent feed starts no run (deferral reason `paused`), nothing spends quota and no suggestion appears; stops and
exits never wait for it. Quiet hours are Istanbul time; the full stop always goes out at once. A new pause
replaces the running one. Preferences is the only document: the quiet hours' two clock times are "HH:MM".
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from kaptan.alerts.prefs import load_prefs, save_prefs
from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.cloud.sync import sync_once
from kaptan.db import Conn
from kaptan.domain.schemas.preferences import AlertPrefs, BackupStatus, PauseInput, Preferences
from kaptan.domain.schemas.telegram import SettingsReset
from kaptan.ops import pause as pause_svc
from kaptan.ops.backup_request import backup_status, request_backup
from kaptan.ops.http import app_limiter
from kaptan.settings import cloud_watcher_on
from kaptan.telegram import service as telegram_svc
from kaptan.telegram import store as telegram_store

router = APIRouter(tags=["preferences"])

BACKUP_PER_MINUTE = 3
BACKUP_LIMITED = "Çok sık yedek istedin. Bir dakika sonra yeniden dene."


async def _preferences(conn: Conn, now: Any) -> dict[str, Any]:
    doc = {"pause": await pause_svc.pause_doc(conn, now), "alerts": await load_prefs(conn)}
    await conn.rollback()
    return doc


@router.get("/me/preferences", response_model=Preferences)
async def get_preferences(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await _preferences(conn, clock.now())


@router.put("/me/alerts/preferences", response_model=Preferences)
async def put_alert_preferences(body: AlertPrefs, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    async with conn.transaction():
        await save_prefs(conn, body.model_dump(mode="json"), now)
        await append(
            conn,
            [
                AuditDraft(
                    user_actor(actor.uid),
                    "preferences.alerts_changed",
                    "preferences",
                    "alerts",
                    {"quiet_hours": body.quiet.on},
                )
            ],
        )
    return await _preferences(conn, now)


@router.post("/me/pause", response_model=Preferences)
async def start_pause(body: PauseInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    try:
        end = pause_svc.end_of_pause(now, days=body.days, until=body.until)
    except pause_svc.PauseError as exc:
        raise ApiError(422, "validation", str(exc)) from exc
    async with conn.transaction():
        await pause_svc.start_pause(conn, now, end)
        await append(
            conn,
            [
                AuditDraft(
                    user_actor(actor.uid), "preferences.paused", "preferences", "pause", {"until": end.isoformat()}
                )
            ],
        )
    return await _preferences(conn, now)


@router.post("/me/pause/resume", response_model=Preferences)
async def resume_pause(actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    async with conn.transaction():
        if await pause_svc.end_pause(conn, now):
            await append(conn, [AuditDraft(user_actor(actor.uid), "preferences.resumed", "preferences", "pause")])
    return await _preferences(conn, now)


@router.get("/me/backup", response_model=BackupStatus)
async def get_backup(user: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    doc = await backup_status(conn, clock.now(), settings.kaptan_backup_dir or None)
    await conn.rollback()
    return doc


@router.post("/me/backup/run", response_model=BackupStatus)
async def run_backup(request: Request, actor: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    if not await app_limiter(request.app, "backup_run", BACKUP_PER_MINUTE).hit(actor.uid):
        raise ApiError(429, "rate_limited", BACKUP_LIMITED)
    now = clock.now()
    async with conn.transaction():
        asked = await request_backup(conn, now)
        if asked:
            await append(conn, [AuditDraft(user_actor(actor.uid), "backup.requested", "backup", "now")])
    return await backup_status(conn, now, settings.kaptan_backup_dir or None)


@router.post("/me/settings/reset", response_model=SettingsReset)
async def reset_settings(
    actor: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep
) -> Any:
    now = clock.now()
    async with conn.transaction():
        await telegram_store.get_state(conn)  # makes sure the one row exists
        await conn.execute("UPDATE ops.preferences SET alerts = NULL, updated_at = %s WHERE id = 1", (now,))
        await pause_svc.end_pause(conn, now)
        await telegram_store.update(conn, now, level="normal", daily_cap=telegram_store.DEFAULT_CAP)
        await append(conn, [AuditDraft(user_actor(actor.uid), "settings.reset", "settings", "all")])
    if cloud_watcher_on(settings):
        await sync_once(settings, request.app.state.pool, request.app.state.redis, now)
    prefs = await _preferences(conn, now)
    status = await telegram_svc.status(conn, settings, now, request.app.state.redis)
    await conn.rollback()
    return {"preferences": prefs, "telegram": status}
