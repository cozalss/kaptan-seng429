"""pnl_eod (FR-29): the live strategy's end-of-day row plus the XU100 and equal-weight baselines."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.db import DictConn
from kaptan.portfolio.pnl import LIVE_STRATEGY, list_pnl
from kaptan.risk.pnl_eod import EW_UNIVERSE, XU100_BH, run_pnl_eod
from tests.integration.test_risk_live_db import CAPITAL, add_bar, one_position_desk, rows

pytestmark = pytest.mark.integration

DAY, PREV = date(2026, 10, 20), date(2026, 10, 19)


async def _index_bar(conn: DictConn, d: date, close: float) -> None:
    await conn.execute(
        "INSERT INTO core.prices_daily (ticker, d, open, close, source, price_basis) "
        "VALUES ('XU100', %s, %s, %s, 'yfinance', 'adjusted') ON CONFLICT DO NOTHING",
        (d, close, close),
    )


async def test_eod_rows_for_the_strategy_and_the_baselines(pg: DictConn) -> None:
    await one_position_desk(pg)  # ORNEK 1 000 @ 50, close 53 today; previous equity 1 010 000 / peak 1 020 000
    await pg.execute(
        "DELETE FROM trading.pnl_daily WHERE strategy IN (%s, %s) AND d < %s", (XU100_BH, EW_UNIVERSE, DAY)
    )
    seeded = await rows(pg, "SELECT strategy, d, ord FROM trading.pnl_daily ORDER BY ord")

    no_index = await run_pnl_eod(pg, DAY, capital=CAPITAL, demo=False)
    assert [r.strategy for r in no_index] == [LIVE_STRATEGY]  # no XU100 / universe prices yet
    strat = no_index[0]
    assert strat.equity == 1_002_973.75  # cash 949 973.75 + 1 000 × 53
    assert strat.daily_return == pytest.approx(1_002_973.75 / 1_010_000 - 1, abs=1e-5)
    assert (strat.peak_equity, strat.n_positions, strat.n_trades) == (1_020_000, 1, 0)
    assert strat.drawdown == pytest.approx(1_002_973.75 / 1_020_000 - 1, abs=1e-5)

    await _index_bar(pg, PREV, 9000.0)
    await _index_bar(pg, DAY, 9180.0)
    await add_bar(pg, "ORNEK", PREV, 50.0, 50.0)  # ORNEK +6 %, ORNCM −2 %: equal weight +2 %
    await add_bar(pg, "ORNCM", PREV, 100.0, 100.0)
    await add_bar(pg, "ORNCM", DAY, 99.0, 98.0)
    again = await run_pnl_eod(pg, DAY, capital=CAPITAL, demo=False)
    by = {r.strategy: r for r in again}
    assert by[XU100_BH].daily_return == pytest.approx(0.02) and by[XU100_BH].equity == pytest.approx(1_030_200)
    assert by[EW_UNIVERSE].daily_return == pytest.approx(0.02)
    assert by[EW_UNIVERSE].drawdown == 0

    written = await rows(pg, "SELECT strategy, ord FROM trading.pnl_daily WHERE d = %s ORDER BY ord", (DAY,))
    assert [w["strategy"] for w in written] == [LIVE_STRATEGY, XU100_BH, EW_UNIVERSE]
    first_ord = written[0]["ord"]
    await run_pnl_eod(pg, DAY, capital=CAPITAL, demo=False)  # idempotent: same rows, same ord
    assert (await rows(pg, "SELECT ord FROM trading.pnl_daily WHERE d = %s AND strategy = %s", (DAY, LIVE_STRATEGY)))[
        0
    ]["ord"] == first_ord
    kept = await rows(pg, "SELECT strategy, d, ord FROM trading.pnl_daily WHERE d <> %s ORDER BY ord", (DAY,))
    assert kept == [s for s in seeded if s["d"] != DAY]  # the seeded series is untouched
    api = await list_pnl(pg, DAY, DAY)
    assert {p["strategy"] for p in api} == {LIVE_STRATEGY, XU100_BH, EW_UNIVERSE}


async def test_no_rows_on_holidays_or_in_demo_mode(pg: DictConn) -> None:
    assert await run_pnl_eod(pg, date(2026, 10, 29), capital=CAPITAL, demo=False) == []  # Cumhuriyet Bayramı
    assert await run_pnl_eod(pg, DAY, capital=CAPITAL, demo=True) == []
