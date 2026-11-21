"""`announce()`: `notify()` with the person's preferences in front of it (kaptan.alerts.prefs).

A kind the person turned off for the phone is not sent ("off"). A message inside the quiet hours is held in Redis
and reported as "sent" to the caller (it will go: a second try each minute would only pile up); `flush_held` sends
what waited once the quiet hours are over. The full stop and the test never wait. A preference that cannot be read
(the database is away) falls back to the defaults, so a stop is never swallowed by a hiccup.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

from redis.exceptions import RedisError

from kaptan.alerts.config import AlertConfig, Channel
from kaptan.alerts.messages import AlertKind
from kaptan.alerts.prefs import HELD_KEY, HELD_MAX_AGE_H, decide, default_prefs, in_quiet, load_prefs
from kaptan.alerts.service import Outcome, Sender, notify
from kaptan.domain.schemas._base import iso_ms

log = logging.getLogger("kaptan.alerts")

HELD_KINDS: Final[tuple[AlertKind, ...]] = ("suggestion", "part_down", "watch", "price", "weekly")


async def read_prefs(pool: Any) -> dict[str, Any]:
    try:
        async with pool.connection() as conn:
            prefs = await load_prefs(conn)
            await conn.rollback()
            return prefs
    except Exception as exc:  # any failure here must not stop an alert
        log.warning("alert preferences unreadable (%s); defaults used", type(exc).__name__)
        return default_prefs()


async def announce(
    pool: Any,
    redis: Any,
    cfg: AlertConfig,
    kind: AlertKind,
    *,
    now: datetime,
    senders: Mapping[Channel, Sender] | None = None,
) -> Outcome:
    verdict = decide(await read_prefs(pool), kind, now)
    if verdict == "skip":
        return "off"
    if verdict == "hold":
        if not cfg.channels:
            return "off"
        try:
            await redis.hset(HELD_KEY, kind, iso_ms(now))
        except (RedisError, OSError) as exc:
            log.warning("alert not held (%s); sent now instead", type(exc).__name__)
            return await notify(redis, cfg, kind, now=now, senders=senders, pool=pool)
        return "sent"
    return await notify(redis, cfg, kind, now=now, senders=senders, pool=pool)


async def flush_held(
    pool: Any, redis: Any, cfg: AlertConfig, *, now: datetime, senders: Mapping[Channel, Sender] | None = None
) -> tuple[AlertKind, ...]:
    """Send what waited, once the quiet hours are over. Returns the kinds that went out."""
    try:
        held: Mapping[str, str] = await redis.hgetall(HELD_KEY)
    except (RedisError, OSError):
        return ()
    if not held:
        return ()
    prefs = await read_prefs(pool)
    if in_quiet(prefs["quiet"], now):
        return ()
    sent: tuple[AlertKind, ...] = ()
    for kind in HELD_KINDS:
        raw = held.get(kind)
        if raw is None:
            continue
        await redis.hdel(HELD_KEY, kind)
        if _stale(raw, now) or decide(prefs, kind, now) != "send":
            continue
        await notify(redis, cfg, kind, now=now, senders=senders, pool=pool)
        sent = (*sent, kind)
    return sent


def _stale(raw: str, now: datetime) -> bool:
    try:
        at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return True
    return (now - at).total_seconds() > HELD_MAX_AGE_H * 3600
