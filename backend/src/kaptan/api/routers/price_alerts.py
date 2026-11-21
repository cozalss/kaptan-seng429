"""Price alerts, the alert history, the backup list and the weekly summary (agent ALERTS, wave 5).

    GET    /me/price-alerts            -> PriceAlert[]      open ones first; `current_price` null = no price yet
    POST   /me/price-alerts            PriceAlertInput -> PriceAlert[]   audited `price_alert.created`
    DELETE /me/price-alerts/{id}       -> PriceAlert[]      audited `price_alert.removed`; 404 `not_found`
    GET    /me/alerts/history          -> AlertHistoryItem[] the last 100 messages that went out (or failed) on the
                                          phone/e-mail channels: time, channel, the fixed sentence, delivered or not
    GET    /me/backup/list             -> BackupList        the backup folder with ages and the safe restore steps
    GET    /me/weekly?at=YYYY-MM-DD    -> WeeklySummary     the Monday-Sunday week containing `at` (default: now)

PriceAlertInput: `ticker`, `direction` (above | below) and exactly one of `level` (a price) or `preset_pct` (5 | 10,
turned into a level from the price KAPtan has now). 422 `validation` (neither or both), 422 `already_passed` (the
typed level is already reached), 404 `not_found` (unknown code), 409 `no_price` (a preset without any price),
409 `alerts_full` (30 open alerts). An alert fires once: the desk stream gets `price_alert` (names the company; it
stays on this computer) and the phone gets only "KAPtan: bir fiyat uyarın tetiklendi." The history never holds a
topic, an address, a ticker or an amount. The restore itself is never done here (see geri-yukle.ps1).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from kaptan.alerts.history import list_history
from kaptan.alerts.price import create_alert, list_alerts, remove_alert
from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas.price_alerts import AlertHistoryItem, BackupList, PriceAlert, PriceAlertInput, WeeklySummary
from kaptan.ops.backup_list import backup_list
from kaptan.reports.weekly import weekly

router = APIRouter(tags=["alerts"])
AlertId = Annotated[int, Path(ge=1, le=2**62)]
BAD_DAY = "Tarih bekleniyor (YYYY-MM-DD)"


@router.get("/me/price-alerts", response_model=list[PriceAlert])
async def get_price_alerts(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    out = await list_alerts(conn, clock.now())
    await conn.rollback()
    return out


@router.post("/me/price-alerts", response_model=list[PriceAlert])
async def post_price_alert(body: PriceAlertInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    await create_alert(
        conn, body.ticker, body.direction, level=body.level, preset_pct=body.preset_pct, uid=actor.uid, now=now
    )
    out = await list_alerts(conn, now)
    await conn.rollback()
    return out


@router.delete("/me/price-alerts/{alert_id}", response_model=list[PriceAlert])
async def delete_price_alert(alert_id: AlertId, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    now = clock.now()
    await remove_alert(conn, alert_id, uid=actor.uid, now=now)
    out = await list_alerts(conn, now)
    await conn.rollback()
    return out


@router.get("/me/alerts/history", response_model=list[AlertHistoryItem])
async def get_alert_history(user: CurrentUser, conn: Conn) -> Any:
    out = await list_history(conn)
    await conn.rollback()
    return out


@router.get("/me/backup/list", response_model=BackupList)
async def get_backup_list(user: CurrentUser, clock: ClockDep, settings: SettingsDep) -> Any:
    return backup_list(settings.backup_mount, settings.kaptan_backup_dir or None, clock.now())


@router.get("/me/weekly", response_model=WeeklySummary)
async def get_weekly(user: CurrentUser, conn: Conn, clock: ClockDep, at: str | None = Query(default=None)) -> Any:
    day: date | None = None
    if at is not None:
        try:
            day = date.fromisoformat(at)
        except ValueError as exc:
            raise ApiError(422, "validation", BAD_DAY) from exc
    out = await weekly(conn, day, clock.now())
    await conn.rollback()
    return out
