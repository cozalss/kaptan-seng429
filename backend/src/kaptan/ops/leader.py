"""Single-replica guard: a Postgres session advisory lock per worker kind.

    async with LeaderLock(conninfo, "ingest_worker") as lock:
        if await lock.acquire(stop):          # waits (polling) while another instance holds it
            ...run...                          # lock.lost is set if the lock connection dies

A second ingest worker / scheduler / agent worker started by mistake waits instead of polling KAP or
consuming the feed in parallel. The lock lives on its own autocommit connection; Postgres releases it
when that connection ends (crash, SIGKILL, network loss), so a dead leader never blocks the next one.
A watchdog pings the connection; if it breaks, `lost` is set and the caller stops (another instance
may already hold the lock).
"""

from __future__ import annotations

import asyncio
import logging
from types import TracebackType
from typing import Any, Final

from psycopg import AsyncConnection

log = logging.getLogger("kaptan.ops.leader")

LOCK_NAMESPACE: Final = "kaptan:leader:"
RETRY_S: Final = 5.0
WATCH_S: Final = 10.0
TRY_SQL: Final = "SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS ok"
UNLOCK_SQL: Final = "SELECT pg_advisory_unlock(hashtextextended(%s, 0)) AS ok"


class LeaderLock:
    def __init__(self, conninfo: str, name: str, *, retry_s: float = RETRY_S, watch_s: float = WATCH_S) -> None:
        self.conninfo = conninfo
        self.key = f"{LOCK_NAMESPACE}{name}"
        self.name = name
        self.retry_s = retry_s
        self.watch_s = watch_s
        self.conn: AsyncConnection[Any] | None = None
        self.held = False
        self.lost = asyncio.Event()
        self._watch: asyncio.Task[None] | None = None

    async def __aenter__(self) -> LeaderLock:
        self.conn = await AsyncConnection.connect(self.conninfo, autocommit=True)
        return self

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        await self.release()

    async def try_acquire(self) -> bool:
        assert self.conn is not None, "use LeaderLock as an async context manager"
        cur = await self.conn.execute(TRY_SQL, (self.key,))
        row = await cur.fetchone()
        self.held = bool(row and row[0])
        return self.held

    async def acquire(self, stop: asyncio.Event) -> bool:
        """Wait for the lock until `stop`; True when this process is the leader."""
        warned = False
        while not stop.is_set():
            if await self.try_acquire():
                log.info("leader lock %s acquired", self.key)
                self._watch = asyncio.create_task(self._watchdog(stop), name=f"leader-watch-{self.name}")
                return True
            if not warned:
                log.warning("another %s holds the leader lock; waiting (one replica runs at a time)", self.name)
                warned = True
            try:
                await asyncio.wait_for(stop.wait(), timeout=self.retry_s)
            except TimeoutError:
                continue
        return False

    async def _watchdog(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=self.watch_s)
                return
            except TimeoutError:
                pass
            try:
                assert self.conn is not None
                await asyncio.wait_for(self.conn.execute("SELECT 1"), timeout=self.watch_s)
            except Exception as exc:
                log.error("leader lock %s lost (%s); stopping", self.key, type(exc).__name__)
                self.held = False
                self.lost.set()
                stop.set()
                return

    async def release(self) -> None:
        if self._watch is not None:
            self._watch.cancel()
            await asyncio.gather(self._watch, return_exceptions=True)
            self._watch = None
        if self.conn is None:
            return
        try:
            if self.held and not self.conn.closed:
                await self.conn.execute(UNLOCK_SQL, (self.key,))
        except Exception as exc:  # the connection is going away anyway; Postgres frees the lock then
            log.warning("leader lock %s: unlock failed: %s", self.key, type(exc).__name__)
        finally:
            self.held = False
            await self.conn.close()
            self.conn = None
