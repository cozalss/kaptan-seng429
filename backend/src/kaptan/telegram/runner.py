"""The Telegram loop: long polling for what the person taps, a half-minute tick for what KAPtan has to say.

Hosted by the scheduler (one replica, behind its leader lock), like the alert watch, so no new service and no inbound
port are needed: everything is outbound HTTPS to api.telegram.org. Two tasks:
- `poll_loop`: `getUpdates` with a 25 s long-poll timeout. The offset (last update_id + 1) is stored after every
  update, so a restart neither replays nor loses one. Errors back off 2, 4, ... 60 s (or Telegram's `retry_after`);
  there is no busy loop.
- `tick_loop`: every 30 s it stamps "alive" (the gap after a stop becomes the "KAPtan X saat kapalıydı" message),
  sends new instant messages (kaptan.telegram.dispatch) and announces new suggestions from the desk stream.
Off unless a token is set (`ALERT_TELEGRAM_BOT_TOKEN` or pasted in Ayarlar); without a paired chat nothing is sent.

Single sender: when the Cloudflare Worker is configured (`CLOUD_WATCHER_URL` + `CLOUD_SYNC_SECRET`, kaptan.cloud) the
Worker owns the bot's incoming updates through a webhook (a webhook and `getUpdates` cannot coexist) and sends every
disclosure message, the morning message and the "was off" message. This PC then runs no poller and sends only the
suggestion messages ("KAPtan: THYAO için al önerisi hazır"), which need the PC.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from redis.exceptions import RedisError

from kaptan.alerts.announce import read_prefs
from kaptan.events import bus
from kaptan.settings import Settings, cloud_watcher_on
from kaptan.telegram import dispatch, link, store
from kaptan.telegram import format as fmt
from kaptan.telegram.botapi import BotApi, TelegramError
from kaptan.telegram.handlers import handle_update
from kaptan.telegram.morning import send_gap

log = logging.getLogger("kaptan.telegram")

TICK_S: Final = 30.0
IDLE_S: Final = 10.0
MAX_BACKOFF_S: Final = 60.0
MAX_EVENT_AGE: Final = timedelta(minutes=30)
ApiFactory = Callable[[str], BotApi]
Clock = Callable[[], datetime]


def backoff(failures: int) -> float:
    return min(MAX_BACKOFF_S, 2.0 ** min(failures, 6))


async def make_api(settings: Settings, pool: Any, factory: ApiFactory = BotApi) -> BotApi | None:
    async with pool.connection() as conn:
        state = await store.get_state(conn)
        await conn.rollback()
    token = link.token_of(settings, state)
    return factory(token) if token else None


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


async def poll_once(pool: Any, api: BotApi, clock: Clock, *, poll_s: int) -> int:
    """One getUpdates round; returns the number of updates handled."""
    async with pool.connection() as conn:
        offset = int((await store.get_state(conn))["update_offset"])
        await conn.rollback()
    updates = await api.get_updates(offset, poll_s)
    for update in updates:
        uid = update.get("update_id")
        if not isinstance(uid, int):
            continue
        async with pool.connection() as conn:
            try:
                await handle_update(conn, api, update, clock())
            except Exception as exc:  # one bad update must not stop the loop or be replayed for ever
                await conn.rollback()
                log.error("telegram: update not handled (%s)", type(exc).__name__)
            await store.update(conn, clock(), update_offset=uid + 1)
            await conn.commit()
    return len(updates)


async def poll_loop(
    settings: Settings, pool: Any, stop: asyncio.Event, clock: Clock, factory: ApiFactory = BotApi
) -> None:
    failures = 0
    while not stop.is_set():
        try:
            api = await make_api(settings, pool, factory)
            if api is None:
                await _wait(stop, IDLE_S)
                continue
            await poll_once(pool, api, clock, poll_s=25)
            failures = 0
        except TelegramError as exc:
            failures += 1
            wait = exc.retry_after or backoff(failures)
            log.warning("telegram: polling failed (%s); again in %.0f s", exc.reason, wait)
            await _wait(stop, wait)
        except Exception as exc:
            failures += 1
            log.error("telegram: polling crashed (%s); again in %.0f s", type(exc).__name__, backoff(failures))
            await _wait(stop, backoff(failures))


# ── the tick ──────────────────────────────────────────────────────────────────


def _entry_time(entry_id: str) -> datetime | None:
    ms, _, _ = entry_id.partition("-")
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=UTC)
    except (ValueError, OverflowError, OSError):
        return None


async def announce_suggestions(
    pool: Any, redis: Any, api: BotApi, state: dict[str, Any], prefs: dict[str, Any], now: datetime
) -> int:
    """New approval cards of the desk stream -> "KAPtan: THYAO için al önerisi hazır" + the one-line reason.

    No approve button: approving moves money, so it stays in the app. The card's money fields are never read."""
    from kaptan.telegram.routing import quiet_reason

    stream = bus.stream_key("desk")
    cursor = state.get("desk_cursor")
    if not cursor:  # first start: only what comes after
        async with pool.connection() as conn:
            await store.update(conn, now, desk_cursor=await bus.latest_id(redis, stream))
            await conn.commit()
        return 0
    reply: Any = await redis.xread({stream: cursor}, count=bus.READ_COUNT)
    entries = [(str(i), f or {}) for _k, batch in reply or [] for i, f in batch]
    if not entries:
        return 0
    sent = 0
    for entry_id, fields in entries:
        at = _entry_time(entry_id)
        if at is None or now - at > MAX_EVENT_AGE or fields.get("event") != "approval.requested":
            continue
        try:
            data = json.loads(fields.get("data", ""))
        except ValueError:
            continue
        if not isinstance(data, dict) or data.get("status") != "pending" or not data.get("ticker"):
            continue
        ticker = str(data["ticker"])
        if ticker in prefs["muted"] or state.get("chat_id") is None or quiet_reason(state, prefs, now):
            continue  # a suggestion is still on the home screen; quiet hours and muted companies stay quiet
        text = fmt.suggestion(ticker, str(data.get("side") or ""), str(data.get("headline_tr") or ""))
        try:
            await api.send_message(int(state["chat_id"]), text)
        except TelegramError as exc:
            log.warning("telegram: suggestion not sent (%s)", exc.reason)
            return sent
        async with pool.connection() as conn:
            await store.record_sent(conn, now, "suggestion", [ticker], 1)
            await conn.commit()
        sent += 1
        await asyncio.sleep(0)
    async with pool.connection() as conn:
        await store.update(conn, now, desk_cursor=entries[-1][0])
        await conn.commit()
    return sent


async def tick_once(settings: Settings, pool: Any, redis: Any, clock: Clock, factory: ApiFactory = BotApi) -> None:
    now = clock()
    async with pool.connection() as conn:
        gap = await store.touch_alive(conn, now)
        await conn.commit()
    api = await make_api(settings, pool, factory)
    if api is None:
        return
    async with pool.connection() as conn:
        state = await store.get_state(conn)
        await conn.rollback()
    if state.get("chat_id") is None:
        return
    prefs = await read_prefs(pool)
    if not cloud_watcher_on(settings):  # with the cloud watcher the Worker is the only sender of these
        async with pool.connection() as conn:
            if gap is not None:
                await send_gap(conn, api, state, gap, now)
            await dispatch.instant_pass(conn, api, state, prefs, now)
    await announce_suggestions(pool, redis, api, state, prefs, now)


async def tick_loop(
    settings: Settings, pool: Any, redis: Any, stop: asyncio.Event, clock: Clock, factory: ApiFactory = BotApi
) -> None:
    while not stop.is_set():
        try:
            await tick_once(settings, pool, redis, clock, factory)
        except (RedisError, OSError) as exc:
            log.warning("telegram: tick skipped (%s)", type(exc).__name__)
        except TelegramError as exc:
            log.warning("telegram: tick failed (%s)", exc.reason)
        except Exception as exc:  # never reaches the scheduler; no message text is logged
            log.error("telegram: tick failed (%s)", type(exc).__name__)
        await _wait(stop, TICK_S)


async def run_telegram(
    settings: Settings,
    pool: Any,
    redis: Any,
    stop: asyncio.Event,
    *,
    clock: Clock = lambda: datetime.now(UTC),
    factory: ApiFactory = BotApi,
) -> None:
    """Until `stop`. Never raises (except cancellation)."""
    if cloud_watcher_on(settings):
        log.info("telegram: the cloud watcher owns the bot's updates; no poller here, suggestions only")
        await tick_loop(settings, pool, redis, stop, clock, factory)
        return
    log.info("telegram loop started (idle until a token is set)")
    await asyncio.gather(
        poll_loop(settings, pool, stop, clock, factory),
        tick_loop(settings, pool, redis, stop, clock, factory),
    )
