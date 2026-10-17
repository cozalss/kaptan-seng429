"""Demo timers, the ticker's pacing, the package adapters and the counters' pure part (no Postgres)."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.demo import ports
from kaptan.demo.ticker import next_delay_s, run_ticker
from kaptan.demo.timers import DemoTimers, later, timers_of
from kaptan.disclosures.counters import counters_from_row


async def test_later_runs_once_and_stop_all_cancels_the_rest() -> None:
    timers = DemoTimers()
    ran: list[str] = []

    async def mark(name: str) -> None:
        ran.append(name)

    timers.later(0, lambda: mark("soon"), name="soon")
    timers.later(3600, lambda: mark("never"), name="never")
    await asyncio.sleep(0.05)
    assert ran == ["soon"]
    assert timers.names() == ["never"]
    assert await timers.stop_all() == 1
    assert timers.active == 0
    assert ran == ["soon"]


async def test_a_failing_timer_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    timers = DemoTimers()

    async def boom() -> None:
        raise RuntimeError("boom")

    timers.later(0, boom, name="boom")

    async def bad_loop() -> None:
        raise ValueError("loop")

    timers.spawn(bad_loop(), name="loop")
    await asyncio.sleep(0.05)
    assert timers.active == 0
    assert "demo timer boom failed" in caplog.text
    assert "demo timer loop failed" in caplog.text


async def test_timers_of_creates_one_registry_per_app() -> None:
    app = SimpleNamespace(state=SimpleNamespace())
    assert timers_of(app) is timers_of(app)
    task = later(app, 3600, lambda: asyncio.sleep(0), name="x")
    assert not task.done()
    await timers_of(app).stop_all()
    assert task.cancelled()


def test_ticker_pacing_matches_the_mock() -> None:
    assert next_delay_s(0) == 7.0
    assert next_delay_s(1) == pytest.approx(7.0 + 7919 % 5000 / 1000)
    assert all(7.0 <= next_delay_s(n) < 12.0 for n in range(200))


async def test_ticker_loop_stops_when_the_day_is_out(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    naps: list[float] = []
    results: list[tuple[Any, int]] = [(RuntimeError("db"), 0), ({"disclosure_index": 1}, 1), (None, 1)]

    async def fake_tick(_app: Any) -> tuple[Any, int]:
        item, n = results[len(calls)]
        calls.append(n)
        if isinstance(item, Exception):
            raise item
        return item, n

    async def nap(s: float) -> None:
        naps.append(s)

    monkeypatch.setattr("kaptan.demo.ticker.tick", fake_tick)
    await run_ticker(object(), first_delay_s=6.0, sleep=nap)
    assert len(calls) == 3
    assert naps == [6.0, 7.0, 7.0]


async def test_call_passes_only_accepted_kwargs() -> None:
    def plain(a: int) -> int:
        return a

    async def with_app(a: int, *, app: Any = None) -> tuple[int, Any]:
        return a, app

    def anything(a: int, **kw: Any) -> dict[str, Any]:
        return kw

    assert await ports.call(plain, 1, app="x") == 1
    assert await ports.call(with_app, 1, app="x", clock="c") == (1, "x")
    assert await ports.call(anything, 1, app="x", clock="c") == {"app": "x", "clock": "c"}


async def test_adapters_without_their_package(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ports, "LOSS_MODULES", ("kaptan.nothing_here",))
    monkeypatch.setattr(ports, "PUBLISH_MODULES", ("kaptan.nothing_here",))
    with pytest.raises(ApiError) as err:
        ports.loss_step_fn()
    assert (err.value.status, err.value.code) == (503, "unavailable")
    await ports.publish(object(), "feed", "counters", {})  # skipped, no error
    assert ports.find(("kaptan.nothing_here", "kaptan.demo.ports"), "find") is ports.find


async def test_publish_failure_is_logged(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    async def broken(*_a: Any) -> None:
        raise RuntimeError("redis down")

    monkeypatch.setattr(ports, "find", lambda _m, _a: broken)
    await ports.publish(object(), "feed", "counters", {})
    assert "SSE publish failed: feed/counters" in caplog.text


def test_counters_from_row() -> None:
    row = {
        "total": 213,
        "noise": 61,
        "processed": 14,
        "e_candidates": 12,
        "proposals": 5,
        "approvals": 1,
        "rejections": 1,
        "llm_calls": None,
        "llm_tokens": 500_000,
    }
    out = counters_from_row(row, datetime(2027, 1, 11, 10, 40, tzinfo=UTC), 412_000)
    assert out["archived"] == 213 - 61 - 14
    assert out["as_of"] == "2027-01-11T10:40:00.000Z"
    assert (out["llm_calls"], out["llm_tokens"]) == (0, 500_000)
    assert (
        counters_from_row({**row, "llm_tokens": 10}, datetime(2027, 1, 11, tzinfo=UTC), 412_000)["llm_tokens"]
        == 412_000
    )
