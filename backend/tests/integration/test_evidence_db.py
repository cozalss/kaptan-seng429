"""Evidence tools on Postgres (migration 0008 tables + core.disclosures), synthetic series, offline.

Every row is written inside the `pg` fixture's transaction and rolled back afterwards; the tools then
read through savepoints. The stock follows R = α + β·R_XU100 exactly on closes, and each past event
carries a known abnormal return on its entry session's open → close, so CAR[1,h] = that AR exactly.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

import pytest
from psycopg.pq import TransactionStatus

from kaptan.agents.context import DisclosureInput
from kaptan.db import DictConn, connect
from kaptan.evidence import LiveToolbox
from kaptan.evidence.repo import past_events
from kaptan.evidence.service import load_price_context, scoped_study, study_events
from kaptan.settings import Settings
from tests.unit.test_evidence_study import at, walk

pytestmark = pytest.mark.integration

N: Final = 400
DAYS: Final = walk(date(2024, 1, 2), N)
ALPHA, BETA, RB_OC = 0.0005, 1.2, 0.002
#: publication session index (11:00, so t0 = index + 1) → abnormal return on the entry session
ARS: Final = {255: 0.011, 268: -0.007, 281: 0.015, 294: 0.004, 307: 0.009}
EX_IDX: Final = 296  # a 1:1 bonus issue inside the window of the event published at 294
AS_OF: Final = at(DAYS[340], 19)
SELF_INDEX: Final = 990_000_999


def _closes(base: float, rets: list[float]) -> list[float]:
    out, c = [], base
    for i, r in enumerate(rets):
        c = c if i == 0 else c * (1 + r)
        out.append(c)
    return out


RB: Final = [0.01 * (((i * 7) % 11) - 5) / 5 for i in range(N)]
BENCH_CLOSE: Final = _closes(10_000.0, RB)
STOCK_CLOSE: Final = _closes(50.0, [ALPHA + BETA * b for b in RB])


def _stock_rows(ticker: str, ars: dict[int, float], ex_idx: int | None) -> list[tuple[Any, ...]]:
    rows = []
    for i, d in enumerate(DAYS):
        close = STOCK_CLOSE[i]
        r_oc = (ALPHA + BETA * RB_OC + ars[i - 1]) if (i - 1) in ars else 0.0
        open_ = close / (1 + r_oc)
        scale = 2.0 if ex_idx is not None and i < ex_idx else 1.0  # raw levels before a 1:1 bonus issue
        raw_close = Decimal(str(round(close * scale, 6)))
        rows.append(
            (
                ticker,
                d,
                Decimal(str(round(open_ * scale, 6))),
                raw_close,
                Decimal(10_000_000),
                raw_close * 100_000_000,
                raw_close * 30_000_000,
                Decimal(50_000_000),
            )
        )
    return rows


async def _insert_prices(conn: DictConn, ticker: str, ars: dict[int, float], ex_idx: int | None = None) -> None:
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, turnover_try, mcap_try, free_float_mcap_try,"
            " capital_try, price_basis, source) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'raw', 'isyatirim')",
            _stock_rows(ticker, ars, ex_idx),
        )
        if ex_idx is not None:
            await cur.execute(
                "INSERT INTO core.corporate_actions (ticker, ex_date, kind, factor, source)"
                " VALUES (%s, %s, 'bedelsiz', 0.5, 'isyatirim')",
                (ticker, DAYS[ex_idx]),
            )


async def _insert_bench(conn: DictConn) -> None:
    rows = [
        ("XU100", d, Decimal(str(round(c / (1 + RB_OC), 6))), Decimal(str(round(c, 6))))
        for d, c in zip(DAYS, BENCH_CLOSE, strict=True)
    ]
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, price_basis, source)"
            " VALUES (%s, %s, %s, %s, 'adjusted', 'yfinance')",
            rows,
        )


async def _insert_events(conn: DictConn, ticker: str, route: str, idxs: list[int], first: int) -> None:
    rows = []
    for k, i in enumerate(idxs):
        published = at(DAYS[i], 11)
        rows.append((first + k, ticker, f"{ticker} A.Ş.", route, published, published + timedelta(seconds=60)))
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
            " disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,"
            " available_at, ingest_source, origin, visible)"
            " VALUES (%s, %s, %s, 'ODA', 'ODA', 'Yeni İş İlişkisi', '', 'NEW', %s, 'test', %s, %s,"
            " 'backfill', 'kap', false)",
            rows,
        )


@pytest.fixture
async def world(pg: DictConn) -> DictConn:
    await _insert_bench(pg)
    await _insert_prices(pg, "TSTAA", ARS, EX_IDX)
    await _insert_events(pg, "TSTAA", "E3", sorted(ARS), 990_000_001)
    return pg


def _disclosure(ticker: str, published: datetime) -> DisclosureInput:
    return DisclosureInput(
        run_id="run-evidence-test",
        disclosure_index=SELF_INDEX,
        ticker=ticker,
        company_name=f"{ticker} A.Ş.",
        subject="Yeni İş İlişkisi",
        summary="",
        text_tr="Şirketimiz yeni bir sözleşme imzalamıştır.",
        published_at=published,
        available_at=published + timedelta(seconds=21),
        strategy_version="v1.1-fwd",
        is_fixture=False,
    )


async def test_scoped_study_reproduces_the_hand_cars(world: DictConn) -> None:
    scoped = await scoped_study(world, "E3", "TSTAA", AS_OF, SELF_INDEX)
    assert (scoped.scope, scoped.sufficient, scoped.result.n) == ("ticker", True, 5)
    for r in scoped.result.results:
        idx = DAYS.index(r.t0) - 1
        assert r.model.kind == "market_model"
        assert (r.model.alpha, r.model.beta) == (pytest.approx(ALPHA, abs=1e-7), pytest.approx(BETA, abs=1e-6))
        # adjusted series: the bonus issue inside the 294 event's window is not a −50 % day
        assert r.cars == {h: pytest.approx(ARS[idx], abs=1e-6) for h in (1, 5, 20)}
    s5 = scoped.result.stats[5]
    assert (s5.mean, s5.median, s5.hit_rate) == (pytest.approx(0.0064), pytest.approx(0.009), 0.8)
    assert s5.t_stat == pytest.approx(0.0064 / (s5.sd / 5**0.5))


async def test_without_the_corporate_action_row_the_raw_drop_would_leak_in(world: DictConn) -> None:
    await world.execute("DELETE FROM core.corporate_actions WHERE ticker = 'TSTAA'")
    scoped = await scoped_study(world, "E3", "TSTAA", AS_OF, SELF_INDEX)
    hit = next(r for r in scoped.result.results if r.t0 == DAYS[295])
    assert hit.cars[1] == pytest.approx(0.004, abs=1e-6) and hit.cars[20] < -0.4


async def test_no_look_ahead_in_events_and_prices(world: DictConn) -> None:
    early = at(DAYS[320], 12)  # the 307 event's 20-session window ends at DAYS[327]
    events = await past_events(world, "E3", early, SELF_INDEX, ticker="TSTAA")
    assert len(events) == 5  # all published before, but one window is still open
    res = await study_events(world, events, early)
    assert res.n == 4 and res.dropped["window_open"] == 1
    pc, mi = await load_price_context(world, "TSTAA", early, early)
    assert pc.session == DAYS[319]  # 12:00: today's close is not known yet
    assert pc.last_close_try == Decimal(str(round(STOCK_CLOSE[319], 6)))
    assert pc.returns[1] == pytest.approx(ALPHA + BETA * RB[319], abs=1e-6)
    assert mi.market_cap_try == pc.last_close_try * 100_000_000
    # events published after as_of are invisible to the query
    assert await past_events(world, "E3", at(DAYS[270], 12), SELF_INDEX, ticker="TSTAA") != events
    assert len(await past_events(world, "E3", at(DAYS[270], 12), SELF_INDEX, ticker="TSTAA")) == 2


async def test_price_context_flags_the_bonus_issue_and_reads_turnover(world: DictConn) -> None:
    as_of = at(DAYS[300], 19)
    pc, mi = await load_price_context(world, "TSTAA", as_of, at(DAYS[300], 11))
    assert pc.session == DAYS[300] and pc.flags["recent_bonus_or_split"] is True
    assert pc.adv20_try == Decimal(10_000_000)
    assert pc.returns[5] == pytest.approx(STOCK_CLOSE[300] / STOCK_CLOSE[295] - 1, abs=1e-6)  # across the ex-date
    assert pc.vol_20d is not None and pc.ret_3m is not None and pc.ret_5d_mkt_adj is not None
    assert mi.paid_in_capital_try == Decimal(50_000_000) and "annual_revenue_try" in mi.unknown


async def test_sector_then_market_fallback(world: DictConn) -> None:
    for ticker in ("TSTBB", "TSTCC"):
        await _insert_prices(world, ticker, {})
        await world.execute(
            "INSERT INTO core.issuers (ticker, name, sector, free_float, adv20_try, price, in_universe)"
            " VALUES (%s, %s, 'Test Sektörü', 0.3, 1e7, 50, true)",
            (ticker, f"{ticker} A.Ş."),
        )
    await _insert_events(world, "TSTBB", "E1", [255, 281], 990_000_101)
    await _insert_events(world, "TSTCC", "E1", [255, 268, 281, 294], 990_000_201)
    sector = await scoped_study(world, "E1", "TSTBB", AS_OF, SELF_INDEX)
    assert (sector.scope, sector.result.n, sector.sufficient) == ("sector", 6, True)
    lone = await scoped_study(world, "E2", "TSTBB", AS_OF, SELF_INDEX)
    assert lone.scope == "market" and not lone.sufficient


async def test_live_toolbox_prepares_inside_the_callers_transaction(world: DictConn) -> None:
    live = LiveToolbox(world, _disclosure("TSTAA", AS_OF))
    await live.prepare("E3")
    assert world.info.transaction_status == TransactionStatus.INTRANS  # savepoints only, nothing committed
    store = live.evidence_store(live.fp)
    assert store is not None and store["stats"]["n"] == 5 and store["strength"] == "weak"
    assert store["stats"]["median_car_5d"] == pytest.approx(0.009) and store["stats"]["hit_rate_20d"] == 0.8
    facts = live.market_facts()
    assert facts["last_close_try"] == pytest.approx(STOCK_CLOSE[340], abs=1e-6)
    assert live.features(live.fp)["leakage_5d_mkt_adj"] is not None


async def test_live_toolbox_on_an_idle_connection_leaves_it_idle(migrated: Settings) -> None:
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        live = LiveToolbox(conn, _disclosure("NODATA", AS_OF))
        await live.prepare("E4")
        assert conn.info.transaction_status == TransactionStatus.IDLE
        pc = live.price[0] if live.price else None
        assert pc is not None and pc.last_close_try is None and pc.returns[1] is None  # unknown, not guessed
        assert "E4" in live.studies  # studied (market-wide), whatever other rows the database holds
    finally:
        await conn.close()
