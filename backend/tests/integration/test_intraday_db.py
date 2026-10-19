"""Intraday bars and latest_quote (recorded Yahoo 15m fixture, offline)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import respx

from kaptan.db import DictConn
from kaptan.prices.calendar import IST
from kaptan.prices.http import PoliteClient
from kaptan.prices.intraday import latest_quote, parse_intraday, refresh_quotes, run_intraday_archive, store_intraday
from kaptan.prices.yahoo import URL
from tests.integration.a4_support import add_bars

pytestmark = pytest.mark.integration
FIX = json.loads(
    (Path(__file__).resolve().parents[1] / "fixtures" / "reference" / "yahoo_THYAO_15m_1d.json").read_text()
)
DAY = date(2026, 10, 19)


async def _no_sleep(_: float) -> None:
    return None


def test_parse() -> None:
    bars = parse_intraday("THYAO", FIX, "15m")
    assert len(bars) == 34 and bars[-1].close == 266 and bars[0].ts.astimezone(IST).date() == DAY
    assert parse_intraday("THYAO", None, "1m") == []


async def test_store_and_latest_quote(pg: DictConn) -> None:
    bars = parse_intraday("THYAO", FIX, "15m")
    await store_intraday(pg, bars, datetime(2026, 10, 19, 19, 0, tzinfo=IST))
    last = bars[-1]
    now = last.ts + timedelta(minutes=15 + 15 + 1)
    q = await latest_quote(pg, "THYAO", now)
    assert q is not None and q.source == "yfinance:15m" and q.price == last.close
    assert q.age_s == pytest.approx(16 * 60)
    # 10 minutes after the last bar ended it is not knowable yet (15-min delay): the bar before it
    q2 = await latest_quote(pg, "THYAO", last.ts + timedelta(minutes=25))
    assert q2 is not None and q2.traded_at == last.ts
    # renamed codes and the daily fallback
    await add_bars(pg, "TRALT", [DAY], 300.0)
    q3 = await latest_quote(pg, "KOZAL", datetime(2026, 10, 19, 19, 0, tzinfo=IST))
    assert q3 is not None and q3.source == "isyatirim:close" and q3.price == 300
    assert await latest_quote(pg, "ZZZZZ", now) is None
    with pytest.raises(ValueError):
        await latest_quote(pg, "THYAO", datetime(2026, 10, 19, 12, 0))


async def test_refresh_and_archive_jobs(pg: DictConn) -> None:
    with respx.mock() as mock:
        mock.get(URL.format(symbol="THYAO.IS")).mock(return_value=httpx.Response(200, json=FIX))
        mock.get(URL.format(symbol="BADXX.IS")).mock(return_value=httpx.Response(500))
        async with httpx.AsyncClient() as http:
            client = PoliteClient(http, min_interval_s=0, jitter_s=0, retries=0, sleep=_no_sleep)
            got = await refresh_quotes(pg, ["THYAO", "BADXX"], datetime(2026, 10, 19, 18, 30, tzinfo=IST),
                                       client=client, interval="15m")  # fmt: skip
            assert got == {"THYAO": 34, "BADXX": 0}
            stats = await run_intraday_archive(pg, DAY, client=client, tickers=["THYAO", "BADXX"], interval="15m")
    assert (stats.bars, stats.failed) == (34, ("BADXX",))
