"""The daily price band follows the stock's market on Postgres (06 §2 [V], Prosedür §5.1.11): R09's tavan
at send, the merge inputs and the exit/fill paths read the market from core.market_changes →
core.issuers → core.issuer_profiles; an unknown market keeps the narrowest band (±10 %)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal as D  # noqa: N817

import pytest

from kaptan.db import DictConn
from kaptan.market.segment import limit_pct_of, market_of
from kaptan.prices.calendar import IST, istanbul_date, prev_session
from kaptan.reference.profiles import sync_market_changes
from kaptan.risk.at_send import _upper_limit
from kaptan.risk.gate import GateContext, GateLimits, GateOrder, r09
from tests.integration.a4_support import add_bars, add_disclosure

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 21, 11, 0, tzinfo=IST)
PREV = prev_session(istanbul_date(NOW))
YIP = "Payların Yakın İzleme Pazarına Alınması"


async def _profile(pg: DictConn, ticker: str, market: str | None) -> None:
    await pg.execute(
        "INSERT INTO core.issuer_profiles (ticker, name, sector, market, source)"
        " VALUES (%s, 'Test', 'Test', %s, 'manual')",
        (ticker, market),
    )


def _r09(upper: D | None, limit: D = D("111.00")) -> str:
    order = GateOrder(ticker="TSTAA", event_type="E3", qty=10, limit_price=limit, stop_pct=D(0))
    ctx = GateContext(
        equity_try=D(1_000_000),
        last_price=D("110.00"),
        adv20_try=D(100_000_000),
        cash_free_try=D(1_000_000),
        upper_limit=upper,
    )
    return r09(order, ctx, GateLimits(), "at_send").outcome


async def test_r09_tavan_uses_the_stock_market(pg: DictConn) -> None:
    for ticker, market in (("TSTYY", "yildiz"), ("TSTAN", "ana"), ("TSTAL", "alt"), ("TSTUK", None)):
        await add_bars(pg, ticker, [PREV], 100.0)
        if market is not None:
            await _profile(pg, ticker, market)
    uppers = {t: await _upper_limit(pg, t, NOW) for t in ("TSTYY", "TSTAN", "TSTAL", "TSTUK")}
    assert uppers == {"TSTYY": D("120.00"), "TSTAN": D("115.00"), "TSTAL": D("110.00"), "TSTUK": D("110.00")}
    assert await _upper_limit(pg, "TSTZZ", NOW) is None  # no previous close
    # last 110 (+10 % on the day), limit 111: inside ±2 %; near tavan only when the band is ±10 %
    assert _r09(uppers["TSTYY"]) == "pass"
    assert _r09(uppers["TSTAN"]) == "pass"
    assert _r09(uppers["TSTAL"]) == "reject"
    assert _r09(uppers["TSTUK"]) == "reject"  # unknown market → the conservative ±10 %


async def test_a_kap_market_change_overrides_the_profile_point_in_time(pg: DictConn) -> None:
    await _profile(pg, "TSTMC", "yildiz")
    await add_disclosure(pg, 990_300_001, subject="Pazar Değişikliği", summary=YIP,
                         published=datetime(2026, 10, 20, 19, 0, tzinfo=IST), related=["TSTMC"], cls="DKB")  # fmt: skip
    assert await sync_market_changes(pg, NOW) == 1
    assert await market_of(pg, "TSTMC", NOW) == "yip"
    assert await limit_pct_of(pg, "TSTMC", NOW) == D("0.10")
    before = datetime(2026, 10, 20, 18, 0, tzinfo=IST)  # the move was not public yet
    assert await market_of(pg, "TSTMC", before) == "yildiz"
    assert await limit_pct_of(pg, "TSTMC", before) == D("0.20")
    assert await market_of(pg, "TSTNONE", NOW) is None
