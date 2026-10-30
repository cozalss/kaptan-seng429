"""A P&L day written after a later day (the live warm-up's earlier sessions) still lists in date order."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.db import DictConn
from kaptan.portfolio.pnl import list_pnl

pytestmark = pytest.mark.integration

INSERT = """
INSERT INTO trading.pnl_daily (strategy, d, ord, equity, daily_return, peak_equity, drawdown, n_positions, n_trades)
VALUES ('kaptan:v1.1-fwd', %s, (SELECT max(ord) + 1 FROM trading.pnl_daily), 1000000, 0, 1000000, 0, 0, 0)
"""


async def test_late_written_day_is_listed_before_the_later_day(pg: DictConn) -> None:
    for d in ("2030-01-08", "2030-01-07"):  # today's row first, the warm-up's earlier session second
        await pg.execute(INSERT, (d,))
    rows = await list_pnl(pg, date(2030, 1, 1), None)
    assert [str(r["d"]) for r in rows] == ["2030-01-07", "2030-01-08"]
