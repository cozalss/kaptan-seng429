"""The live warm-up end to end on the test database with fake sources (no network): stock list → profiles,
candidate price history (one fetch per share, XU100 from Yahoo), then the scheduler's universe job."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from psycopg_pool import AsyncConnectionPool

from kaptan.db import DictConn, create_pool
from kaptan.live import warmup as w
from kaptan.prices.calendar import IST, is_trading_day
from kaptan.prices.http import SourceError
from kaptan.prices.ingest import Fetched
from kaptan.prices.models import DailyBar
from kaptan.settings import Settings
from kaptan.workers.scheduler import Ctx
from tests.conftest import reseed_test_db
from tests.harness.seed import SeedResult

pytestmark = pytest.mark.integration

NOW = datetime(2027, 1, 12, 20, 0, tzinfo=IST)  # Tuesday after the close → trades 13 January
CODES = ("WRMA", "WRMB", "WRMC")
PAGE = "".join(
    f'<tr><td><a href="/x?hisse={c}">{c}</a></td><td>{c} A.Ş.</td><td>Test Sektörü</td>'
    f'<td class="text-right">100,00</td><td class="text-right">{mcap}</td><td class="text-right">1,0</td>'
    f'<td class="text-right">50,0</td><td class="text-right">100,0</td></tr>'
    for c, mcap in (("WRMA", "10.000,0"), ("WRMB", "8.000,0"), ("WRMC", "9.000,0"), ("WRMD", "100,0"))
)


def bars(ticker: str, start: date, end: date) -> tuple[DailyBar, ...]:
    out, d = [], start
    while d <= end:
        if is_trading_day(d):
            out.append(
                DailyBar(
                    ticker=ticker,
                    d=d,
                    close=Decimal(100),
                    source="isyatirim",
                    price_basis="raw",
                    high=Decimal(101),
                    low=Decimal(99),
                    turnover_try=Decimal(100_000_000),
                    mcap_try=Decimal(10_000_000_000),
                    free_float_mcap_try=Decimal(5_000_000_000),
                    capital_try=Decimal(100_000_000),
                )
            )
        d += timedelta(days=1)
    return tuple(out)


class FakeSources:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[str, ...]]] = []

    async def page(self) -> str:
        return PAGE

    async def fetch(self, t: str, start: date, end: date, sources: tuple[Any, ...]) -> Fetched:
        self.calls.append((t, sources))
        if t == "WRMC":
            raise SourceError("isyatirim WRMC: down")
        raw = () if t == "XU100" else bars(t, start, end)
        return Fetched(t, raw, (), (), 0, None)

    async def kap(self, start: date, end: date) -> dict[str, Any]:
        raise RuntimeError("KAP blocked")


@pytest.fixture
async def pool(seeded: SeedResult, migrated: Settings) -> AsyncIterator[AsyncConnectionPool[DictConn]]:
    p = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=3)
    await p.open(wait=True)
    try:
        yield p
    finally:
        async with p.connection() as conn:
            await conn.execute("DELETE FROM core.prices_daily WHERE ticker LIKE 'WRM%%'")
            await conn.execute("DELETE FROM core.universe_daily WHERE ticker LIKE 'WRM%%'")
            await conn.execute("DELETE FROM core.issuer_profiles WHERE ticker LIKE 'WRM%%'")
            await conn.commit()
        await p.close()
        await reseed_test_db(migrated)


async def test_warmup_loads_history_and_builds_the_universe(
    pool: AsyncConnectionPool[DictConn], migrated: Settings
) -> None:
    fake = FakeSources()
    sources = w.Sources(stock_page=fake.page, fetch=fake.fetch, kap_backfill=fake.kap)
    real = w.scheduler_job_runner(Ctx(settings=migrated, pool=pool, redis=None, http=lambda: None))
    asked: list[str] = []

    async def runner(name: str, day: date, now: datetime) -> bool:
        asked.append(f"{name}:{day}")
        # Only the universe runs for real: the other jobs write day rows (briefs, P&L) other tests own.
        return await real(name, day, now) if name in ("universe", "tedbir_sync") else True

    rep = await w.run_warmup(pool, sources, runner, now=NOW, days=2, max_tickers=10)
    assert asked == [
        "market_changes:2027-01-12",
        "tedbir_sync:2027-01-12",
        "universe:2027-01-13",
        "pnl_eod:2027-01-11",
        "pnl_eod:2027-01-12",
        "regime:2027-01-12",
        "morning_brief:2027-01-12",
    ]
    assert rep.jobs["tedbir_sync:2027-01-12"] is True

    assert rep.kap == {"error": "RuntimeError"} and rep.profiles == 4 and rep.candidates == 3  # WRMD below U4
    assert [c[0] for c in fake.calls] == ["WRMA", "WRMC", "WRMB", "XU100"]  # largest first, index last
    assert fake.calls[-1][1] == ("yfinance",) and fake.calls[0][1] == ("isyatirim",)
    assert rep.prices.failed == ["WRMC"] and rep.universe_day == date(2027, 1, 13)
    assert rep.jobs["universe:2027-01-13"] is True
    assert rep.eligible >= 2
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT ticker FROM core.universe_daily WHERE d = '2027-01-13' AND is_eligible AND ticker LIKE 'WRM%%'"
        )
        assert sorted(r["ticker"] for r in await cur.fetchall()) == ["WRMA", "WRMB"]
        assert await w.history_gaps(conn, ["WRMA", "WRMC"], date(2027, 1, 13)) == ["WRMC"]

    again = FakeSources()
    await w.run_warmup(pool, w.Sources(again.page, again.fetch, again.kap), _no_jobs, now=NOW, days=0, max_tickers=10)
    assert [c[0] for c in again.calls] == ["WRMC", "XU100"]  # resumable: only what is missing


async def _no_jobs(name: str, day: date, now: datetime) -> bool:
    return True


async def test_stock_list_failure_is_not_fatal(pool: AsyncConnectionPool[DictConn]) -> None:
    async def broken() -> str:
        raise SourceError("404")

    async def kap(start: date, end: date) -> dict[str, Any]:
        return {"days": 2}

    fake = FakeSources()
    rep = await w.run_warmup(pool, w.Sources(broken, fake.fetch, kap), _no_jobs, now=NOW, days=2, max_tickers=10)
    assert rep.kap == {"days": 2} and rep.profiles == 0 and [c[0] for c in fake.calls] == ["XU100"]

    async def empty() -> str:
        return "<html/>"

    rep2 = await w.run_warmup(pool, w.Sources(empty, fake.fetch, kap), _no_jobs, now=NOW, days=0, max_tickers=5)
    assert rep2.profiles == 0 and rep2.kap == {"days": 0}
