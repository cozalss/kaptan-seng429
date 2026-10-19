"""Each scheduler job body calls its module with the right arguments (seeded day, rolled-back connection).
Network sources are replaced by fakes; nothing here commits."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from datetime import date, datetime
from typing import Any

import pytest

from kaptan.db import DictConn
from kaptan.prices.calendar import IST
from kaptan.settings import Settings
from kaptan.workers import scheduler as s

pytestmark = pytest.mark.integration

DAY = date(2027, 1, 11)
NOW = datetime(2027, 1, 11, 21, 0, tzinfo=IST)


@contextlib.asynccontextmanager
async def fake_http() -> AsyncIterator[object]:
    yield object()


def ctx_for(settings: Settings) -> s.Ctx:
    return s.Ctx(settings=settings, pool=None, redis=None, http=fake_http)


@pytest.mark.parametrize(
    "name",
    ["market_changes", "universe", "tedbir_sync", "morning_brief", "open_fill", "eod_fills", "pnl_eod", "regime",
     "event_returns", "shadow_returns", "dq", "audit_anchor", "retention"],
)  # fmt: skip
async def test_job_body_runs_on_the_seeded_day(pg: DictConn, migrated: Settings, name: str) -> None:
    job = s.BY_NAME[name]
    result = await job.fn(pg, ctx_for(migrated), DAY, NOW)
    assert isinstance(s.compact(result), dict)


async def test_network_jobs_use_the_polite_client(
    pg: DictConn, migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from kaptan.fundamentals import store as fundamentals
    from kaptan.prices import ingest, intraday
    from kaptan.prices.http import PoliteClient, SourceError
    from kaptan.reference import profiles

    seen: dict[str, Any] = {}

    async def fake_refresh(conn: Any, tickers: list[str], now: datetime, *, client: Any) -> dict[str, int]:
        assert isinstance(client, PoliteClient)
        seen["quotes"] = tickers
        return dict.fromkeys(tickers, 1)

    async def fake_fetch(client: Any, ticker: str, start: date, end: date) -> Any:
        if ticker == "XU100":
            raise SourceError("down")
        return ticker

    async def fake_store(conn: Any, fetched: Any, at: datetime) -> Any:
        return type("R", (), {"raw_rows": 1})()

    async def fake_any(*args: Any, **kwargs: Any) -> int:
        assert isinstance(kwargs["client"], PoliteClient)
        return 7

    monkeypatch.setattr(intraday, "refresh_quotes", fake_refresh)
    monkeypatch.setattr(intraday, "run_intraday_archive", fake_any)
    monkeypatch.setattr(ingest, "fetch_ticker", fake_fetch)
    monkeypatch.setattr(ingest, "store_fetched", fake_store)
    monkeypatch.setattr(profiles, "run_issuer_profiles", fake_any)
    monkeypatch.setattr(fundamentals, "run_fundamentals", fake_any)
    monkeypatch.setattr(pg, "commit", _no_commit)
    ctx = ctx_for(migrated)
    quotes = await s.job_quotes(pg, ctx, DAY, NOW)
    assert quotes == {"tickers": 0} or set(quotes) == set(seen["quotes"])
    eod = await s.job_eod_prices(pg, ctx, DAY, NOW)
    assert eod["failed"] == ["XU100"] and eod["raw_rows"] == eod["tickers"] - 1
    for fn in (s.job_intraday_archive, s.job_issuer_profiles, s.job_fundamentals):
        assert await fn(pg, ctx, DAY, NOW) == 7


async def _no_commit() -> None:
    return None
