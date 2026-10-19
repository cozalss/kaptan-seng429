"""fundamentals_pit on Postgres: recorded MaliTablo answers (respx), KAP FR publication times, PIT reads,
and the evidence tools' E3 revenue (no longer always unknown)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pytest
import respx

from kaptan.db import DictConn
from kaptan.evidence.service import load_price_context
from kaptan.fundamentals import fundamentals_as_of, history_as_of, revenue_as_of, run_fundamentals
from kaptan.fundamentals.isyatirim import URL
from kaptan.prices.calendar import IST
from kaptan.prices.http import PoliteClient
from tests.integration.a4_support import add_bars, add_disclosure
from tests.unit.test_evidence_study import walk

pytestmark = pytest.mark.integration
FIX = Path(__file__).resolve().parents[1] / "fixtures" / "reference"
NOW = datetime(2026, 10, 20, 9, 0, tzinfo=IST)
FR_2026_6 = datetime(2026, 8, 10, 18, 40, tzinfo=IST)


def _by_period() -> dict[tuple[str, str], dict[str, str | None]]:
    """(year, months) → itemCode → value, from the two recorded answers."""
    out: dict[tuple[str, str], dict[str, str | None]] = {}
    for name, periods in (
        ("malitablo_THYAO_2025.json", [("2025", "12"), ("2025", "9"), ("2025", "6"), ("2025", "3")]),
        ("malitablo_THYAO_2026_2024.json", [("2026", "6"), ("2026", "3"), ("2024", "12"), ("2024", "9")]),
    ):
        for row in json.loads((FIX / name).read_text(encoding="utf-8"))["value"]:
            for i, p in enumerate(periods, start=1):
                out.setdefault(p, {})[row["itemCode"]] = row[f"value{i}"]
    return out


PERIODS = _by_period()


def _answer(request: httpx.Request) -> httpx.Response:
    """MaliTablo for the requested periods; unrecorded ones (2026/9: not published yet) are null."""
    q = request.url.params
    asked = [(q[f"year{k}"], q[f"period{k}"]) for k in range(1, 5) if f"year{k}" in q]
    codes = sorted({c for v in PERIODS.values() for c in v})
    rows = [{"itemCode": c, **{f"value{i}": PERIODS.get(p, {}).get(c) for i, p in enumerate(asked, 1)}} for c in codes]
    return httpx.Response(200, json={"ok": True, "value": rows})


async def _no_sleep(_: float) -> None:
    return None


async def test_run_and_point_in_time_reads(pg: DictConn) -> None:
    await add_disclosure(pg, 990_300_001, subject="Finansal Rapor", published=FR_2026_6, ticker="THYAO", cls="FR",
                         fin_year=2026, raw={"disclosureBasic": {"donem": 2}})  # fmt: skip
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(URL).mock(side_effect=_answer)
        async with httpx.AsyncClient() as http:
            client = PoliteClient(http, min_interval_s=0, jitter_s=0, sleep=_no_sleep)
            stats = await run_fundamentals(pg, NOW, client=client, tickers=["THYAO"])
    assert route.call_count == 2 and stats.rows > 0 and not stats.failed
    vals = await fundamentals_as_of(pg, "THYAO", NOW, ["revenue_q", "revenue_ttm", "cfo_ttm"])
    rq = vals["revenue_q"]
    assert (str(rq.period_end), rq.basis, rq.source_disclosure, rq.available_at) == (
        "2026-06-30",
        "kap_fr_publish",
        990_300_001,
        FR_2026_6 + timedelta(seconds=60),
    )
    # before the FR row became available the newest known quarter is 2026/3 (deadline estimate)
    early = await fundamentals_as_of(pg, "THYAO", FR_2026_6, ["revenue_q"])
    assert str(early["revenue_q"].period_end) == "2026-03-31"
    assert early["revenue_q"].basis == "period_end_plus_legal_deadline"
    rev = await revenue_as_of(pg, "THYAO", NOW)
    assert rev is not None and rev.item == "revenue_ttm" and rev.value > 1_000_000_000_000
    assert len(await history_as_of(pg, "THYAO", NOW, "revenue_q", limit=8)) >= 4
    with pytest.raises(ValueError):
        await fundamentals_as_of(pg, "THYAO", NOW, ["nope"])
    # the evidence tools now carry the PIT revenue for E3
    await add_bars(pg, "THYAO", walk(datetime(2026, 9, 1).date(), 35), 266.0)
    _pc, mi = await load_price_context(pg, "THYAO", NOW, NOW)
    assert mi.annual_revenue_try == rev.value and "annual_revenue_try" not in mi.unknown
