"""The live desk on Postgres: the paper book marked to market, the gate's freshness / exposure inputs,
and desk_for(live=True) wiring them into the run context. Everything runs in the `pg` transaction
(rolled back), so the demo seed stays as it is."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from kaptan.agents.context import DisclosureInput
from kaptan.agents.feed_run import desk_for
from kaptan.db import DictConn
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.risk.book import paper_book
from kaptan.risk.desk import UNKNOWN_AGE, live_desk, mark_restrictions_refreshed

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)  # Tuesday 12:00 Istanbul, session open
YESTERDAY = NOW - timedelta(days=1)
CAPITAL = 1_000_000


async def rows(conn: DictConn, sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def clean_book(conn: DictConn) -> None:
    """An empty paper desk: no fills, orders, positions or live-strategy P&L rows."""
    for sql in (
        "DELETE FROM trading.fills",
        "DELETE FROM trading.positions",
        "DELETE FROM trading.orders",
        "DELETE FROM trading.pnl_daily WHERE strategy = %s",
    ):
        await conn.execute(sql, (LIVE_STRATEGY,) if "%s" in sql else ())


async def proposals(conn: DictConn, n: int) -> list[dict[str, Any]]:
    return await rows(
        conn,
        "SELECT tp.proposal_id, tp.run_id, r.event_type FROM trading.trade_proposals tp "
        "JOIN trading.agent_runs r ON r.run_id = tp.run_id WHERE r.event_type IN ('E1','E2','E3','E4') "
        "ORDER BY tp.proposal_id LIMIT %s",
        (n,),
    )


async def add_order(
    conn: DictConn,
    oid: str,
    prop: dict[str, Any],
    ticker: str,
    qty: int,
    price: float,
    status: str,
    at: datetime,
    side: str = "buy",
) -> None:
    await conn.execute(
        "INSERT INTO trading.orders (id, client_order_id, proposal_id, run_id, ticker, company_name, side, "
        "order_type, tif, qty, limit_price, status, broker, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, 'limit', 'day', %s, %s, %s, 'simbist', %s)",
        (oid, f"k-{oid}", prop["proposal_id"], prop["run_id"], ticker, ticker, side, qty, price, status, at),
    )


async def add_fill(conn: DictConn, oid: str, qty: int, price: float, at: datetime) -> None:
    commission = round(qty * price * 0.0005, 2)
    await conn.execute(
        "INSERT INTO trading.fills VALUES (%s, %s, %s, %s, %s, %s, 6, %s, 'simbist')",
        (f"f-{oid}", oid, qty, price, commission, round(commission * 0.05, 2), at),
    )


async def add_position(conn: DictConn, prop: dict[str, Any], ticker: str, qty: int, avg: float, at: datetime) -> None:
    await conn.execute(
        "INSERT INTO trading.positions (book, ticker, company_name, qty, avg_cost, last_price, opened_at, "
        "planned_exit_date, source_proposal, run_id, event_type, strategy_version) "
        "VALUES ('paper', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'v1.1-fwd')",
        (ticker, ticker, qty, avg, avg, at, date(2026, 11, 1), prop["proposal_id"], prop["run_id"], prop["event_type"]),
    )


async def add_bar(conn: DictConn, ticker: str, d: date, open_: float | None, close: float) -> None:
    await conn.execute(
        "INSERT INTO core.prices_daily (ticker, d, open, close, source, price_basis) "
        "VALUES (%s, %s, %s, %s, 'isyatirim', 'raw') ON CONFLICT DO NOTHING",
        (ticker, d, open_, close),
    )


async def add_pnl(conn: DictConn, d: date, equity: float, peak: float, strategy: str = LIVE_STRATEGY) -> None:
    await conn.execute(
        "INSERT INTO trading.pnl_daily VALUES (%s, %s, (SELECT coalesce(max(ord), 0) + 1 FROM trading.pnl_daily), "
        "%s, 0, %s, %s, 0, 0)",
        (strategy, d, equity, peak, min(0.0, equity / peak - 1)),
    )


async def one_position_desk(pg: DictConn) -> list[dict[str, Any]]:
    """ORNEK: 1 000 shares bought yesterday at 50 (open today 52), an unfilled ORNCM buy of 100 @ 60."""
    await clean_book(pg)
    props = await proposals(pg, 2)
    await add_order(pg, "o-ornek", props[0], "ORNEK", 1000, 50.0, "filled", YESTERDAY)
    await add_fill(pg, "o-ornek", 1000, 50.0, YESTERDAY)
    await add_position(pg, props[0], "ORNEK", 1000, 50.0, YESTERDAY)
    await add_order(pg, "o-orncm", props[1], "ORNCM", 100, 60.0, "accepted", NOW - timedelta(hours=1))
    await add_bar(pg, "ORNEK", date(2026, 10, 20), 52.0, 53.0)
    await add_pnl(pg, date(2026, 10, 19), 1_010_000, 1_020_000)
    return props


async def test_paper_book_marks_to_market(pg: DictConn) -> None:
    await one_position_desk(pg)
    book = await paper_book(pg, NOW, capital=CAPITAL)
    assert book.cash == Decimal("949973.75")  # 1 000 000 − 50 000 − 25 commission − 1.25 BSMV
    assert [(h.ticker, h.qty, h.mark) for h in book.holdings] == [("ORNEK", 1000, Decimal("52"))]
    assert book.equity == Decimal("1001973.75")
    assert book.reserved == Decimal("6000.00")
    assert book.free_cash == Decimal("943973.75")
    assert (book.day_start_equity, book.peak_equity) == (Decimal(1_010_000), Decimal(1_020_000))
    assert book.daily_pnl_pct == Decimal("1001973.75") / Decimal(1_010_000) - 1
    later = await paper_book(pg, NOW.replace(hour=16), capital=CAPITAL)  # 19:00: today's close counts
    assert later.holdings[0].mark == Decimal("53")
    empty = await paper_book(pg, YESTERDAY - timedelta(days=2), capital=CAPITAL)
    assert empty.equity == CAPITAL and empty.holdings == ()


async def test_live_desk_inputs(pg: DictConn) -> None:
    await one_position_desk(pg)
    await pg.execute("DELETE FROM core.restriction_refresh")
    published = NOW - timedelta(minutes=3)
    desk = await live_desk(pg, "ORNTX", NOW, published_at=published, available_at=NOW, capital=CAPITAL)
    assert desk.restrictions_age_h == UNKNOWN_AGE  # never refreshed: R04 holds
    assert desk.kap_delay_s == 180.0
    assert desk.daily_entries == 1  # the ORNCM order today; ORNEK's was yesterday
    assert desk.last_price is None and desk.price_age_s == UNKNOWN_AGE  # no ORNTX price in session
    assert desk.group_exposure_pct == desk.sector_exposure_pct == 0  # Tekstil, no group: the sector's
    assert (desk.n_open_positions, desk.holds_ticker) == (1, False)

    await mark_restrictions_refreshed(pg, "tedbir_sync", NOW - timedelta(hours=2), 12)
    ornek = await live_desk(pg, "ORNEK", NOW, published_at=published, available_at=NOW, capital=CAPITAL)
    assert ornek.restrictions_age_h == pytest.approx(2.0)
    assert ornek.last_price == Decimal("52") and ornek.price_age_s == pytest.approx(105 * 60)  # open known 10:15
    assert ornek.holds_ticker
    eq = ornek.equity_try
    assert ornek.sector_exposure_pct == Decimal("52000.00") / eq  # Enerji: the ORNEK position
    assert ornek.group_exposure_pct == Decimal("58000.00") / eq  # Örnek Holding: + the ORNCM order
    await pg.execute(
        "INSERT INTO core.issuer_groups (ticker, group_name) VALUES ('ORNEK', 'Başka Grup') ON CONFLICT DO NOTHING"
    )
    regrouped = await live_desk(pg, "ORNCM", NOW, published_at=published, available_at=NOW, capital=CAPITAL)
    assert regrouped.group_exposure_pct == Decimal("6000.00") / regrouped.equity_try

    await pg.execute(
        "INSERT INTO core.prices_intraday (ticker, ts, interval, close, source, fetched_at) "
        "VALUES ('ORNEK', %s, '5m', 52.4, 'borsapy', %s)",
        (NOW - timedelta(minutes=10), NOW - timedelta(minutes=9)),
    )
    fresh = await live_desk(pg, "ORNEK", NOW, published_at=published, available_at=NOW, capital=CAPITAL)
    assert fresh.last_price == Decimal("52.4") and fresh.price_age_s == pytest.approx(600)
    closed = await live_desk(
        pg, "ORNEK", NOW.replace(hour=17), published_at=published, available_at=NOW, capital=CAPITAL
    )
    assert closed.price_age_s == 0.0  # 20:00 Istanbul: staleness only counts in session


async def test_desk_for_live_fills_the_gate_inputs(pg: DictConn) -> None:
    await one_position_desk(pg)
    d = DisclosureInput(
        run_id="run-live-1",
        disclosure_index=1,
        ticker="ORNEK",
        company_name="ÖRNEK",
        subject="s",
        summary="s",
        text_tr="t",
        published_at=NOW - timedelta(seconds=40),
        available_at=NOW,
        strategy_version="v1.1-fwd",
        is_fixture=False,
    )
    demo = await desk_for(pg, "ORNEK")
    live = await desk_for(pg, "ORNEK", live=True, disclosure=d, now=NOW)
    assert not demo.live and demo.cash_free_try is None
    assert live.live and live.kap_delay_s == 40.0 and live.daily_entries == 1
    assert live.equity_try == Decimal("1001973.75") and live.cash_free_try == Decimal("943973.75")
    assert live.last_price == Decimal("52") and live.holds_ticker
    assert live.restrictions_age_h >= 0
