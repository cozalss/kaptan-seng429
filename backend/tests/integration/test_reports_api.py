"""The report endpoints on the seeded day: contract shapes, the benchmark's arithmetic, honest absence."""

from __future__ import annotations

import httpx
import pytest

from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh, sql

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]

INSERT_INDEX = (
    "INSERT INTO core.prices_daily (ticker, d, open, close, source) VALUES ('XU100', %s, %s, %s, 'yfinance') "
    "ON CONFLICT DO NOTHING"
)


async def _two_days(settings: Settings, with_index: bool) -> None:
    await sql(settings, "DELETE FROM trading.pnl_daily WHERE strategy = %s", (LIVE_STRATEGY,))
    await sql(settings, "DELETE FROM core.prices_daily WHERE ticker = 'XU100'")
    for i, (d, r) in enumerate((("2026-12-02", 0.01), ("2026-12-03", 0.02))):
        await sql(
            settings,
            "INSERT INTO trading.pnl_daily VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 0)",
            (LIVE_STRATEGY, d, 900 + i, 1000 * (1 + r), r, 1100, 0),
        )
    if with_index:
        await sql(settings, INSERT_INDEX, ("2026-12-01", 100, 10000))
        await sql(settings, INSERT_INDEX, ("2026-12-03", 100, 10300))


async def test_the_benchmark_chains_your_days_and_reads_the_index(api: httpx.AsyncClient, migrated: Settings) -> None:
    await _two_days(migrated, with_index=True)
    res = await call(api, "GET", "/reports/benchmark")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("Benchmark", body)
    assert body["available"] is True and body["start"] == "2026-12-02" and body["end"] == "2026-12-03"
    assert body["you_ratio"] == pytest.approx(1.01 * 1.02 - 1)
    assert body["index_ratio"] == pytest.approx(0.03)
    assert body["sentence_tr"] == "2 Aralık – 3 Aralık arasında paran %3 arttı; aynı sürede BIST 100 %3 arttı."


async def test_the_benchmark_says_nothing_without_the_index(api: httpx.AsyncClient, migrated: Settings) -> None:
    await _two_days(migrated, with_index=False)
    body = (await call(api, "GET", "/reports/benchmark")).json()
    assert_matches("Benchmark", body)
    assert body["available"] is False and body["sentence_tr"] is None and "BIST 100" in body["reason_tr"]


async def test_the_benchmark_needs_two_days(api: httpx.AsyncClient, migrated: Settings) -> None:
    await sql(migrated, "DELETE FROM trading.pnl_daily WHERE strategy = %s", (LIVE_STRATEGY,))
    body = (await call(api, "GET", "/reports/benchmark")).json()
    assert body["available"] is False and body["you_ratio"] is None


async def test_the_track_record_is_honest_about_open_periods(api: httpx.AsyncClient) -> None:
    res = await call(api, "GET", "/reports/track")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("TrackRecord", body)
    for it in body["items"]:
        if it["status"] == "open":
            assert it["return_ratio"] is None and "belli olur" in it["result_tr"]
        if it["status"] == "done":
            assert it["return_ratio"] is not None
    s = body["summary"]
    assert s["count"] == len(body["items"]) and s["done"] + s["open"] + s["no_data"] == s["count"]


async def test_the_karne_of_a_month_and_a_year(api: httpx.AsyncClient) -> None:
    for query in ("", "?period=month&at=2026-11", "?period=year&at=2026"):
        res = await call(api, "GET", f"/reports/karne{query}")
        assert res.status_code == 200, res.text
        assert_matches("Karne", res.json())
    assert (await call(api, "GET", "/reports/karne?period=month&at=2026")).status_code == 422
    assert (await call(api, "GET", "/reports/track?from=oops")).status_code == 422


async def test_the_quiet_day(api: httpx.AsyncClient) -> None:
    res = await call(api, "GET", "/reports/quiet")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("QuietDay", body)
    assert body["sentence_tr"].startswith("Bugün")
