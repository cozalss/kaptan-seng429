"""Live smoke test (opt-in: `uv run pytest -m live tests/integration/test_prices_live.py`).

Two polite requests (İş Yatırım + Yahoo, THYAO, last 3 weeks); no keys, nothing written.
Checks that both endpoints still answer in the shape the parsers expect.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.prices.calendar import istanbul_date
from kaptan.prices.http import PoliteClient, make_http_client
from kaptan.prices.ingest import fetch_ticker

pytestmark = pytest.mark.live


async def test_isyatirim_and_yahoo_still_answer() -> None:
    today = istanbul_date(datetime.now(UTC))
    start = today - timedelta(days=21)
    async with make_http_client() as http:
        client = PoliteClient(http, min_interval_s=2.0)
        fetched = await fetch_ticker(client, "THYAO", start, today)
    assert client.requests == 2
    assert len(fetched.raw) >= 10 and len(fetched.adjusted) >= 10
    assert (today - fetched.raw[-1].d).days <= 7
    opens = [b for b in fetched.raw if b.open is not None]
    assert len(opens) >= 0.8 * len(fetched.adjusted)
    # Yahoo adjclose and İş Yatırım HGDG_KAPANIS agree on returns (07 §6 [V]).
    yahoo = {b.d: b.close for b in fetched.adjusted}
    common = [b for b in fetched.raw if b.d in yahoo and b.ref_adj_close]
    first, last = common[0], common[-1]
    assert first.ref_adj_close is not None and last.ref_adj_close is not None
    isy_ret = last.ref_adj_close / first.ref_adj_close
    yahoo_ret = yahoo[last.d] / yahoo[first.d]
    assert abs(isy_ret / yahoo_ret - 1) < Decimal("0.005")
