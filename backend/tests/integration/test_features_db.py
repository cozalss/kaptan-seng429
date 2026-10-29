"""Point-in-time SQL of the live merge inputs on Postgres: E1/E2 notices (no look-ahead), the TCMB rate
valid before `as_of` (migration 0013), and E4 unknown while `core.fundamentals_pit` is missing."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

import pytest
from psycopg.types.json import Jsonb

from kaptan.db import DictConn
from kaptan.market import fundamentals
from kaptan.market.features import live_features, load_merge_inputs
from kaptan.market.fx import FxRate, available_at
from kaptan.market.fx_store import rate_at, upsert_rates
from kaptan.prices.calendar import IST

pytestmark = pytest.mark.integration

T: Final = "TSTFX"
SELF: Final = 992_000_100
PUB: Final = datetime(2026, 10, 14, 19, 0, tzinfo=IST)
AVAILABLE: Final = PUB + timedelta(seconds=30)


async def _notice(
    conn: DictConn, index: int, published: datetime, route: str, parsed: dict[str, Any], *, available: datetime
) -> None:
    subject = "Payların Geri Alınmasına İlişkin Bildirim" if route == "E1" else "Pay Alım Satım Bildirimi"
    await conn.execute(
        "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
        " disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,"
        " available_at, ingest_source, origin, visible, parsed)"
        " VALUES (%s, %s, 'TSTFX A.Ş.', 'ODA', 'ODA', %s, '', 'NEW', %s, 'test', %s, %s, 'backfill', 'kap',"
        " false, %s)",
        (index, T, subject, route, published, available, Jsonb(parsed)),
    )


def _bb(day: str, nominal: str) -> dict[str, Any]:
    return {"kind": "buyback", "transactions": [{"ticker": T, "date": day, "nominal_try": nominal}]}


async def test_e1_notices_respect_available_at(pg: DictConn) -> None:
    early = datetime(2026, 10, 12, 18, tzinfo=IST)
    await _notice(pg, SELF - 3, early, "E1", _bb("2026-10-12", "1000000"), available=early + timedelta(seconds=40))
    # published before but only *available* after the decision moment: invisible (no look-ahead)
    await _notice(pg, SELF - 2, PUB - timedelta(minutes=5), "E1", _bb("2026-10-14", "9000000"),
                  available=AVAILABLE + timedelta(minutes=1))  # fmt: skip
    await _notice(pg, SELF, PUB, "E1", _bb("2026-10-14", "1500000"), available=AVAILABLE)
    inputs = await load_merge_inputs(pg, ticker=T, disclosure_index=SELF, published_at=PUB, available_at=AVAILABLE,
                                     event_type="E1", reader=None)  # fmt: skip
    assert {n.index for n in inputs.notices} == {SELF - 3, SELF}
    f = live_features(inputs, event_type="E1", ticker=T, disclosure_index=SELF, published_at=PUB,
                      available_at=AVAILABLE, reader=None, paid_in_capital=Decimal(1_000_000_000),
                      free_float_mcap=None)  # fmt: skip
    assert f["buyback_10d_capital_pct"] == 0.0025 and f["buyback_10d_notice_count"] == 2


async def test_e2_notices_feed_the_insider_features(pg: DictConn) -> None:
    row = {"date": "2026-10-14", "buy_nominal_try": "25000", "sell_nominal_try": None,
           "start_nominal_try": "1000", "end_nominal_try": "26000"}  # fmt: skip
    parsed = {"kind": "insider_trade", "rows": [row], "price_low_try": "39", "price_high_try": "41"}
    await _notice(pg, SELF, PUB, "E2", parsed, available=AVAILABLE)
    inputs = await load_merge_inputs(pg, ticker=T, disclosure_index=SELF, published_at=PUB, available_at=AVAILABLE,
                                     event_type="E2", reader=None)  # fmt: skip
    f = live_features(inputs, event_type="E2", ticker=T, disclosure_index=SELF, published_at=PUB,
                      available_at=AVAILABLE, reader={"role": "executive"}, paid_in_capital=None,
                      free_float_mcap=Decimal(500_000_000))  # fmt: skip
    assert f["insider_net_buy_value_try"] == 1_000_000 and f["insider_buy_to_ff_mcap"] == 0.002
    assert f["insider_cluster_30d"] == 1


async def test_fx_rate_is_the_one_published_before_as_of(pg: DictConn) -> None:
    rates = [
        FxRate(date(2026, 10, 19), "USD", Decimal("41.70"), available_at(date(2026, 10, 19))),
        FxRate(date(2026, 10, 20), "USD", Decimal("41.81"), available_at(date(2026, 10, 20))),
        FxRate(date(2026, 10, 20), "EUR", Decimal("48.65"), available_at(date(2026, 10, 20))),
    ]
    assert await upsert_rates(pg, rates) == 3
    assert await upsert_rates(pg, rates[:1]) == 1  # idempotent upsert
    assert await rate_at(pg, "USD", datetime(2026, 10, 20, 16, 29, tzinfo=IST)) == Decimal("41.70")
    assert await rate_at(pg, "USD", datetime(2026, 10, 20, 16, 30, tzinfo=IST)) == Decimal("41.70")  # strict <
    assert await rate_at(pg, "USD", datetime(2026, 10, 20, 16, 31, tzinfo=IST)) == Decimal("41.81")
    assert await rate_at(pg, "USD", datetime(2026, 11, 5, 12, tzinfo=IST)) is None  # older than 10 days: stale
    assert await rate_at(pg, "GBP", datetime(2026, 10, 21, 12, tzinfo=IST)) is None
    assert await rate_at(pg, "TRY", datetime(2026, 10, 21, 12, tzinfo=IST)) == 1
    reader = {"currency": "ABD Doları", "amount": 12_000_000}
    pub = datetime(2026, 10, 21, 11, tzinfo=IST)
    usd = await load_merge_inputs(pg, ticker=T, disclosure_index=SELF, published_at=pub, available_at=pub,
                                  event_type="E3", reader=reader)  # fmt: skip
    assert (usd.currency, usd.fx_rate) == ("USD", Decimal("41.81"))
    unknown = await load_merge_inputs(pg, ticker=T, disclosure_index=SELF, published_at=pub, available_at=pub,
                                      event_type="E3", reader={"currency": "GBP"})  # fmt: skip
    assert (unknown.currency, unknown.fx_rate) == ("GBP", None)


async def test_e4_fundamentals_pit_or_unknown(pg: DictConn) -> None:
    async with pg.cursor() as cur:
        await cur.execute(fundamentals.EXISTS_SQL)
        found = await cur.fetchone()
    inputs = await load_merge_inputs(pg, ticker=T, disclosure_index=SELF, published_at=PUB, available_at=AVAILABLE,
                                     event_type="E4", reader=None)  # fmt: skip
    if not (found and found["ok"]):
        assert inputs.fundamentals is None
        assert fundamentals.e4_features(inputs.fundamentals)["e4_cfo_quality"] == "unknown"
    else:  # the data-jobs migration (0016) landed: no rows for this ticker → nothing known
        assert inputs.fundamentals == ()
        assert fundamentals.e4_features(inputs.fundamentals)["e4_sue"] is None
