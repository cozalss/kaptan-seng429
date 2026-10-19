"""The KAP → agent feed against Postgres + Redis with fake disclosures (no KAP, replay LLM).

A fake "live" KAP row that carries the demo E3 text and ticker gets the recorded replay answers, so
the whole graph runs for real and ends at a pending card, like an injected demo run.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from itertools import count
from typing import Any

import pytest
import redis.asyncio as aioredis
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.feed import GROUP, AgentFeed, FeedConfig, llm_budget_left
from kaptan.agents.feed_run import LiveDeps, LiveResult, decision_for, run_disclosure, run_id_for, settle_waiting
from kaptan.agents.tools import ReplayToolbox
from kaptan.db import DictConn, create_pool
from kaptan.demo.seed import SeedResult
from kaptan.events import bus
from kaptan.ingest.publish import AGENT_STREAM, publish_to_agents, sent_key
from kaptan.llm.budget import Budget, Caps
from kaptan.llm.replay import ReplayProvider
from kaptan.llm.store import MemoryStore
from kaptan.runs.explain import explain_for
from kaptan.settings import Settings
from kaptan.workers import agent_worker
from tests.conftest import reseed_test_db, skip_or_fail
from tests.unit.agent_fixtures import fixture_run

pytestmark = pytest.mark.integration

E3 = fixture_run("run-demo-e3-ornek")["explain"]
E3_TICKER: str = E3["disclosure"]["primary_ticker"]
E3_TEXT: str = next(t["body"] for t in E3["texts"] if t["lang"] == "tr")
NOW = datetime.now(UTC).replace(microsecond=0)
_ids = count(990_000_001)

INSERT_SQL = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, primary_ticker, company_name,
  disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,
  first_seen_at, available_at, ingest_source, origin, visible)
VALUES (%s, %s, %s, %s, %s, 'ODA', 'ODA', %s, %s, 'NEW', %s, 'subject_map.v1', %s, %s, %s, %s, 'kap', true)
"""


@pytest.fixture(scope="module")
async def feed_db(seeded: SeedResult, migrated: Settings) -> AsyncIterator[AsyncConnectionPool[DictConn]]:
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=3)
    await pool.open(wait=True)
    try:
        yield pool
    finally:
        await pool.close()
        await reseed_test_db(migrated)  # live runs, cards and audit rows must not leak into parity tests


@pytest.fixture
async def redis(migrated: Settings) -> AsyncIterator[aioredis.Redis]:
    client = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await client.ping()
    except Exception as exc:
        skip_or_fail(f"redis unreachable: {exc}")
    await client.delete(AGENT_STREAM)
    yield client
    await client.delete(AGENT_STREAM)
    await client.aclose()


async def add_disclosure(
    pool: AsyncConnectionPool[DictConn],
    *,
    route: str = "E3",
    subject: str = "Yeni İş İlişkisi",
    ticker: str | None = E3_TICKER,
    text: str | None = E3_TEXT,
    source: str = "live",
) -> int:
    idx = next(_ids)
    pub = NOW - timedelta(minutes=5)
    params = (
        idx,
        f"{idx:032x}",
        [ticker] if ticker else [],
        ticker,
        "Test A.Ş.",
        subject,
        subject,
        route,
        pub,
        pub,
        pub,
        source,
    )
    async with pool.connection() as conn:
        await conn.execute(INSERT_SQL, params)
        if text is not None:
            await conn.execute(
                "INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)", (idx, text)
            )
        await conn.commit()
    return idx


async def add_text(pool: AsyncConnectionPool[DictConn], idx: int, text: str = E3_TEXT) -> None:
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)",
                           (idx, text))  # fmt: skip
        await conn.commit()


async def one(pool: AsyncConnectionPool[DictConn], sql: str, *args: Any) -> dict[str, Any] | None:
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(sql, args or None)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def feed_row(pool: AsyncConnectionPool[DictConn], idx: int) -> dict[str, Any] | None:
    return await one(pool, "SELECT * FROM ops.agent_feed WHERE disclosure_index = %s", idx)


def deps(redis: Any = None) -> LiveDeps:
    return LiveDeps(provider=ReplayProvider(), tools=ReplayToolbox(), redis=redis)


def real_feed(pool: Any, redis: aioredis.Redis, **cfg: Any) -> AgentFeed:
    d = deps(redis)

    async def runner(conn: Any, index: int, now: datetime) -> LiveResult:
        return await run_disclosure(conn, index, now, d)

    return AgentFeed(pool, redis, runner, FeedConfig(block_ms=200, **cfg), now=lambda: NOW)


class FakeRunner:
    """Records calls; persists the way run_disclosure does (feed row with its LLM calls), or crashes."""

    def __init__(self, *, crash: int = 0, llm_calls: int = 3) -> None:
        self.calls: list[int] = []
        self.crash = crash
        self.llm_calls = llm_calls

    async def __call__(self, conn: Any, index: int, now: datetime) -> LiveResult:
        self.calls.append(index)
        if self.crash > 0:
            self.crash -= 1
            raise RuntimeError("worker killed mid-run")
        async with conn.transaction():
            await conn.execute(
                "UPDATE ops.agent_feed SET status = 'done', llm_calls = %s, run_id = %s WHERE disclosure_index = %s",
                (self.llm_calls, run_id_for(index), index),
            )
        return LiveResult(run_id_for(index), "done", "NO_TRADE", self.llm_calls, {})


async def pending(redis: aioredis.Redis) -> int:
    info = await redis.xpending(AGENT_STREAM, GROUP)
    return int(info["pending"])


async def test_producer_is_idempotent_per_index_and_stage(redis: aioredis.Redis) -> None:
    idx = next(_ids)
    await redis.delete(sent_key(idx, "listed"), sent_key(idx, "text"))
    assert await publish_to_agents(redis, [idx, idx]) == 1
    assert await publish_to_agents(redis, [idx]) == 0  # a later poll/reconcile of the same row
    assert await publish_to_agents(redis, [idx], stage="text") == 1
    entries = await redis.xrange(AGENT_STREAM)
    assert [(f["disclosure_index"], f["stage"]) for _id, f in entries] == [(str(idx), "listed"), (str(idx), "text")]
    with pytest.raises(ValueError, match="stage"):
        await publish_to_agents(redis, [idx], stage="other")


async def test_out_of_scope_rows_are_skipped_without_a_run(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    runner = FakeRunner()
    feed = AgentFeed(feed_db, redis, runner, FeedConfig(block_ms=200), now=lambda: NOW)
    cases = {
        await add_disclosure(feed_db, route="noise", subject="Pay Bazında Devre Kesici Bildirimi"): "route:noise",
        await add_disclosure(feed_db, route="archive_only", subject="Genel Kurul"): "route:archive_only",
        await add_disclosure(feed_db, source="backfill"): "backfill",
        await add_disclosure(feed_db, ticker=None): "no_ticker",
    }
    for idx, reason in cases.items():
        handled = await feed.handle(idx)
        assert (handled.status, handled.reason, handled.ack) == ("skipped", reason, True)
        row = await feed_row(feed_db, idx)
        assert row is not None and (row["status"], row["reason"]) == ("skipped", reason)
    assert runner.calls == []
    assert (await feed.handle(1)).status == "missing"
    demo_idx = await one(feed_db, "SELECT min(disclosure_index) AS i FROM core.disclosures WHERE origin = 'demo'")
    assert demo_idx is not None
    assert (await feed.handle(int(demo_idx["i"]))).reason == "not_kap"


async def test_a_live_disclosure_becomes_a_panel_run_once(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    idx = await add_disclosure(feed_db)
    feed = real_feed(feed_db, redis)
    await feed.ensure_group()
    await redis.delete(sent_key(idx, "listed"))
    assert await publish_to_agents(redis, [idx]) == 1
    handled = await feed.read_new()
    run_id = run_id_for(idx)
    assert [(h.index, h.status, h.run_id) for h in handled] == [(idx, "waiting_approval", run_id)]
    assert await pending(redis) == 0  # acknowledged after the commit

    run = await one(feed_db, "SELECT run_set, mode, kind, status, visible FROM trading.agent_runs WHERE run_id = %s",
                    run_id)  # fmt: skip
    assert run == {"run_set": "live", "mode": "paper", "kind": "propose", "status": "interrupted", "visible": True}
    disc = await one(feed_db, "SELECT run_id FROM core.disclosures WHERE disclosure_index = %s", idx)
    assert disc == {"run_id": run_id}
    card = await one(feed_db, "SELECT proposal_id, status FROM trading.approvals WHERE run_id = %s", run_id)
    assert card == {"proposal_id": f"prop-live-{idx}", "status": "pending"}
    async with feed_db.connection() as conn:
        doc = await explain_for(conn, run_id, now=NOW, wall=NOW)
    assert doc is not None and doc["approval"]["status"] == "pending" and doc["run"]["mode"] == "paper"
    audits = await one(feed_db, "SELECT count(*) AS n FROM audit.audit_log WHERE entity_id = %s", f"prop-live-{idx}")
    assert audits == {"n": 1}
    events = [f["event"] for _id, f in await redis.xrange(bus.stream_key("desk"))][-5:]
    assert "approval.requested" in events

    # Duplicates (a second entry, a redelivery, the text stage) never start a second run.
    assert await publish_to_agents(redis, [idx], stage="text") in (0, 1)
    again = await feed.read_new()
    assert all(h.status == "duplicate" for h in again)
    assert (await feed.handle(idx)).status == "duplicate"
    runs = await one(feed_db, "SELECT count(*) AS n FROM trading.agent_runs WHERE disclosure_index = %s", idx)
    assert runs == {"n": 1}
    audits = await one(feed_db, "SELECT count(*) AS n FROM audit.audit_log WHERE entity_id = %s", f"prop-live-{idx}")
    assert audits == {"n": 1}


async def test_waits_for_the_text_then_runs(feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis) -> None:
    runner = FakeRunner()
    feed = AgentFeed(feed_db, redis, runner, FeedConfig(block_ms=200), now=lambda: NOW)
    idx = await add_disclosure(feed_db, text=None)
    first = await feed.handle(idx)
    assert (first.status, first.ack) == ("awaiting_text", True)
    await add_text(feed_db, idx)
    second = await feed.handle(idx)
    assert second.status == "done" and runner.calls == [idx]


async def test_hourly_cap_and_llm_daily_cap(feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis) -> None:
    async with feed_db.connection() as conn:
        await conn.execute("UPDATE ops.agent_feed SET started_at = %s", (NOW - timedelta(hours=2),))  # earlier tests
        await conn.commit()
    runner = FakeRunner()
    feed = AgentFeed(feed_db, redis, runner, FeedConfig(max_runs_per_hour=1), now=lambda: NOW)
    a, b = await add_disclosure(feed_db), await add_disclosure(feed_db)
    assert (await feed.handle(a)).status == "done"
    capped = await feed.handle(b)
    assert (capped.status, capped.reason, capped.ack) == ("capped", "hourly_cap", True)
    assert runner.calls == [a]

    # A run that made no LLM call (e.g. a pre-gate veto) does not use up the hour.
    cheap = FakeRunner(llm_calls=0)
    feed0 = AgentFeed(feed_db, redis, cheap, FeedConfig(max_runs_per_hour=2), now=lambda: NOW + timedelta(hours=2))
    c, d = await add_disclosure(feed_db), await add_disclosure(feed_db)
    assert [(await feed0.handle(i)).status for i in (c, d)] == ["done", "done"]

    async def broke() -> bool:
        return False

    later = AgentFeed(feed_db, redis, FakeRunner(), budget_ok=broke, now=lambda: NOW + timedelta(hours=5))
    e = await add_disclosure(feed_db)
    assert (await later.handle(e)).reason == "llm_daily_cap"
    off = AgentFeed(feed_db, redis, FakeRunner(), FeedConfig(max_runs_per_hour=0), now=lambda: NOW)
    assert (await off.handle(await add_disclosure(feed_db))).reason == "hourly_cap"


async def test_unacked_entry_is_replayed_after_a_crash(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    idx = await add_disclosure(feed_db)
    crashing = FakeRunner(crash=1)
    first = AgentFeed(feed_db, redis, crashing, FeedConfig(block_ms=200), now=lambda: NOW + timedelta(hours=9))
    await first.ensure_group()
    await redis.delete(sent_key(idx, "listed"))
    await publish_to_agents(redis, [idx])
    handled = await first.read_new()
    assert [(h.status, h.ack) for h in handled] == [("running", False)]
    assert await pending(redis) == 1
    assert (await feed_row(feed_db, idx) or {})["status"] == "running"

    # "Restart": a new process (same consumer name) replays its pending entry first. The resumed run is
    # not counted against the hour again (max 0 would cap any new run).
    healthy = FakeRunner()
    second = AgentFeed(feed_db, redis, healthy, FeedConfig(max_runs_per_hour=0), now=lambda: NOW + timedelta(hours=9))
    replayed = await second.replay_pending()
    assert [(h.index, h.status, h.ack) for h in replayed] == [(idx, "done", True)]
    assert healthy.calls == [idx] and await pending(redis) == 0
    row = await feed_row(feed_db, idx)
    assert row is not None and row["attempts"] == 2


async def test_crash_after_commit_before_ack_does_not_rerun(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    idx = await add_disclosure(feed_db)
    runner = FakeRunner()
    feed = AgentFeed(feed_db, redis, runner, FeedConfig(block_ms=200), now=lambda: NOW + timedelta(hours=12))
    await feed.ensure_group()
    await redis.delete(sent_key(idx, "listed"))
    await publish_to_agents(redis, [idx])
    entries = await feed._read(">", 200)  # delivered …
    assert (await feed.handle(idx)).status == "done"  # … persisted, then the process died before XACK
    assert await pending(redis) == 1 and len(entries) == 1
    replayed = await feed.replay_pending()
    assert [(h.status, h.ack) for h in replayed] == [("duplicate", True)]
    assert runner.calls == [idx] and await pending(redis) == 0


async def test_a_run_that_keeps_failing_is_marked_failed(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    idx = await add_disclosure(feed_db)
    feed = AgentFeed(feed_db, redis, FakeRunner(crash=5), now=lambda: NOW + timedelta(hours=15))
    statuses = [(await feed.handle(idx)).status for _ in range(3)]
    assert statuses == ["running", "running", "failed"]
    row = await feed_row(feed_db, idx)
    assert row is not None and (row["status"], row["reason"]) == ("failed", "RuntimeError")
    await redis.xadd(AGENT_STREAM, {"stage": "listed"})  # an entry without an index is dropped
    await feed.ensure_group()
    assert await feed.read_new(200) == []


async def test_parked_runs_are_settled_after_expiry(feed_db: AsyncConnectionPool[DictConn]) -> None:
    idx = await add_disclosure(feed_db)
    d = deps()
    later = NOW + timedelta(hours=20)
    async with feed_db.connection() as conn:
        await conn.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, started_at) VALUES (%s, 'running', %s)", (idx, later)
        )
        await conn.commit()
        result = await run_disclosure(conn, idx, later, d)
    assert result.feed_status == "waiting_approval"
    async with feed_db.connection() as conn:  # every parked card open for another hour (no clock dependence)
        await conn.execute("UPDATE trading.approvals SET expires_at = %s WHERE run_id LIKE 'run-live-%%'",
                           (later + timedelta(hours=1),))  # fmt: skip
        await conn.commit()
    assert await settle_waiting(feed_db, d, later) == 0  # cards still open
    async with feed_db.connection() as conn:
        await conn.execute(
            "UPDATE trading.approvals SET expires_at = %s WHERE run_id = %s",
            (later - timedelta(minutes=1), result.run_id),
        )
        await conn.commit()
    assert await settle_waiting(feed_db, d, later) == 1
    card = await one(feed_db, "SELECT status FROM trading.approvals WHERE run_id = %s", result.run_id)
    run = await one(feed_db, "SELECT status FROM trading.agent_runs WHERE run_id = %s", result.run_id)
    row = await feed_row(feed_db, idx)
    assert card == {"status": "expired"} and run == {"status": "completed"}
    assert row is not None and (row["status"], row["reason"]) == ("done", "expire")


def test_decision_for_cards() -> None:
    base = {"approved_notional_try": None, "decision_comment": None, "expires_at": NOW + timedelta(hours=1)}
    assert decision_for({**base, "status": "pending"}, NOW) is None
    assert decision_for({**base, "status": "pending"}, NOW + timedelta(hours=2)) == {"decision": "expire"}
    assert decision_for({**base, "status": "cancelled"}, NOW) == {"decision": "expire"}
    assert decision_for({**base, "status": "rejected", "decision_comment": "Hayır"}, NOW) == {
        "decision": "reject",
        "approved_notional_try": None,
        "comment": "Hayır",
    }
    assert decision_for({**base, "status": "approved", "approved_notional_try": 1000.0}, NOW) == {
        "decision": "approve",
        "approved_notional_try": 1000.0,
        "comment": "",
    }


async def test_llm_budget_left_reads_the_daily_caps() -> None:
    assert await llm_budget_left(ReplayProvider()) is True

    class Live:
        def __init__(self, budget: Budget) -> None:
            self.budget = budget
            self.available = ("gemini", "groq")

    budget = Budget(MemoryStore(), {"gemini": Caps(requests_per_day=1), "groq": Caps(requests_per_day=1)})
    live = Live(budget)
    assert await llm_budget_left(live) is True
    await budget.reserve("gemini")
    assert await llm_budget_left(live) is True
    await budget.mark_exhausted("groq")
    assert await llm_budget_left(live) is False
    assert await llm_budget_left(object()) is True  # no budget attribute


async def test_worker_loop_processes_entries_and_settles(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    runner = FakeRunner()
    settled: list[datetime] = []

    async def settle(now: datetime) -> int:
        settled.append(now)
        return 1

    feed = AgentFeed(
        feed_db, redis, runner, FeedConfig(block_ms=50, settle_every_s=0.0), settle=settle,
        now=lambda: NOW + timedelta(hours=30),
    )  # fmt: skip
    idx = await add_disclosure(feed_db)
    await redis.delete(sent_key(idx, "listed"))
    await publish_to_agents(redis, [idx])
    stop = asyncio.Event()
    task = asyncio.create_task(feed.run(stop))
    for _ in range(100):
        if runner.calls:
            break
        await asyncio.sleep(0.05)
    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert runner.calls == [idx] and len(settled) >= 2 and await pending(redis) == 0


async def test_worker_entrypoint_gates_and_starts(migrated: Settings) -> None:
    assert await agent_worker.run_worker(migrated.model_copy(update={"kap_live": False})) == 0
    assert await agent_worker.run_worker(migrated.model_copy(update={"kap_live": True, "demo_mode": True})) == 0
    stop = asyncio.Event()
    stop.set()  # start, replay/settle once, stop
    live = migrated.model_copy(update={"kap_live": True, "demo_mode": False, "llm_mode": "replay"})
    assert await agent_worker.run_worker(live, stop) == 0
