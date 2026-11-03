"""The KAP → agent feed consumer: Redis stream `kaptan:kap.disclosures`, consumer group `agent-worker`.

Producer: `kaptan.ingest.publish.publish_to_agents()` (stage `listed` after the poller stored a new
visible row, stage `text` after the detail fetcher stored its text). For each entry:

1. **Idempotency** on the disclosure index: `ops.agent_feed` holds one row per index; an index that has
   ended (done, waiting_approval, skipped, window_closed, expired_unrun, failed) is acknowledged and ignored,
   so duplicate entries and redeliveries never start a second run.
2. **Scope:** only live KAP rows (`origin='kap'`, not backfill) with a ticker and an agent subject route
   (E1–E4 or `llm`, `ingest.subject_routes.DETAIL_ROUTES`) start a run; everything else is recorded as
   `skipped` with the reason. In-scope rows without their TR text yet wait as `awaiting_text` until the
   `text` entry arrives.
3. **Cheap checks first, no budget used:** a row whose entry window has closed (`feed_queue.entry_window_open`)
   can only end in HOLD: `window_closed` when it arrives that late, `expired_unrun` (with why it waited) when
   it had been waiting. A row the LLM-free pre-gate vetoes (R03, R04, R13) runs at once with 0 LLM calls.
4. **Spend limit:** at most `AGENT_MAX_RUNS_PER_HOUR` runs that reached an LLM (or are still running) per
   rolling hour, at most `AGENT_MAX_RUNS_PER_DAY` per Istanbul day (0 = no daily cap), and no run when
   every live provider is over its daily cap (kaptan.llm.budget). Such a row is `deferred`, with the reason.
   llm-route rows may use only part of a cap, so a flood of them leaves room for an E row.
5. **Re-drive:** housekeeping (`sweep`) ends what can no longer run and puts deferred rows back on the stream in
   priority order, as many as the caps have room for. They then take the normal path below, so the ack, the
   crash replay and the idempotency are the same as for a new entry.
6. **Ack after persist:** the entry is XACKed only after the run's transaction (which also writes the
   feed row) committed. A crash before that leaves the entry pending; on restart the consumer reads its
   own pending entries first (`XREADGROUP … 0`) and claims stale ones of dead consumers (`XAUTOCLAIM`).
   A row found `running` is resumed (from its checkpoint with CHECKPOINTER=postgres) without counting
   against the hourly cap again. A run that keeps failing is marked `failed` after `MAX_ATTEMPTS` and
   parked on the dead-letter stream `kaptan:kap.dlq` (re-drive: `python -m kaptan.ops.dlq redrive`).

Run one replica (`python -m kaptan.workers.agent_worker`).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from redis.exceptions import RedisError, ResponseError

from kaptan.agents import db as q
from kaptan.agents.context import Restriction
from kaptan.agents.feed_queue import Waiting, cap_reason, entry_window_open, pick_redrive, split_waiting, unrun_reason
from kaptan.agents.feed_run import LiveResult
from kaptan.agents.nodes.screen import _veto_reasons
from kaptan.ingest.publish import AGENT_STREAM, AGENT_STREAM_MAXLEN
from kaptan.ingest.subject_routes import DETAIL_ROUTES
from kaptan.llm.budget import DayUsage
from kaptan.text.turkish import IST

log = logging.getLogger("kaptan.agents.feed")

GROUP: Final = "agent-worker"
AGENT_ROUTES: Final = DETAIL_ROUTES
MAX_ATTEMPTS: Final = 3
TERMINAL: Final = frozenset({"done", "waiting_approval", "skipped", "window_closed", "expired_unrun", "failed"})
NEVER_RAN: Final = -1  # no feed row has this index: count every run against the caps
HOUR: Final = timedelta(hours=1)

DISCLOSURE_SQL: Final = """
SELECT d.origin, d.ingest_source, d.subject_route, d.primary_ticker, d.reason, d.published_at,
       EXISTS (SELECT 1 FROM core.disclosure_texts t WHERE t.disclosure_index = d.disclosure_index
                AND t.lang = 'tr' AND length(t.body) > 0)
       AND NOT EXISTS (SELECT 1 FROM ops.attachment_fetch_queue a WHERE a.disclosure_index = d.disclosure_index
                        AND a.status IN ('queued', 'running')) AS has_text
  FROM core.disclosures d WHERE d.disclosure_index = %s
"""
FEED_ROW_SQL: Final = "SELECT status, attempts, reason FROM ops.agent_feed WHERE disclosure_index = %s"
WAITING_SQL: Final = """
SELECT f.disclosure_index, f.status, f.reason, d.subject_route, d.published_at,
       coalesce(i.in_universe, false) AS in_universe,
       EXISTS (SELECT 1 FROM core.disclosure_texts t WHERE t.disclosure_index = d.disclosure_index
                AND t.lang = 'tr' AND length(t.body) > 0)
       AND NOT EXISTS (SELECT 1 FROM ops.attachment_fetch_queue a WHERE a.disclosure_index = d.disclosure_index
                        AND a.status IN ('queued', 'running')) AS has_text
  FROM ops.agent_feed f
  JOIN core.disclosures d ON d.disclosure_index = f.disclosure_index
  LEFT JOIN core.issuers i ON i.ticker = d.primary_ticker
 WHERE f.status IN ('deferred', 'awaiting_text', 'running')
"""
MARK_SQL: Final = """
INSERT INTO ops.agent_feed (disclosure_index, status, reason, stream_id, seen_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (disclosure_index) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason,
       updated_at = EXCLUDED.updated_at
"""
START_SQL: Final = """
INSERT INTO ops.agent_feed (disclosure_index, status, stream_id, seen_at, started_at, attempts, updated_at)
VALUES (%(idx)s, 'running', %(sid)s, %(now)s, %(now)s, 1, %(now)s)
ON CONFLICT (disclosure_index) DO UPDATE SET status = 'running', reason = NULL,
       started_at = coalesce(ops.agent_feed.started_at, %(now)s), attempts = ops.agent_feed.attempts + 1,
       updated_at = %(now)s
RETURNING attempts
"""
SPENT_SQL: Final = """
SELECT count(*) AS n FROM ops.agent_feed
 WHERE started_at > %s AND (status = 'running' OR llm_calls > 0) AND disclosure_index <> %s
"""
HOLD_REASON_SQL: Final = "UPDATE ops.agent_feed SET reason = %s WHERE disclosure_index = %s"
#: The chain ran dry during the run: it HOLDs (05 §2.4), and the row says that was the quota, not the disclosure.
QUOTA_HOLD: Final = "HOLD:llm_quota"
FAIL_SQL: Final = (
    "UPDATE ops.agent_feed SET status = 'failed', reason = %s, updated_at = %s WHERE disclosure_index = %s"
)
#: Dead letters: entries whose run failed MAX_ATTEMPTS times (re-drive: `python -m kaptan.ops.dlq`).
DLQ_STREAM: Final = "kaptan:kap.dlq"
DLQ_MAXLEN: Final = 10_000


async def dead_letter(redis: Any, index: int, stream_id: str | None, reason: str, attempts: int, at: datetime) -> None:
    """Park a failed entry on `kaptan:kap.dlq` (never raises: the feed row already says `failed`)."""
    fields = {
        "disclosure_index": str(index),
        "stream_id": stream_id or "",
        "reason": reason,
        "attempts": str(attempts),
        "failed_at": at.isoformat(),
    }
    try:
        await redis.xadd(DLQ_STREAM, fields, maxlen=DLQ_MAXLEN, approximate=True)
    except (RedisError, OSError) as exc:
        log.error("disclosure %s: dead letter not written (%s); feed row is failed", index, type(exc).__name__)


Runner = Callable[[Any, int, datetime], Awaitable[LiveResult]]
BudgetCheck = Callable[[], Awaitable[bool]]
Settle = Callable[[datetime], Awaitable[int]]


@dataclass(frozen=True, slots=True)
class FeedConfig:
    max_runs_per_hour: int = 25
    #: Runs that reached an LLM per Istanbul calendar day; 0 = no daily cap (only the hourly one).
    max_runs_per_day: int = 70
    consumer: str = "worker-1"
    count: int = 10
    block_ms: int = 1_000
    settle_every_s: float = 60.0
    claim_idle_ms: int = 5 * 60 * 1000


@dataclass(frozen=True, slots=True)
class Handled:
    index: int
    status: str  # the feed row's status after handling (or "missing" / "duplicate")
    ack: bool
    reason: str | None = None
    run_id: str | None = None


@dataclass(frozen=True, slots=True)
class Swept:
    expired: int
    redriven: tuple[int, ...]


def scope_reason(row: dict[str, Any]) -> str | None:
    """None = in scope; otherwise why the disclosure starts no run."""
    if row["origin"] != "kap":
        return "not_kap"
    if row["ingest_source"] == "backfill":
        return "backfill"
    if row.get("reason") == "CORR":  # 06 §3: a "Düzeltme" is not a new event (S0, no LLM run)
        return "correction"
    if row["subject_route"] not in AGENT_ROUTES:
        return f"route:{row['subject_route']}"
    if not row["primary_ticker"]:
        return "no_ticker"
    return None


def _waiting(row: dict[str, Any]) -> Waiting:
    return Waiting(
        index=int(row["disclosure_index"]),
        status=str(row["status"]),
        reason=row["reason"],
        route=str(row["subject_route"]),
        published_at=row["published_at"],
        in_universe=bool(row["in_universe"]),
        has_text=bool(row["has_text"]),
    )


def istanbul_midnight(now: datetime) -> datetime:
    """00:00 Europe/Istanbul of `now`'s Istanbul day, as an aware datetime (the daily cap's window start)."""
    local = now.astimezone(IST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


async def _one(conn: Any, sql: str, params: Any) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def llm_budget_left(provider: Any) -> bool:
    """False when every live provider of the chain is over one of today's caps (replay: always True)."""
    budget = getattr(provider, "budget", None)
    names: tuple[str, ...] = tuple(getattr(provider, "available", ()))
    if budget is None or not names:
        return True
    return any(_usable(usage) for usage in await budget.snapshot(names))


def _usable(usage: DayUsage) -> bool:
    caps = usage.caps
    return not (
        usage.exhausted
        or (caps.requests_per_day is not None and usage.requests >= caps.requests_per_day)
        or (caps.tokens_per_day is not None and usage.tokens >= caps.tokens_per_day)
        or (caps.usd_per_day is not None and usage.cost_usd >= caps.usd_per_day)
    )


async def _pre_gate_vetoes(conn: Any, ticker: str) -> bool:
    """The graph's pre-gate decision, read before any budget is asked for (its run costs no LLM call)."""
    try:
        in_universe = bool((await q.issuer(conn, ticker))["in_universe"])
    except LookupError:
        in_universe = False
    restrictions = tuple(Restriction(r["kind"], r["source_ref"]) for r in await q.restrictions(conn, ticker))
    return _veto_reasons(restrictions, in_universe) is not None


class AgentFeed:
    def __init__(
        self,
        pool: Any,
        redis: Any,
        runner: Runner,
        cfg: FeedConfig | None = None,
        *,
        budget_ok: BudgetCheck | None = None,
        settle: Settle | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.pool = pool
        self.redis = redis
        self.runner = runner
        self.cfg = cfg or FeedConfig()
        self.budget_ok = budget_ok
        self.settle = settle
        self.now = now
        #: Re-driven rows still on the stream: a slow consumer must not get them queued again every minute.
        self._queued: frozenset[int] = frozenset()

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(AGENT_STREAM, GROUP, id="0", mkstream=True)
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def _mark(self, conn: Any, index: int, status: str, reason: str | None, sid: str | None) -> Handled:
        now = self.now()
        async with conn.transaction():
            await conn.execute(MARK_SQL, (index, status, reason, sid, now, now))
        return Handled(index, status, ack=True, reason=reason)

    async def _spent(self, conn: Any, index: int) -> tuple[int, int]:
        """Runs against the caps in the rolling hour and in the Istanbul day, this row's own run not counted."""
        now = self.now()
        hour = await _one(conn, SPENT_SQL, (now - HOUR, index))
        day = await _one(conn, SPENT_SQL, (istanbul_midnight(now), index))
        return int((hour or {}).get("n", 0)), int((day or {}).get("n", 0))

    async def _over_cap(self, conn: Any, index: int, route: str) -> str | None:
        spent_hour, spent_day = await self._spent(conn, index)
        capped = cap_reason(route, spent_hour, spent_day, self.cfg.max_runs_per_hour, self.cfg.max_runs_per_day)
        if capped is not None:
            return capped
        if self.budget_ok is not None and not await self.budget_ok():
            return "llm_daily_cap"
        return None

    async def _window_closed(self, conn: Any, index: int, feed: dict[str, Any] | None, disc: dict[str, Any],
                             stream_id: str | None) -> Handled:  # fmt: skip
        if feed is None:
            return await self._mark(conn, index, "window_closed", "arrived_after_window", stream_id)
        reason = unrun_reason(feed["status"], feed["reason"], bool(disc["has_text"]))
        return await self._mark(conn, index, "expired_unrun", reason, stream_id)

    async def handle(self, index: int, stream_id: str | None = None) -> Handled:
        """Decide and (maybe) run one disclosure. `ack` says whether the stream entry is done with."""
        async with self.pool.connection() as conn:
            disc = await _one(conn, DISCLOSURE_SQL, (index,))
            feed = await _one(conn, FEED_ROW_SQL, (index,))
            await conn.commit()
            if disc is None:
                return Handled(index, "missing", ack=True, reason="no such disclosure")
            if feed is not None and feed["status"] in TERMINAL:
                return Handled(index, "duplicate", ack=True, reason=feed["status"])
            reason = scope_reason(disc)
            if reason is not None:
                return await self._mark(conn, index, "skipped", reason, stream_id)
            if not entry_window_open(disc["published_at"], self.now()):
                return await self._window_closed(conn, index, feed, disc, stream_id)
            if not disc["has_text"]:
                return await self._mark(conn, index, "awaiting_text", None, stream_id)
            resuming = feed is not None and feed["status"] == "running"
            if not resuming and not await _pre_gate_vetoes(conn, str(disc["primary_ticker"])):
                capped = await self._over_cap(conn, index, str(disc["subject_route"]))
                await conn.commit()
                if capped is not None:
                    log.info("disclosure %s deferred: %s", index, capped)
                    return await self._mark(conn, index, "deferred", capped, stream_id)
            await conn.commit()
            return await self._run(conn, index, stream_id)

    async def _run(self, conn: Any, index: int, stream_id: str | None) -> Handled:
        now = self.now()
        async with conn.transaction():
            started = await _one(conn, START_SQL, {"idx": index, "sid": stream_id, "now": now})
        attempts = int((started or {}).get("attempts", 1))
        try:
            result = await self.runner(conn, index, now)
        except Exception as exc:
            await conn.rollback()
            if attempts >= MAX_ATTEMPTS:
                log.exception("run of disclosure %s failed %d times; giving up", index, attempts)
                async with conn.transaction():
                    await conn.execute(FAIL_SQL, (f"{type(exc).__name__}", self.now(), index))
                await dead_letter(self.redis, index, stream_id, type(exc).__name__, attempts, self.now())
                return Handled(index, "failed", ack=True, reason=type(exc).__name__)
            log.exception("run of disclosure %s failed (attempt %d); left pending", index, attempts)
            return Handled(index, "running", ack=False, reason=type(exc).__name__)
        reason = result.outcome
        if reason == "HOLD" and self.budget_ok is not None and not await self.budget_ok():
            reason = QUOTA_HOLD
            async with conn.transaction():
                await conn.execute(HOLD_REASON_SQL, (reason, index))
        return Handled(index, result.feed_status, ack=True, reason=reason, run_id=result.run_id)

    async def process(self, entries: list[tuple[str, dict[str, str]]]) -> list[Handled]:
        out: list[Handled] = []
        for entry_id, fields in entries:
            try:
                index = int(fields.get("disclosure_index", ""))
            except ValueError:
                log.warning("feed entry %s without a disclosure index; dropped", entry_id)
                await self.redis.xack(AGENT_STREAM, GROUP, entry_id)
                continue
            self._queued = self._queued - {index}
            handled = await self.handle(index, entry_id)
            if handled.ack:
                await self.redis.xack(AGENT_STREAM, GROUP, entry_id)
            out.append(handled)
        return out

    async def _read(self, start: str, block: int | None) -> list[tuple[str, dict[str, str]]]:
        reply = await self.redis.xreadgroup(
            GROUP, self.cfg.consumer, {AGENT_STREAM: start}, count=self.cfg.count, block=block
        )
        return [entry for _stream, entries in reply or [] for entry in entries if entry[1] is not None]

    async def replay_pending(self) -> list[Handled]:
        """Own pending entries (a crash before XACK), then stale ones of other consumers."""
        handled: list[Handled] = []
        cursor = "0"
        while True:
            entries = await self._read(cursor, None)
            if not entries:
                break
            cursor = entries[-1][0]  # entries left pending (a failed run) are not read twice in one pass
            handled.extend(await self.process(entries))
        claimed = await self.redis.xautoclaim(
            AGENT_STREAM, GROUP, self.cfg.consumer, self.cfg.claim_idle_ms, "0-0", count=self.cfg.count
        )
        stale = [e for e in (claimed[1] if claimed else []) if e[1] is not None]
        if stale:
            handled.extend(await self.process(stale))
        return handled

    async def read_new(self, block_ms: int | None = None) -> list[Handled]:
        entries = await self._read(">", self.cfg.block_ms if block_ms is None else block_ms)
        return await self.process(entries) if entries else []

    async def sweep(self) -> Swept:
        """End every row whose window has closed; put the best deferred rows the caps have room for on the stream."""
        now = self.now()
        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(WAITING_SQL)
                rows = [_waiting(dict(r)) for r in await cur.fetchall()]
            await conn.commit()
            closed, runnable = split_waiting(rows, now)
            for row, reason in closed:
                await self._mark(conn, row.index, "expired_unrun", reason, None)
            waiting = [r for r in runnable if r.index not in self._queued]
            picked = await self._picks(conn, waiting)
            await conn.commit()
        for row in picked:
            fields = {"disclosure_index": str(row.index), "stage": "deferred"}
            await self.redis.xadd(AGENT_STREAM, fields, maxlen=AGENT_STREAM_MAXLEN, approximate=True)
        redriven = tuple(r.index for r in picked)
        self._queued = self._queued | set(redriven)
        return Swept(len(closed), redriven)

    async def _picks(self, conn: Any, waiting: list[Waiting]) -> tuple[Waiting, ...]:
        if not waiting or (self.budget_ok is not None and not await self.budget_ok()):
            return ()
        hour, day = await self._spent(conn, NEVER_RAN)
        return pick_redrive(waiting, hour, day, self.cfg.max_runs_per_hour, self.cfg.max_runs_per_day, self.cfg.count)

    async def _housekeeping(self) -> None:
        if self.settle is not None:
            closed = await self.settle(self.now())
            if closed:
                log.info("settled %d runs waiting on approval", closed)
        await self.replay_pending()
        swept = await self.sweep()
        if swept.expired or swept.redriven:
            log.info("feed sweep: %d expired unrun, %d re-driven", swept.expired, len(swept.redriven))

    async def run(self, stop: asyncio.Event) -> None:
        """The worker loop: replay what a previous process left, then new entries; housekeeping every minute."""
        await self.ensure_group()
        await self._housekeeping()
        loop = asyncio.get_running_loop()
        next_house = loop.time() + self.cfg.settle_every_s
        while not stop.is_set():
            try:
                await self.read_new()
                if loop.time() >= next_house:
                    next_house = loop.time() + self.cfg.settle_every_s
                    await self._housekeeping()
            except (RedisError, OSError) as exc:
                log.warning("agent feed: redis error %s: %s", type(exc).__name__, exc)
                await asyncio.sleep(1.0)
            except Exception:  # a bug must not kill the worker; pending entries are retried later
                log.exception("agent feed loop crashed; continuing")
                await asyncio.sleep(1.0)
