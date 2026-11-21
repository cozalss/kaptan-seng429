"""`notify()`: one fixed sentence through every configured channel, at most once per kind per 10 minutes.

State lives in Redis (no table): `kaptan:alerts:rate:<kind>` is the slot of a kind (SET NX with a TTL, so the
API and the scheduler share one limit), `kaptan:alerts:state` holds when a message last went out and which
channel failed last. A slot is taken by the attempt, delivered or not: a server that is away is not asked again
for every event.

`notify()` never raises and never waits long: a send failure is logged with the channel and a reason that
cannot hold a secret, and shown to the person as `last_error_tr`.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Final, Literal

from redis.exceptions import RedisError

from kaptan.alerts.channels import AlertSendError, send_email, send_ntfy
from kaptan.alerts.config import AlertConfig, Channel
from kaptan.alerts.history import record_history
from kaptan.alerts.messages import AlertKind, message_for
from kaptan.domain.schemas._base import iso_ms

log = logging.getLogger("kaptan.alerts")

RATE_S: Final = 10 * 60
#: The test message of the settings screen has its own, shorter limit (POST /me/alerts/test).
TEST_RATE_S: Final = 60
ATTEMPTS: Final = 2
RETRY_WAIT_S: float = 2.0
RATE_PREFIX: Final = "kaptan:alerts:rate:"
STATE_KEY: Final = "kaptan:alerts:state"
LAST_SENT: Final = "last_sent_at"
ERROR_FIELD: Final[Mapping[Channel, str]] = {"ntfy": "error_ntfy", "email": "error_email"}

SEND_FAILED_TR: Final[Mapping[Channel, str]] = {
    "ntfy": "Telefon bildirimi gönderilemedi.",
    "email": "E-posta gönderilemedi.",
}
BOTH_FAILED_TR: Final = "Telefon bildirimi ve e-posta gönderilemedi."
WRONG_SETTING_TR: Final[Mapping[Channel, str]] = {
    "ntfy": "Telefon bildirimi ayarı hatalı; kurulumu yeniden çalıştır.",
    "email": "E-posta bildirimi ayarı hatalı; kurulumu yeniden çalıştır.",
}

Outcome = Literal["off", "rate_limited", "sent", "failed"]
Sender = Callable[[str], Awaitable[None]]


def rate_key(kind: AlertKind) -> str:
    return f"{RATE_PREFIX}{kind}"


def senders_for(cfg: AlertConfig) -> dict[Channel, Sender]:
    out: dict[Channel, Sender] = {}
    if cfg.ntfy is not None:
        ntfy = cfg.ntfy
        out["ntfy"] = lambda text: send_ntfy(ntfy, text)
    if cfg.smtp is not None:
        smtp = cfg.smtp
        out["email"] = lambda text: send_email(smtp, text)
    return out


async def take_slot(redis: Any, kind: AlertKind, seconds: int) -> bool:
    """True when this kind may go out now (and the slot is now taken for `seconds`)."""
    return bool(await redis.set(rate_key(kind), "1", nx=True, ex=seconds))


async def _send(channel: Channel, send: Sender, text: str) -> str | None:
    """None when delivered, else the reason. ntfy gets a second try: a lost alert is worse than a double one."""
    attempts = ATTEMPTS if channel == "ntfy" else 1
    reason = "unknown"
    for attempt in range(attempts):
        if attempt:
            await asyncio.sleep(RETRY_WAIT_S)
        try:
            await send(text)
            return None
        except AlertSendError as exc:
            reason = exc.reason
        except Exception as exc:  # a bug in a sender must not reach the pipeline; its text may hold the request
            return type(exc).__name__
    return reason


async def _record(redis: Any, failed: Mapping[Channel, str], delivered: tuple[Channel, ...], now: datetime) -> None:
    try:
        if delivered:
            await redis.hset(STATE_KEY, mapping={LAST_SENT: iso_ms(now)})
            await redis.hdel(STATE_KEY, *(ERROR_FIELD[c] for c in delivered))
        if failed:
            await redis.hset(STATE_KEY, mapping={ERROR_FIELD[c]: "1" for c in failed})
    except (RedisError, OSError) as exc:
        log.warning("alert result not recorded: %s", type(exc).__name__)


async def send_now(
    redis: Any,
    cfg: AlertConfig,
    kind: AlertKind,
    *,
    now: datetime | None = None,
    senders: Mapping[Channel, Sender] | None = None,
    pool: Any = None,
) -> Outcome:
    """Send without asking the limit (the caller took the slot). Never raises."""
    targets = {c: s for c, s in (senders_for(cfg) if senders is None else senders).items() if c in cfg.channels}
    if not targets:
        return "off"
    text = message_for(kind)
    failed: dict[Channel, str] = {}
    for channel, send in targets.items():
        reason = await _send(channel, send, text)
        if reason is not None:
            failed[channel] = reason
            log.warning("alert not sent: channel=%s kind=%s reason=%s", channel, kind, reason)
    delivered = tuple(c for c in targets if c not in failed)
    when = now or datetime.now(UTC)
    await _record(redis, failed, delivered, when)
    if pool is not None:
        await record_history(pool, when, kind, text, {c: failed.get(c) for c in targets})
    return "sent" if delivered else "failed"


async def notify(
    redis: Any,
    cfg: AlertConfig,
    kind: AlertKind,
    *,
    now: datetime | None = None,
    senders: Mapping[Channel, Sender] | None = None,
    rate_s: int = RATE_S,
    pool: Any = None,
) -> Outcome:
    """Tell the person, unless nothing is configured or this kind already went out in the last 10 minutes."""
    if not cfg.channels:
        return "off"
    try:
        if not await take_slot(redis, kind, rate_s):
            return "rate_limited"
    except (RedisError, OSError) as exc:  # without the limit nothing is sent: a loop must not flood a phone
        log.warning("alert skipped, the limit is unreadable: %s", type(exc).__name__)
        return "failed"
    return await send_now(redis, cfg, kind, now=now, senders=senders, pool=pool)


def _error_tr(cfg: AlertConfig, state: Mapping[str, str]) -> str | None:
    wrong = [WRONG_SETTING_TR[c] for c in cfg.invalid]
    failed = [c for c in cfg.channels if state.get(ERROR_FIELD[c])]
    sent = [BOTH_FAILED_TR] if len(failed) > 1 else [SEND_FAILED_TR[c] for c in failed]
    return " ".join([*wrong, *sent]) or None


async def alert_settings(redis: Any, cfg: AlertConfig) -> dict[str, Any]:
    """The AlertSettings document: what is on and how the last message went. No topic, no address."""
    try:
        state: Mapping[str, str] = await redis.hgetall(STATE_KEY)
    except (RedisError, OSError) as exc:
        log.warning("alert state unreadable: %s", type(exc).__name__)
        state = {}
    return {
        "ntfy": cfg.ntfy is not None,
        "email": cfg.smtp is not None,
        "last_sent_at": state.get(LAST_SENT) or None,
        "last_error_tr": _error_tr(cfg, state),
    }
