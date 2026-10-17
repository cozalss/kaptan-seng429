"""Poll rhythm, failure backoff, worker loops and backfill helpers (no database, no network)."""

from __future__ import annotations

import asyncio
import gzip
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from kaptan.ingest import backfill as cli
from kaptan.ingest.detail_fetcher import retry_delay
from kaptan.ingest.kap_backfill import CAP, daterange, detail_priority, fetch_day, write_raw
from kaptan.ingest.kap_client import KapBlockedError, KapError
from kaptan.ingest.kap_poller import KapPoller, PollConfig, base_interval, day_start_utc, istanbul_day, next_delay
from kaptan.settings import Settings
from kaptan.workers import ingest_worker
from tests.ingest_support import DAY_15, DAY_16, FakeKap

CFG = PollConfig()


def ist(y: int, mo: int, d: int, h: int, mi: int = 0) -> datetime:
    return datetime(y, mo, d, h - 3, mi, tzinfo=UTC) if h >= 3 else datetime(y, mo, d - 1, h + 21, mi, tzinfo=UTC)


@pytest.mark.parametrize(
    ("when", "seconds"),
    [
        (ist(2026, 10, 16, 10), 30.0),  # Friday, in session
        (ist(2026, 10, 16, 7, 59), 300.0),  # night
        (ist(2026, 10, 16, 19, 0), 60.0),  # evening
        (ist(2026, 10, 17, 11), 60.0),  # Saturday
        (ist(2026, 10, 18, 2), 300.0),  # Sunday night
    ],
)
def test_market_hours_interval(when: datetime, seconds: float) -> None:
    assert base_interval(when, CFG) == seconds


def test_session_interval_never_below_30s_and_jitter_only_upwards() -> None:
    fast = PollConfig(session_s=5)
    assert base_interval(ist(2026, 10, 16, 10), fast) == 30.0
    assert next_delay(ist(2026, 10, 16, 10), CFG, 0, 1.0) == pytest.approx(36.0)
    assert next_delay(ist(2026, 10, 16, 10), CFG, 0, 0.0) == 30.0


def test_failures_back_off_60_120_300_600() -> None:
    noon = ist(2026, 10, 16, 12)
    assert [next_delay(noon, CFG, n, 0.0) for n in range(1, 6)] == [60.0, 120.0, 300.0, 600.0, 600.0]
    assert next_delay(ist(2026, 10, 16, 3), CFG, 1, 0.0) == 300.0  # never shorter than the night interval


def test_istanbul_day_boundaries() -> None:
    late = datetime(2026, 10, 16, 21, 30, tzinfo=UTC)  # 00:30 on the 17th in Istanbul
    assert istanbul_day(late) == date(2026, 10, 17)
    assert day_start_utc(date(2026, 10, 17)) == datetime(2026, 10, 16, 21, 0, tzinfo=UTC)


def test_the_first_poll_of_a_day_also_reads_the_previous_day() -> None:
    poller = KapPoller(pool=None, client=FakeKap(), cfg=CFG)  # type: ignore[arg-type]
    assert poller.days_to_query(DAY_16) == [DAY_16]
    poller.state.last_day = DAY_15
    assert poller.days_to_query(DAY_16) == [DAY_15, DAY_16]


def test_detail_retry_delays_grow_and_cap() -> None:
    assert [retry_delay(n) for n in (1, 2, 3)] == [timedelta(minutes=5), timedelta(minutes=10), timedelta(minutes=20)]
    assert retry_delay(30) == timedelta(hours=6)


def test_poll_config_from_settings() -> None:
    s = Settings(database_url="postgresql://x@localhost/db", demo_mode=True, kap_poll_offhours_s=90)
    cfg = PollConfig.from_settings(s)
    assert cfg.demo_mode is True and cfg.offhours_s == 90 and cfg.session_s == 30


# ── worker loops ──────────────────────────────────────────────────────────
class ScriptedPoller:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = outcomes
        self.cfg = CFG

    def now(self) -> datetime:
        return ist(2026, 10, 16, 12)

    async def poll_once(self) -> Any:
        item = self.outcomes.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


async def test_poll_loop_backs_off_on_failures_and_resets_on_success() -> None:
    from kaptan.ingest.kap_poller import PollResult

    stop = asyncio.Event()
    delays: list[float] = []
    outcomes: list[Any] = [
        KapBlockedError("666"),
        KapError("boom"),
        OSError("net"),
        RuntimeError("bug"),
        PollResult(fetched=3, inserted=1),
        PollResult(),
    ]

    async def sleep(ev: asyncio.Event, seconds: float) -> None:
        delays.append(seconds)
        if not outcomes:
            ev.set()

    await ingest_worker.poll_loop(ScriptedPoller(outcomes), stop, sleep=sleep, rand=lambda: 0.0)  # type: ignore[arg-type]
    assert delays == [60.0, 120.0, 300.0, 600.0, 30.0, 30.0]


async def test_detail_loop_idles_pauses_and_stops(monkeypatch: pytest.MonkeyPatch) -> None:
    script: list[Any] = [123, KapBlockedError("waf"), KapError("x"), ValueError("bug"), None]
    naps: list[float] = []

    async def fake_fetch_one(pool: Any, client: Any) -> Any:
        item = script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    stop = asyncio.Event()

    async def sleep(ev: asyncio.Event, seconds: float) -> None:
        naps.append(seconds)
        if not script:
            ev.set()

    monkeypatch.setattr(ingest_worker, "fetch_one", fake_fetch_one)
    await ingest_worker.detail_loop(None, None, stop, sleep=sleep)  # type: ignore[arg-type]
    assert naps == [600.0, 30.0, 30.0, 10.0]


async def test_wait_or_stop_returns_early_when_stopped() -> None:
    stop = asyncio.Event()
    stop.set()
    await asyncio.wait_for(ingest_worker.wait_or_stop(stop, 60), timeout=1)
    await ingest_worker.wait_or_stop(asyncio.Event(), 0.01)


async def test_worker_is_off_without_kap_live() -> None:
    s = Settings(database_url="postgresql://x@localhost/db", kap_live=False)
    assert await ingest_worker.run_worker(s) == 0


# ── backfill helpers ──────────────────────────────────────────────────────
def test_daterange_includes_weekends_and_priorities() -> None:
    assert list(daterange(date(2026, 10, 16), date(2026, 10, 19))) == [
        date(2026, 10, 16),
        date(2026, 10, 17),
        date(2026, 10, 18),
        date(2026, 10, 19),
    ]
    assert detail_priority(date(2025, 3, 1)) == 1 and detail_priority(date(2024, 12, 31)) == 2


async def test_a_capped_day_is_split_by_class() -> None:
    kap = FakeKap()
    big = [{"disclosureIndex": i} for i in range(CAP)]
    kap.criteria = {(DAY_16, ""): big, (DAY_16, "ODA"): big[:10], (DAY_16, "FR"): big}
    rows, complete = await fetch_day(kap, DAY_16)  # type: ignore[arg-type]
    assert not complete and len(rows) == 10 + CAP
    assert [c[1][1] for c in kap.calls] == ["", "ODA", "FR", "DG", "DKB", "DUY"]
    rows, complete = await fetch_day(FakeKap(), DAY_16)  # type: ignore[arg-type]
    assert complete and len(rows) == 476


def test_raw_day_files_are_gzipped_json(tmp_path: Path) -> None:
    path = write_raw(tmp_path, DAY_16, [{"a": "ç"}])
    assert path == tmp_path / "raw_kap_daily" / "2026" / "10" / "16.json.gz"
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        assert json.load(fh) == [{"a": "ç"}]


def test_backfill_cli_arguments() -> None:
    args = cli.parse_args(["--from", "2026-10-15", "--to", "2026-10-16", "--details", "--drain", "3"])
    assert (args.start, args.end, args.details, args.drain) == (DAY_15, DAY_16, True, 3)
    with pytest.raises(SystemExit):
        cli.parse_args(["--from", "2026-10-16", "--to", "2026-10-15"])
    with pytest.raises(SystemExit):
        cli.parse_args(["--from", "2026-10-16", "--to", "2026-10-16", "--drain", "-1"])
