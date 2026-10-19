"""The scheduler against Postgres (M3 B1): ops.job_runs rows, timeouts, failure isolation, idempotent slots."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import date, datetime, time
from typing import Any

import pytest

from kaptan.db import create_pool
from kaptan.prices.calendar import IST
from kaptan.settings import Settings
from kaptan.workers import scheduler as s

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=IST)


@pytest.fixture
async def ctx(migrated: Settings) -> AsyncIterator[s.Ctx]:
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=4)
    await pool.open(wait=True)
    try:
        yield s.Ctx(settings=migrated, pool=pool, redis=None, http=lambda: None)
    finally:
        async with pool.connection() as conn:
            await conn.execute("DELETE FROM ops.job_runs WHERE job LIKE 'test\\_%%'")
        await pool.close()


async def _rows(ctx: s.Ctx, job: str) -> list[dict[str, Any]]:
    async with ctx.pool.connection() as conn, conn.cursor() as cur:
        await cur.execute("SELECT * FROM ops.job_runs WHERE job = %s ORDER BY id", (job,))
        return list(await cur.fetchall())


async def ok_job(conn: Any, ctx: s.Ctx, day: date, now: datetime) -> Any:
    async with conn.cursor() as cur:
        await cur.execute("SELECT 1 AS one")
        await cur.fetchone()
    return {"day": day, "n": 3}


async def bad_job(conn: Any, ctx: s.Ctx, day: date, now: datetime) -> Any:
    raise RuntimeError("secret https://user:pw@example.invalid must never be stored")


async def slow_job(conn: Any, ctx: s.Ctx, day: date, now: datetime) -> Any:
    await asyncio.sleep(5)
    return {}


async def test_a_run_is_recorded_with_its_summary(ctx: s.Ctx) -> None:
    job = s.Job("test_ok", ok_job, at=time(8, 0), days="daily")
    result = await s.run_job(ctx, job, "2026-10-20", trigger="schedule", now=NOW)
    assert result.ok and result.summary == {"day": "2026-10-20", "n": 3}
    (row,) = await _rows(ctx, "test_ok")
    assert row["ok"] is True and row["error_class"] is None and row["trigger"] == "schedule"
    assert row["finished_at"] >= row["started_at"] and row["summary"]["n"] == 3


async def test_failure_and_timeout_store_only_the_error_class(ctx: s.Ctx) -> None:
    bad = await s.run_job(ctx, s.Job("test_bad", bad_job, at=time(8, 0), days="daily"), "2026-10-20", trigger="manual")
    slow = s.Job("test_slow", slow_job, at=time(8, 0), days="daily", timeout_s=0.05)
    timed_out = await s.run_job(ctx, slow, "2026-10-20", trigger="catchup")
    assert (bad.ok, bad.error_class) == (False, "RuntimeError")
    assert (timed_out.ok, timed_out.error_class) == (False, "TimeoutError")
    (row,) = await _rows(ctx, "test_bad")
    assert row["ok"] is False and row["error_class"] == "RuntimeError" and row["summary"] == {}
    assert "secret" not in str(row)


async def test_tick_runs_each_slot_once_and_one_failure_does_not_stop_the_others(
    ctx: s.Ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    jobs = (
        s.Job("test_tick_bad", bad_job, at=time(8, 0), days="daily"),
        s.Job("test_tick_ok", ok_job, at=time(8, 0), days="daily"),
        s.Job("test_tick_after", ok_job, at=time(8, 0), days="daily", after="test_tick_ok"),
        s.Job("test_tick_later", ok_job, at=time(23, 0), days="daily"),
    )
    monkeypatch.setattr(s, "JOBS", jobs)
    running: dict[str, asyncio.Task[s.RunResult]] = {}
    started = await s.tick(ctx, NOW, running, demo=False)
    assert {j.name for j, _ in started} == {"test_tick_bad", "test_tick_ok"}
    await asyncio.gather(*running.values())
    assert {r.result().job: r.result().ok for r in running.values()} == {"test_tick_bad": False, "test_tick_ok": True}
    second = await s.tick(ctx, NOW, running, demo=False)  # the chained job, now that its predecessor is done
    assert [j.name for j, _ in second] == ["test_tick_after"]
    await asyncio.gather(*running.values())
    assert await s.tick(ctx, NOW, running, demo=False) == []  # restart the same day: nothing twice
    assert len(await _rows(ctx, "test_tick_ok")) == 1
    assert len(await _rows(ctx, "test_tick_bad")) == 1  # a failed slot is not retried by the loop
    assert await s.tick(ctx, NOW, running, demo=True) == []  # DEMO_MODE: not demo-safe


async def test_daily_catchup_is_marked(ctx: s.Ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(s, "JOBS", (s.Job("test_catchup", ok_job, at=time(8, 0), days="daily"),))
    running: dict[str, asyncio.Task[s.RunResult]] = {}
    await s.tick(ctx, datetime(2026, 10, 20, 15, 0, tzinfo=IST), running, demo=False)
    await asyncio.gather(*running.values())
    (row,) = await _rows(ctx, "test_catchup")
    assert row["trigger"] == "catchup" and row["slot"] == "2026-10-20"
