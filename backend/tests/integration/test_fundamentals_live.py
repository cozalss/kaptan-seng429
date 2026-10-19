"""Live smoke test (opt-in, `pytest -m live`): 1 İş Yatırım MaliTablo request + 1 Yahoo intraday request."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.fundamentals.isyatirim import derive, fetch_statements
from kaptan.prices.http import PoliteClient, make_http_client
from kaptan.prices.intraday import fetch_intraday

pytestmark = pytest.mark.live


async def test_isyatirim_statements_and_yahoo_intraday_answer() -> None:
    async with make_http_client() as http:
        client = PoliteClient(http, min_interval_s=2.0)
        st = await fetch_statements(client, "THYAO", [(2025, 12), (2025, 9), (2025, 6), (2025, 3)])
        assert st[(2025, 12)]["revenue"] > 0
        assert any(i.item == "revenue_annual" for i in derive(st))
        bars = await fetch_intraday(client, "THYAO", interval="15m")
        assert client.requests == 2
    assert all(b.close > 0 for b in bars) and (not bars or bars[-1].ts.date() <= date.today())
