"""The daily universe on Postgres: universe_daily rows, core.issuers for KAP tickers, demo rows intact."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from kaptan.agents.feed_run import desk_for
from kaptan.db import DictConn
from kaptan.prices.calendar import IST, prev_session
from kaptan.reference.profiles import sync_market_changes
from kaptan.reference.universe import run_universe, universe_on
from tests.integration.a4_support import add_bars, add_disclosure
from tests.unit.test_evidence_study import walk

pytestmark = pytest.mark.integration
DAY = date(2026, 10, 20)
YIP = "Payların Yakın İzleme Pazarına Alınması"
DAYS = [d for d in walk(date(2025, 6, 2), 400) if d < DAY][-300:]


async def test_universe_snapshot(pg: DictConn) -> None:
    async with pg.cursor() as cur:
        await cur.execute("SELECT ticker, price FROM core.issuers ORDER BY ticker")
        demo = await cur.fetchall()
    await add_bars(pg, "TSTAA", DAYS, 40.0)  # liquid, long history → eligible
    await add_bars(pg, "TSTBB", DAYS[-30:], 40.0)  # 30 sessions: U5
    await add_bars(pg, "TSTCC", DAYS, 40.0, turnover=1e6)  # illiquid: U2
    await add_bars(pg, "TSTDD", DAYS, 40.0)  # moved to YİP: U1
    await add_disclosure(pg, 990_200_001, subject="Pazar Değişikliği", summary=YIP,
                         published=datetime(2026, 10, 1, 19, 0, tzinfo=IST), related=["TSTDD"], cls="DKB")  # fmt: skip
    await pg.execute(
        "INSERT INTO core.issuer_profiles (ticker, name, sector, source)"
        " VALUES ('TSTAA', 'Test', 'Test Sektörü', 'isyatirim')"
    )
    assert await sync_market_changes(pg, datetime(2026, 10, 20, 8, 0, tzinfo=IST)) == 1
    stats = await run_universe(pg, DAY)
    assert (stats.candidates, stats.eligible) == (4, 1)
    assert await universe_on(pg, DAY) == ["TSTAA"]
    async with pg.cursor() as cur:
        await cur.execute("SELECT ticker, reasons, adv20_try, history_sessions FROM core.universe_daily WHERE d = %s"
                          " ORDER BY ticker", (DAY,))  # fmt: skip
        rows = {r["ticker"]: r for r in await cur.fetchall()}
        await cur.execute("SELECT ticker, price FROM core.issuers WHERE origin = 'demo' ORDER BY ticker")
        assert await cur.fetchall() == demo
        await cur.execute("SELECT sector, in_universe, snapshot_d FROM core.issuers WHERE ticker = 'TSTAA'")
        assert await cur.fetchone() == {"sector": "Test Sektörü", "in_universe": True, "snapshot_d": DAY}
    assert rows["TSTBB"]["reasons"] == ["U5"] and rows["TSTCC"]["reasons"] == ["U2"]
    assert rows["TSTDD"]["reasons"] == ["U1"] and rows["TSTAA"]["history_sessions"] == 300
    desk = await desk_for(pg, "TSTAA")  # a KAP ticker outside the demo seed is now known to the agents
    assert desk.in_universe and float(desk.last_price) == 40.0
    # a later day without the ticker's bars drops it from the issuers' universe (STALE)
    await pg.execute("DELETE FROM core.prices_daily WHERE ticker = 'TSTAA' AND d > %s", (DAYS[-40],))
    await run_universe(pg, DAY + timedelta(days=1))
    async with pg.cursor() as cur:
        await cur.execute("SELECT in_universe, universe_reasons FROM core.issuers WHERE ticker = 'TSTAA'")
        assert await cur.fetchone() == {"in_universe": False, "universe_reasons": ["STALE"]}
    assert prev_session(DAY) == DAYS[-1]
