"""No disclosure lost to the cap: closed windows, deferred rows, re-drives and the day's counts (Postgres + Redis)."""

from __future__ import annotations

import importlib.util
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
import redis.asyncio as aioredis
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.feed import AgentFeed, FeedConfig
from kaptan.agents.feed_run import LiveResult, run_disclosure, run_id_for
from kaptan.db import DictConn, connect
from kaptan.disclosures.counters import day_counters
from kaptan.ingest.publish import AGENT_STREAM, publish_to_agents, sent_key
from kaptan.prices.calendar import IST
from kaptan.settings import Settings
from tests.integration.test_feed import (
    E3_TICKER,
    NOW,
    FakeRunner,
    add_disclosure,
    deps,
    feed_db,  # noqa: F401 - pytest fixture
    feed_row,
    one,
    pending,
    real_feed,
    redis,  # noqa: F401 - pytest fixture
)

pytestmark = pytest.mark.integration

MON_11 = datetime(2027, 2, 1, 11, 0, tzinfo=IST)  # window: until Tuesday 09:55
MON_12 = MON_11 + timedelta(hours=1)
TUE_11 = MON_11 + timedelta(days=1)  # Monday 11:00's window has closed

Pool = AsyncConnectionPool[DictConn]


@pytest.fixture(autouse=True)
async def clean_slate(feed_db: Pool) -> AsyncIterator[None]:  # noqa: F811
    """Earlier tests' runs must not count against this test's caps; nothing of theirs is left waiting."""
    async with feed_db.connection() as conn:
        await conn.execute("DELETE FROM ops.agent_feed WHERE status IN ('deferred', 'awaiting_text', 'running')")
        await conn.execute("UPDATE ops.agent_feed SET started_at = '2000-01-01' WHERE started_at IS NOT NULL")
        await conn.commit()
    yield


def feed_at(pool: Pool, redis: aioredis.Redis, at: datetime, runner: Any, **cfg: Any) -> AgentFeed:  # noqa: F811
    budget_ok = cfg.pop("budget_ok", None)
    return AgentFeed(pool, redis, runner, FeedConfig(block_ms=50, **cfg), budget_ok=budget_ok, now=lambda: at)


async def publish(redis: aioredis.Redis, feed: AgentFeed, *indices: int) -> None:  # noqa: F811
    await feed.ensure_group()
    for idx in indices:
        await redis.delete(sent_key(idx, "listed"))
    await publish_to_agents(redis, list(indices))


async def status_of(pool: Pool, idx: int) -> tuple[str, str | None]:
    row = await feed_row(pool, idx)
    assert row is not None
    return row["status"], row["reason"]


async def test_restart_with_a_backlog_spends_nothing_on_closed_windows(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    stale = [await add_disclosure(feed_db, pub=MON_11) for _ in range(4)]
    fresh = await add_disclosure(feed_db, pub=TUE_11 - timedelta(minutes=5))
    runner = FakeRunner()
    feed = feed_at(feed_db, redis, TUE_11, runner, max_runs_per_hour=1)
    await publish(redis, feed, *stale, fresh)

    handled = await feed.read_new()

    assert runner.calls == [fresh]  # the one slot went to the row that can still trade, not the backlog's first
    assert [h.status for h in handled] == ["window_closed"] * 4 + ["done"]
    assert await status_of(feed_db, stale[0]) == ("window_closed", "arrived_after_window")
    assert await pending(redis) == 0
    assert (await feed.handle(stale[0])).status == "duplicate"  # terminal: a redelivery changes nothing


async def test_a_closed_window_and_a_pre_gate_veto_never_count_as_capped(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    feed = real_feed(feed_db, redis, max_runs_per_hour=0)  # every run that would reach a model is blocked
    late = await add_disclosure(feed_db, pub=NOW - timedelta(days=30))
    outside = await add_disclosure(feed_db, ticker="ZZZQ")

    assert (await feed.handle(late)).status == "window_closed"
    handled = await feed.handle(outside)

    row = await feed_row(feed_db, outside)
    assert row is not None and handled.status == "done"
    assert (row["status"], row["reason"], row["llm_calls"]) == ("done", "PREGATE_VETO", 0)


async def test_an_over_cap_row_runs_later_inside_its_window(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    runner = FakeRunner()
    first, second = await add_disclosure(feed_db, pub=MON_11), await add_disclosure(feed_db, pub=MON_11)
    feed = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=1)
    await publish(redis, feed, first, second)
    handled = await feed.read_new()
    assert [(h.status, h.reason, h.ack) for h in handled] == [
        ("done", "NO_TRADE", True),
        ("deferred", "hourly_cap", True),
    ]
    assert (await feed.sweep()).redriven == ()  # still no room this hour

    later = feed_at(feed_db, redis, MON_12 + timedelta(minutes=61), runner, max_runs_per_hour=1)
    assert (await later.sweep()).redriven == (second,)
    assert [h.status for h in await later.read_new()] == ["done"]

    assert runner.calls == [first, second]
    assert await pending(redis) == 0
    assert (await later.sweep()).redriven == ()


async def test_a_flood_of_llm_route_rows_cannot_starve_an_e1(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    runner = FakeRunner()
    flood = [await add_disclosure(feed_db, route="llm", subject="Özel Durum", pub=MON_11) for _ in range(8)]
    e1 = await add_disclosure(feed_db, route="E1", subject="Pay Geri Alımına İlişkin Bildirim", pub=MON_11)
    feed = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=5)

    assert [(await feed.handle(i)).status for i in flood].count("done") == 3  # 60 % of the hour
    assert await status_of(feed_db, flood[-1]) == ("deferred", "hourly_reserved")
    assert (await feed.handle(e1)).status == "done"  # the E1 came last and still ran at once
    assert e1 in runner.calls


async def test_the_redrive_order_puts_the_best_row_first(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    runner = FakeRunner()
    feed = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=0)
    llm = await add_disclosure(feed_db, route="llm", pub=MON_11 + timedelta(minutes=30))
    e3 = await add_disclosure(feed_db, route="E3", pub=MON_11 + timedelta(minutes=20))
    old_e1 = await add_disclosure(feed_db, route="E1", pub=MON_11)
    new_e1 = await add_disclosure(feed_db, route="E1", pub=MON_11 + timedelta(minutes=10))
    for idx in (llm, e3, old_e1, new_e1):
        assert (await feed.handle(idx)).status == "deferred"
    open_again = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=25)
    await open_again.ensure_group()

    assert (await open_again.sweep()).redriven == (new_e1, old_e1, e3, llm)
    entries = await redis.xrange(AGENT_STREAM)
    assert [(f["disclosure_index"], f["stage"]) for _id, f in entries] == [
        (str(i), "deferred") for i in (new_e1, old_e1, e3, llm)
    ]
    assert (await open_again.sweep()).redriven == ()  # already on the stream: not queued a second time
    assert [h.status for h in await open_again.read_new()] == ["done"] * 4
    assert runner.calls == [new_e1, old_e1, e3, llm]


async def test_a_row_whose_window_closes_unrun_ends_expired_with_its_reason(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    runner = FakeRunner()
    capped = await add_disclosure(feed_db, pub=MON_11)
    no_text = await add_disclosure(feed_db, text=None, pub=MON_11)
    orphan = await add_disclosure(feed_db, pub=MON_11)
    feed = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=0)
    assert (await feed.handle(capped)).status == "deferred"
    assert (await feed.handle(no_text)).status == "awaiting_text"
    async with feed_db.connection() as conn:  # its stream entry is gone (a Redis loss)
        await conn.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, started_at) VALUES (%s, 'running', %s)",
            (orphan, MON_11),
        )
        await conn.commit()

    later = feed_at(feed_db, redis, TUE_11, runner, max_runs_per_hour=25)
    await later.ensure_group()
    swept = await later.sweep()

    assert swept.expired == 3 and swept.redriven == ()
    assert await status_of(feed_db, capped) == ("expired_unrun", "hourly_cap")
    assert await status_of(feed_db, no_text) == ("expired_unrun", "no_text")
    assert await status_of(feed_db, orphan) == ("expired_unrun", "interrupted")
    assert runner.calls == []
    assert (await later.handle(capped)).status == "duplicate"
    left = await one(
        feed_db,
        "SELECT count(*) AS n FROM ops.agent_feed f JOIN core.disclosures d USING (disclosure_index)"
        " WHERE d.published_at = %s AND f.status IN ('deferred', 'awaiting_text', 'running')",
        MON_11,
    )
    assert left == {"n": 0}


async def test_a_row_blocked_by_the_llm_budget_defers_then_runs(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    state = {"ok": False}

    async def budget_ok() -> bool:
        return state["ok"]

    runner = FakeRunner()
    idx = await add_disclosure(feed_db, pub=MON_11)
    feed = feed_at(feed_db, redis, MON_12, runner, budget_ok=budget_ok)
    await feed.ensure_group()
    handled = await feed.handle(idx)
    assert (handled.status, handled.reason, handled.ack) == ("deferred", "llm_daily_cap", True)
    assert (await feed.sweep()).redriven == ()
    state["ok"] = True
    assert (await feed.sweep()).redriven == (idx,)
    assert [h.status for h in await feed.read_new()] == ["done"]


async def test_a_run_that_lost_its_models_mid_way_says_so(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    budget = {"ok": True}

    async def budget_ok() -> bool:
        return budget["ok"]

    async def runner(conn: Any, index: int, now: datetime) -> LiveResult:
        budget["ok"] = False  # the day's last request went during this run
        async with conn.transaction():
            await conn.execute(
                "UPDATE ops.agent_feed SET status = 'done', reason = 'HOLD', llm_calls = 2 WHERE disclosure_index = %s",
                (index,),
            )
        return LiveResult(run_id_for(index), "done", "HOLD", 2, {})

    idx = await add_disclosure(feed_db, pub=MON_11)
    feed = feed_at(feed_db, redis, MON_12, runner, budget_ok=budget_ok)
    handled = await feed.handle(idx)
    assert (handled.status, handled.reason) == ("done", "HOLD:llm_quota")
    assert await status_of(feed_db, idx) == ("done", "HOLD:llm_quota")


async def test_restarts_redrive_a_deferred_row_once(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    runner = FakeRunner()
    idx = await add_disclosure(feed_db, pub=MON_11)
    blocked = feed_at(feed_db, redis, MON_12, runner, max_runs_per_hour=0)
    await blocked.ensure_group()
    assert (await blocked.handle(idx)).status == "deferred"

    # Two processes in a row queue it, then die before reading the stream.
    for _ in range(2):
        assert (await feed_at(feed_db, redis, MON_12, runner).sweep()).redriven == (idx,)

    restarted = feed_at(feed_db, redis, MON_12, runner)
    assert [h.status for h in await restarted.read_new()] == ["done", "duplicate"]
    assert runner.calls == [idx] and await pending(redis) == 0


async def test_a_crash_during_a_redriven_run_is_replayed_and_stays_exactly_once(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    idx = await add_disclosure(feed_db, pub=MON_11)
    blocked = feed_at(feed_db, redis, MON_12, FakeRunner(), max_runs_per_hour=0)
    await blocked.ensure_group()
    await blocked.handle(idx)

    crashing = FakeRunner(crash=1)
    first = feed_at(feed_db, redis, MON_12, crashing)
    await first.sweep()
    assert [(h.status, h.ack) for h in await first.read_new()] == [("running", False)]
    assert await pending(redis) == 1

    healthy = FakeRunner()
    second = feed_at(feed_db, redis, MON_12, healthy)
    assert [h.status for h in await second.replay_pending()] == ["done"]
    assert healthy.calls == [idx] and await pending(redis) == 0
    assert (await second.sweep()).redriven == ()


async def test_a_crashed_run_past_its_window_is_not_resumed(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    idx = await add_disclosure(feed_db, pub=MON_11)
    first = feed_at(feed_db, redis, MON_12, FakeRunner(crash=1))
    await publish(redis, first, idx)
    assert [h.status for h in await first.read_new()] == ["running"]

    healthy = FakeRunner()
    restarted = feed_at(feed_db, redis, TUE_11, healthy)
    assert [(h.status, h.reason) for h in await restarted.replay_pending()] == [("expired_unrun", "interrupted")]
    assert healthy.calls == [] and await pending(redis) == 0


async def test_a_later_run_decides_at_its_real_time(feed_db: Pool) -> None:  # noqa: F811
    """A deferred row's card is made when it really runs, so it does not lapse on arrival."""
    idx = await add_disclosure(feed_db, pub=NOW - timedelta(minutes=5))
    later = NOW + timedelta(hours=20)
    async with feed_db.connection() as conn:
        await conn.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, started_at) VALUES (%s, 'running', %s)", (idx, later)
        )
        await conn.commit()
        result = await run_disclosure(conn, idx, later, deps())
    assert result.feed_status == "waiting_approval"
    card = await one(feed_db, "SELECT created_at, expires_at FROM trading.approvals WHERE run_id = %s", result.run_id)
    assert card is not None and card["created_at"] >= later and card["expires_at"] > later


async def test_the_days_counts_tell_what_happened(
    feed_db: Pool,  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
) -> None:
    day = datetime(2027, 3, 2, 11, 0, tzinfo=IST)
    runner = FakeRunner()
    feed = feed_at(feed_db, redis, day, runner, max_runs_per_hour=1)
    await feed.ensure_group()
    ran = await add_disclosure(feed_db, pub=day - timedelta(minutes=5))
    waits = await add_disclosure(feed_db, pub=day - timedelta(minutes=5))
    arrived_late = await add_disclosure(feed_db, pub=day - timedelta(days=7))
    skipped = await add_disclosure(feed_db, route="noise", pub=day - timedelta(minutes=5))
    gone = await add_disclosure(feed_db, pub=day - timedelta(days=1, hours=2))
    async with feed_db.connection() as conn:  # deferred yesterday, its window closed this morning
        await conn.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, reason, seen_at, updated_at)"
            " VALUES (%s, 'deferred', 'daily_cap', %s, %s)",
            (gone, day - timedelta(days=1), day - timedelta(days=1)),
        )
        await conn.commit()
    for idx in (ran, waits, arrived_late, skipped):
        await feed.handle(idx)
    await feed.sweep()

    counts = (await day_counters_of(feed_db, day))["agent_feed"]

    assert counts == {
        "read": 3,  # ran, waits, arrived_late; the noise row is out of scope and `gone` was read yesterday
        "ran": 1,
        "vetoed": 0,
        "deferred": 1,
        "window_closed": 1,
        "expired_unrun": 1,
        "failed": 0,
    }
    next_day = (await day_counters_of(feed_db, day + timedelta(days=1)))["agent_feed"]
    assert (next_day["read"], next_day["window_closed"], next_day["expired_unrun"]) == (0, 0, 0)
    assert next_day["deferred"] == 1  # still waiting: a snapshot, not a day's event


async def day_counters_of(pool: Pool, at: datetime) -> dict[str, Any]:
    async with pool.connection() as conn:
        return await day_counters(conn, at)


async def test_a_day_the_worker_saw_nothing_has_no_feed_counts(feed_db: Pool) -> None:  # noqa: F811
    async with feed_db.connection() as conn:
        assert "agent_feed" not in await day_counters(conn, datetime(2027, 6, 1, 10, 40, tzinfo=UTC))


def _migration() -> Any:
    path = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "0023_agent_feed_deferred.py"
    spec = importlib.util.spec_from_file_location("migration_0023", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_old_capped_rows_become_expired_and_stay_on_their_day(feed_db: Pool, migrated: Settings) -> None:  # noqa: F811
    """Run on the owner connection and rolled back: the old CHECK, one old row, the upgrade."""
    migration = _migration()
    capped_idx = await add_disclosure(feed_db, pub=MON_11)
    stuck_idx = await add_disclosure(feed_db, pub=datetime(2026, 1, 5, 11, 0, tzinfo=IST), text=None)
    recent_idx = await add_disclosure(feed_db, pub=MON_11, text=None)
    old = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)
    owner = migrated.database_owner_url
    assert owner is not None
    conn = await connect(owner.get_secret_value())
    try:
        await conn.execute(migration.DOWN)
        await conn.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, reason, updated_at) VALUES"
            " (%s, 'capped', 'hourly_cap', %s), (%s, 'awaiting_text', NULL, %s), (%s, 'awaiting_text', NULL, %s)",
            (capped_idx, old, stuck_idx, old, recent_idx, old),
        )
        await conn.execute(migration.UP)
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT disclosure_index, status, reason, updated_at FROM ops.agent_feed"
                " WHERE disclosure_index = ANY(%s) ORDER BY disclosure_index",
                ([capped_idx, stuck_idx, recent_idx],),
            )
            rows = {r["disclosure_index"]: dict(r) for r in await cur.fetchall()}
    finally:
        await conn.rollback()
        await conn.close()
    assert (rows[capped_idx]["status"], rows[capped_idx]["reason"]) == ("expired_unrun", "legacy_capped:hourly_cap")
    assert rows[capped_idx]["updated_at"] == old  # not "today's" loss
    assert (rows[stuck_idx]["status"], rows[stuck_idx]["reason"]) == ("expired_unrun", "no_text")
    assert rows[recent_idx]["status"] == "awaiting_text"  # the worker's sweep decides from its real window


async def test_e3_ticker_is_in_the_universe_for_these_tests(feed_db: Pool) -> None:  # noqa: F811
    row = await one(feed_db, "SELECT in_universe FROM core.issuers WHERE ticker = %s", E3_TICKER)
    assert row == {"in_universe": True}
