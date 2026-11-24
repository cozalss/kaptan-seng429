"""What the Ayarlar · Telegram section does (kaptan.api.routers.telegram): token, pairing, level, sample message.

Every error is a short Turkish sentence for the person; Telegram's own answer, and the token, never reach it.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, Final

from kaptan.alerts.history import record_history
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.cloud.sync import read_status as cloud_status
from kaptan.db import DictConn
from kaptan.domain.schemas._base import iso_ms
from kaptan.settings import Settings
from kaptan.telegram import link, store
from kaptan.telegram.botapi import BotApi, TelegramError, mask

log = logging.getLogger("kaptan.telegram")

ApiFactory = Callable[[str], BotApi]
BOT_CODE_REFUSED: Final = (
    "Bu kod Telegram'da çalışmadı. @BotFather'ın verdiği uzun kodu baştan sona kopyalayıp yapıştır."
)
BAD_SHAPE: Final = "Bu bir bot kodu gibi görünmüyor. @BotFather'ın verdiği, ortasında iki nokta olan kodu yapıştır."
NEED_BOT_CODE: Final = "Önce bot kodunu yapıştırıp kaydet."
NOT_PAIRED: Final = "Önce Telegram'ı bağla."
BOT_CODE_FROM_INSTALL: Final = "Bot kodu kurulumda (.env) verilmiş; buradan değiştirilemez."
SEND_FAILED: Final = "Mesaj gönderilemedi. Birazdan yeniden dene."
SAMPLE_TEXT: Final = (
    "<b>ÖRNEK</b> · Örnek Şirket\n"
    "Bu bir örnek mesajdır; gerçek bir duyuru değil. Gerçek mesajlar böyle gelir: "
    "şirketin adı, ne olduğu (▲ olumlu / ▼ olumsuz / • nötr) ve senin için ne demek olduğu.\n"
    "<i>Altındaki düğmelerle okundu diyebilir, sonraya bırakabilir ya da şirketi susturabilirsin.</i>"
)
SAMPLE_BUTTONS: Final = {"inline_keyboard": [[{"text": "Tamam", "callback_data": "sample:ok"}]]}


async def status(conn: DictConn, settings: Settings, now: datetime, redis: Any = None) -> dict[str, Any]:
    state = await store.get_state(conn)
    cur = await conn.execute("SELECT max(sent_at) AS at FROM ops.telegram_sent")
    row = await cur.fetchone()
    last = row["at"] if row else None
    expires = state.get("pair_expires_at")
    open_code = bool(state.get("pair_code_hash")) and expires is not None and now < expires
    until = state.get("silent_until")
    return {
        "configured": link.token_of(settings, state) is not None,
        "token_from_env": link.env_token(settings) is not None,
        "bot_username": state.get("bot_username"),
        "paired": state.get("chat_id") is not None,
        "pairing_open": open_code and state.get("chat_id") is None,
        "pairing_expires_at": iso_ms(expires) if open_code and isinstance(expires, datetime) else None,
        "level": state["level"],
        "daily_cap": int(state["daily_cap"]),
        "silent_until": iso_ms(until) if isinstance(until, datetime) and now < until else None,
        "last_sent_at": iso_ms(last) if last is not None else None,
        **await cloud_status(redis, settings),
    }


async def _check_token(token: str, factory: ApiFactory) -> str:
    """The bot's username, from `getMe`; ApiError(422) when the token does not work."""
    if not link.TOKEN_RE.fullmatch(token):
        raise ApiError(422, "validation", BAD_SHAPE)
    try:
        me = await factory(token).get_me()
    except TelegramError as exc:
        log.warning("telegram: token not accepted (%s)", mask(exc.reason, token))
        raise ApiError(422, "validation", BOT_CODE_REFUSED) from exc
    name = str(me.get("username") or "")
    if not link.USERNAME_RE.fullmatch(name):
        raise ApiError(422, "validation", BOT_CODE_REFUSED)
    return name


async def save(
    conn: DictConn,
    settings: Settings,
    actor_uid: str,
    now: datetime,
    *,
    token: str | None,
    level: str | None,
    daily_cap: int | None,
    factory: ApiFactory = BotApi,
) -> None:
    changes: dict[str, Any] = {}
    if token is not None and token.strip():
        if link.env_token(settings) is not None:
            raise ApiError(409, "conflict", BOT_CODE_FROM_INSTALL)
        clean = token.strip()
        changes |= {"token": clean, "bot_username": await _check_token(clean, factory), "chat_id": None,
                    "pair_code_hash": None, "pair_expires_at": None, "paired_at": None}  # fmt: skip
    if level is not None:
        changes["level"] = level
    if daily_cap is not None:
        changes["daily_cap"] = daily_cap
    if not changes:
        return
    async with conn.transaction():
        await store.update(conn, now, **changes)
        shown = {k: v for k, v in changes.items() if k in ("level", "daily_cap")} | {"token_set": "token" in changes}
        await append(conn, [AuditDraft(user_actor(actor_uid), "telegram.changed", "telegram", "link", shown)])


async def start_pairing(
    conn: DictConn, settings: Settings, actor_uid: str, now: datetime, *, factory: ApiFactory = BotApi
) -> dict[str, str]:
    state = await store.get_state(conn)
    token = link.token_of(settings, state)
    if token is None:
        raise ApiError(409, "conflict", NEED_BOT_CODE)
    name = state.get("bot_username") or await _check_token(token, factory)
    code = link.new_code()
    async with conn.transaction():
        await store.update(
            conn, now, bot_username=name, pair_code_hash=link.hash_code(code), pair_expires_at=now + link.CODE_TTL,
            chat_id=None, paired_at=None,
        )  # fmt: skip
        await append(conn, [AuditDraft(user_actor(actor_uid), "telegram.pairing_started", "telegram", "link", {})])
    return {"pair_link": link.deep_link(name, code), "expires_at": iso_ms(now + link.CODE_TTL)}


async def remove(conn: DictConn, actor_uid: str, now: datetime) -> None:
    async with conn.transaction():
        await store.unlink(conn, now)
        await append(conn, [AuditDraft(user_actor(actor_uid), "telegram.unlinked", "telegram", "link", {})])


async def send_sample(
    conn: DictConn, pool: Any, settings: Settings, now: datetime, *, factory: ApiFactory = BotApi
) -> None:
    state = await store.get_state(conn)
    token = link.token_of(settings, state)
    if token is None or state.get("chat_id") is None:
        raise ApiError(409, "conflict", NOT_PAIRED)
    reason: str | None = None
    try:
        await factory(token).send_message(int(state["chat_id"]), SAMPLE_TEXT, reply_markup=SAMPLE_BUTTONS)
    except TelegramError as exc:
        reason = exc.reason
    await record_history(pool, now, "test", "KAPtan: örnek Telegram mesajı.", {"telegram": reason})
    if reason is not None:
        raise ApiError(502, "send_failed", SEND_FAILED)
