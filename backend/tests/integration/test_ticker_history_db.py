"""Renamed codes: core.ticker_history + core.ticker_codes in the price and evidence reads."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.db import DictConn
from kaptan.evidence.repo import last_raw, series
from kaptan.prices.reads import adv20, close_on
from kaptan.reference.ticker_history import add_rename, code_on, current_code, ticker_codes
from tests.integration.a4_support import add_bars
from tests.unit.test_evidence_study import walk

pytestmark = pytest.mark.integration


async def test_rename_chain_and_reads(pg: DictConn) -> None:
    assert await ticker_codes(pg, "KOZAL") == ["KOZAL", "TRALT"]  # seeded by migration 0016
    assert await ticker_codes(pg, "THYAO") == ["THYAO"]
    await add_rename(pg, "TRALT", "TSTZZ", changed_on=date(2026, 9, 1), source="manual")
    assert await current_code(pg, "KOZAL") == "TSTZZ"
    assert await code_on(pg, "KOZAL", date(2026, 1, 1)) == "KOZAL"  # KOZAL→TRALT has no verified date
    assert await code_on(pg, "TRALT", date(2026, 9, 2)) == "TSTZZ"
    with pytest.raises(ValueError):
        await add_rename(pg, "TRALT", "TRALT", changed_on=None, source="manual")
    days = walk(date(2026, 9, 1), 25)
    await add_bars(pg, "TRALT", days, 300.0)
    assert await close_on(pg, "KOZAL", days[3]) == 300  # the old code finds the new code's history
    assert await adv20(pg, "KOZAL", days[-1]) is not None
    assert len(await series(pg, "KOZAL", days[0], days[-1])) == 25
    raw = await last_raw(pg, "KOZAL", days[-1])
    assert raw is not None and raw["close"] == 300
