"""The alert loop: one long-running task, hosted by the scheduler (one replica, behind its leader lock).

It adds no call to the code that decides anything. It reads what the backend already publishes:
- the `desk` stream (`kaptan:desk`): `approval.requested` = a new suggestion, `halt` = the day's loss limit,
  `kill_switch` = KAPtan was stopped (kaptan.alerts.messages decides by the state in the event);
- the facts of `GET /system/status` once a minute: a part that has been down for 15 minutes.

The place in the stream is kept in Redis, so a restart of the scheduler picks up where it stopped; an event
older than MAX_EVENT_AGE is not announced any more (the phone would ring for something long over). A first start
reads only what comes after it.

"Down for 15 minutes" is counted in what this loop itself saw. Two looks further apart than WATCH_GAP mean the
watcher was away (the PC slept, the scheduler restarted): the clock starts again instead of blaming the workers
for the night. One message per outage; it is tried again while the outage lasts if it could not be delivered.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from redis.exceptions import RedisError

from kaptan.alerts.announce import announce, flush_held
from kaptan.alerts.config import AlertConfig, alert_config
from kaptan.alerts.messages import AlertKind, kind_for_event
from kaptan.events import bus
from kaptan.ops.system_status import DOWN_CODES, read_facts, summarize
from kaptan.settings import Settings

log = logging.getLogger("kaptan.alerts")

CURSOR_KEY: Final = "kaptan:alerts:cursor"
DOWN_KEY: Final = "kaptan:alerts:down"
FEED_CURSOR_KEY: Final = "kaptan:alerts:feed_cursor"
DOWN_AFTER: Final = timedelta(minutes=15)
WATCH_GAP: Final = timedelta(minutes=5)
MAX_EVENT_AGE: Final = timedelta(minutes=30)
CHECK_EVERY_S: Final = 60.0
ERROR_WAIT_S: Final = 5.0

Clock = Callable[[], datetime]
Entry = tuple[str, Mapping[str, str]]


@dataclass(frozen=True, slots=True)
class DownState:
    """What the loop has seen of the current outage (all None/False: everything works)."""

    since: datetime | None = None
    seen: datetime | None = None
    alerted: bool = False


def down_step(now: datetime, is_down: bool, state: DownState) -> tuple[DownState, bool]:
    """The outage clock after one look: (the new state, tell the person now)."""
    if not is_down:
        return DownState(), False
    away = state.since is None or state.seen is None or now - state.seen > WATCH_GAP
    if away or state.since is None:
        return DownState(since=now, seen=now), False
    fire = not state.alerted and now - state.since >= DOWN_AFTER
    return replace(state, seen=now), fire


def entry_time(entry_id: str) -> datetime | None:
    """When a stream entry was written ("<unix ms>-<n>")."""
    ms, _, _ = entry_id.partition("-")
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=UTC)
    except (ValueError, OverflowError, OSError):
        return None


def kinds_in(entries: list[Entry], now: datetime) -> tuple[AlertKind, ...]:
    """The alerts a batch of desk entries calls for, each kind once, in the order they happened."""
    out: tuple[AlertKind, ...] = ()
    for entry_id, fields in entries:
        at = entry_time(entry_id)
        if at is None or now - at > MAX_EVENT_AGE:
            continue
        try:
            data = json.loads(fields.get("data", ""))
        except ValueError:
            continue
        kind = kind_for_event(str(fields.get("event", "")), data) if isinstance(data, dict) else None
        if kind is not None and kind not in out:
            out = (*out, kind)
    return out


def feed_hits_watchlist(entries: list[Entry], watched: frozenset[str], now: datetime) -> bool:
    """True when a recent `disclosure` event of the feed names a company on the watchlist (the text never leaves)."""
    for entry_id, fields in entries:
        at = entry_time(entry_id)
        if at is None or now - at > MAX_EVENT_AGE or fields.get("event") != "disclosure":
            continue
        try:
            data = json.loads(fields.get("data", ""))
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        codes = {data.get("primary_ticker"), *(data.get("stock_codes") or [])}
        if codes & watched:
            return True
    return False


def _when(raw: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(raw) if raw else None
    except ValueError:
        return None


class AlertWatch:
    def __init__(self, cfg: AlertConfig, pool: Any, redis: Any, clock: Clock, *, block_ms: int = bus.XREAD_BLOCK_MS):
        self.cfg = cfg
        self.pool = pool
        self.redis = redis
        self.clock = clock
        self.block_ms = block_ms
        self.stream = bus.stream_key("desk")
        self.cursor: str | None = None
        self.feed_cursor: str | None = None

    async def _start_cursor(self) -> str:
        stored = await self.redis.get(CURSOR_KEY)
        return stored if stored and bus.is_stream_id(stored) else await bus.latest_id(self.redis, self.stream)

    async def read_events(self) -> tuple[AlertKind, ...]:
        """One XREAD slice of the desk stream; returns the kinds it announced (or tried to)."""
        if self.cursor is None:
            self.cursor = await self._start_cursor()
        reply: Any = await self.redis.xread({self.stream: self.cursor}, count=bus.READ_COUNT, block=self.block_ms)
        entries: list[Entry] = [(str(i), f or {}) for _key, batch in reply or [] for i, f in batch]
        if not entries:
            return ()
        kinds = kinds_in(entries, self.clock())
        for kind in kinds:
            await announce(self.pool, self.redis, self.cfg, kind, now=self.clock())
        self.cursor = entries[-1][0]
        await self.redis.set(CURSOR_KEY, self.cursor)
        return kinds

    async def _watched(self) -> frozenset[str]:
        async with self.pool.connection() as conn:
            cur = await conn.execute("SELECT ticker FROM core.watchlist")
            return frozenset(str(r["ticker"]) for r in await cur.fetchall())

    async def read_feed(self) -> bool:
        """The disclosure feed since the last look; True when a watched company's disclosure was announced.

        The phone only ever gets the generic sentence of the "watch" kind (no company), at most once per 10 minutes.
        """
        stream = bus.stream_key("feed")
        if self.feed_cursor is None:
            stored = await self.redis.get(FEED_CURSOR_KEY)
            self.feed_cursor = (
                stored if stored and bus.is_stream_id(stored) else await bus.latest_id(self.redis, stream)
            )
        reply: Any = await self.redis.xread({stream: self.feed_cursor}, count=bus.READ_COUNT)
        entries: list[Entry] = [(str(i), f or {}) for _key, batch in reply or [] for i, f in batch]
        if not entries:
            return False
        now = self.clock()
        told = (
            feed_hits_watchlist(entries, await self._watched(), now)
            and await announce(self.pool, self.redis, self.cfg, "watch", now=now) == "sent"
        )
        self.feed_cursor = entries[-1][0]
        await self.redis.set(FEED_CURSOR_KEY, self.feed_cursor)
        return told

    async def _down_state(self) -> DownState:
        raw = await self.redis.hgetall(DOWN_KEY)
        return DownState(_when(raw.get("since")), _when(raw.get("seen")), raw.get("alerted") == "1")

    async def _store(self, state: DownState) -> None:
        if state.since is None or state.seen is None:
            await self.redis.delete(DOWN_KEY)
            return
        doc = {
            "since": state.since.isoformat(),
            "seen": state.seen.isoformat(),
            "alerted": "1" if state.alerted else "",
        }
        await self.redis.hset(DOWN_KEY, mapping=doc)

    async def check_parts(self) -> bool:
        """One look at the system's parts; True when the person was told about an outage."""
        now = self.clock()
        problems = summarize(now, await read_facts(self.pool, self.redis, now))["problems"]
        is_down = any(p["code"] in DOWN_CODES for p in problems)
        state, fire = down_step(now, is_down, await self._down_state())
        told = fire and await announce(self.pool, self.redis, self.cfg, "part_down", now=now) == "sent"
        await self._store(replace(state, alerted=True) if told else state)
        return told


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


async def run_alert_watch(
    settings: Settings,
    pool: Any,
    redis: Any,
    stop: asyncio.Event,
    *,
    clock: Clock = lambda: datetime.now(UTC),
    check_every_s: float = CHECK_EVERY_S,
) -> None:
    """Until `stop`. Returns at once when no channel is configured. Never raises (except cancellation)."""
    cfg = alert_config(settings)
    if cfg.invalid:
        log.warning("alert settings are wrong, channel(s) off: %s", ", ".join(cfg.invalid))
    if not cfg.channels:
        log.info("alerts are off: no channel is configured")
        return
    log.info("alert watch started: %s", ", ".join(cfg.channels))
    watch = AlertWatch(cfg, pool, redis, clock)
    loop = asyncio.get_running_loop()
    next_check = loop.time()
    while not stop.is_set():
        try:
            await watch.read_events()
            await flush_held(pool, redis, cfg, now=clock())  # what the quiet hours held back
            await watch.read_feed()
            # the workers only run with live KAP: without it "the reader is down" is the normal state
            if settings.kap_live and loop.time() >= next_check:
                next_check = loop.time() + check_every_s
                await watch.check_parts()
        except (RedisError, OSError) as exc:
            log.warning("alert watch: redis is away (%s); trying again", type(exc).__name__)
            await _wait(stop, ERROR_WAIT_S)
        except Exception as exc:  # a bug here must never reach the scheduler; no event text is logged
            log.error("alert watch failed (%s); trying again", type(exc).__name__)
            await _wait(stop, ERROR_WAIT_S)
