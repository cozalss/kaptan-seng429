"""Telegram, as the Ayarlar section sees it (kaptan.telegram). Outbound-only: no inbound port.

    GET    /me/telegram         -> TelegramStatus  {configured, token_from_env, bot_username, paired, pairing_open,
                                   pairing_expires_at, level less|normal|more, daily_cap, silent_until, last_sent_at}
    PUT    /me/telegram         TelegramInput {token?, level?, daily_cap?} -> TelegramStatus   audit `telegram.changed`
    POST   /me/telegram/pair    -> TelegramPair {pair_link, expires_at}   audit `telegram.pairing_started`
    DELETE /me/telegram         -> TelegramStatus   audit `telegram.unlinked` (token, chat and code are forgotten)
    POST   /me/telegram/sample  -> TelegramStatus   one clearly-marked example message to the paired chat (one a
                                   minute, 429 `rate_limited`)

Bulut takibi (CLOUD_WATCHER_URL + CLOUD_SYNC_SECRET set): the status also says `cloud_on`, `cloud_synced_at` (the last
time this computer told the Cloudflare Worker its tickers), `cloud_message_at` (the Worker's last message to the
phone), `cloud_kap` (ok | blocked | error | unknown: whether the Worker can reach KAP) and `cloud_error` (the last
sync failed). `pair`, `unlink` and a changed level or cap are told to the Worker at once. No secret and no URL is
ever returned.

The token is checked with Telegram's `getMe` and kept server-side; it is never returned, logged or put in an error.
`token` is refused with 409 `conflict` when the install (.env `ALERT_TELEGRAM_BOT_TOKEN`) already gives one; a wrong
token is 422 `validation` with a plain sentence. `pair` makes a one-time code (15 minutes, only its hash is stored) and
returns `https://t.me/<bot>?start=<code>`; the poller pairs the first chat that sends `/start <code>`, and listens to
no other chat afterwards. `level` is "Daha az / Normal / Daha çok". `daily_cap` 1..50 instant messages a day (default
8); the rest go to the morning message. 409 `conflict` when a step comes before the one it needs (no token, no phone).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.api.errors import ApiError
from kaptan.cloud.sync import sync_once
from kaptan.db import Conn
from kaptan.domain.schemas.telegram import TelegramInput, TelegramPair, TelegramStatus
from kaptan.settings import cloud_watcher_on
from kaptan.telegram import service

router = APIRouter(tags=["telegram"])

SAMPLE_KEY = "kaptan:telegram:sample"
SAMPLE_LIMITED = "Bu mesaj en fazla dakikada bir gönderilir. Biraz sonra yeniden dene."


async def _status(conn: Conn, settings: Any, clock: Any, redis: Any = None) -> dict[str, Any]:
    out = await service.status(conn, settings, clock.now(), redis)
    await conn.rollback()
    return out


async def _tell_cloud(request: Request, settings: Any, clock: Any, *, unlink: bool = False) -> None:
    """With the cloud watcher on, a change here reaches the Worker now instead of at the next 10-minute sync."""
    if cloud_watcher_on(settings):
        await sync_once(settings, request.app.state.pool, request.app.state.redis, clock.now(), unlink=unlink)


@router.get("/me/telegram", response_model=TelegramStatus)
async def get_telegram(user: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep) -> Any:
    return await _status(conn, settings, clock, request.app.state.redis)


@router.put("/me/telegram", response_model=TelegramStatus)
async def put_telegram(
    body: TelegramInput, actor: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep
) -> Any:
    await service.save(
        conn, settings, actor.uid, clock.now(), token=body.token, level=body.level, daily_cap=body.daily_cap
    )
    await conn.commit()
    await _tell_cloud(request, settings, clock)
    return await _status(conn, settings, clock, request.app.state.redis)


@router.post("/me/telegram/pair", response_model=TelegramPair)
async def pair_telegram(
    actor: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep
) -> Any:
    out = await service.start_pairing(conn, settings, actor.uid, clock.now())
    await conn.commit()  # the Worker is told the code's hash at once, so the link works within seconds
    await _tell_cloud(request, settings, clock)
    return out


@router.delete("/me/telegram", response_model=TelegramStatus)
async def unlink_telegram(
    actor: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep
) -> Any:
    await service.remove(conn, actor.uid, clock.now())
    await conn.commit()
    await _tell_cloud(request, settings, clock, unlink=True)
    return await _status(conn, settings, clock, request.app.state.redis)


@router.post("/me/telegram/sample", response_model=TelegramStatus)
async def sample_telegram(
    user: CurrentUser, request: Request, conn: Conn, settings: SettingsDep, clock: ClockDep
) -> Any:
    if not await request.app.state.redis.set(SAMPLE_KEY, "1", nx=True, ex=60):
        raise ApiError(429, "rate_limited", SAMPLE_LIMITED)
    await service.send_sample(conn, request.app.state.pool, settings, clock.now())
    return await _status(conn, settings, clock, request.app.state.redis)
