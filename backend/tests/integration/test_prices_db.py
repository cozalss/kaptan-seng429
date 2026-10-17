"""Migration 0008 + ingest + read helpers on the recorded fixtures (Postgres, offline)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from decimal import Decimal

import psycopg
import pytest

from kaptan.db import DictConn, connect
from kaptan.prices import (
    DbPriceSource,
    adv20,
    close_on,
    daily_returns,
    forward_return,
    latest_mark,
    latest_marks,
    open_on,
)
from kaptan.prices.calendar import IST, add_sessions
from kaptan.prices.ingest import fetch_ticker, store_fetched
from kaptan.settings import Settings
from tests.fixtures.prices.cassette import WINDOWS, replay_client

pytestmark = pytest.mark.integration
D = Decimal
FETCHED_AT = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
TABLES = "core.prices_daily, core.corporate_actions"


async def _load(conn: DictConn) -> None:
    async with replay_client() as client:
        for window in WINDOWS:
            await store_fetched(conn, await fetch_ticker(client, *window), FETCHED_AT)


async def _truncate(settings: Settings) -> None:
    owner = settings.database_owner_url
    assert owner is not None
    conn = await connect(owner.get_secret_value())  # the app role has no TRUNCATE
    try:
        await conn.execute(f"TRUNCATE {TABLES}")
        await conn.commit()
    finally:
        await conn.close()


@pytest.fixture
async def prices(migrated: Settings) -> AsyncIterator[DictConn]:
    """App-role connection with every recorded window stored; price tables emptied afterwards."""
    await _truncate(migrated)
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        await _load(conn)
        await conn.commit()
        yield conn
    finally:
        await conn.rollback()
        await conn.close()
        await _truncate(migrated)


def ist(y: int, m: int, d: int, hh: int, mm: int = 0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=IST)


async def test_rows_calendar_and_constraints(prices: DictConn) -> None:
    rows = await (
        await prices.execute(
            "SELECT source, price_basis, count(*) AS n FROM core.prices_daily GROUP BY 1, 2 ORDER BY 1"
        )
    ).fetchall()
    assert {(r["source"], r["price_basis"]) for r in rows} == {("isyatirim", "raw"), ("yfinance", "adjusted")}
    cal = await (
        await prices.execute(
            "SELECT d, is_trading_day, is_half_day FROM core.market_calendar"
            " WHERE d IN ('2026-10-28', '2026-10-29') ORDER BY d"
        )
    ).fetchall()
    assert [(r["is_trading_day"], r["is_half_day"]) for r in cal] == [(True, True), (False, False)]
    with pytest.raises(psycopg.errors.CheckViolation):
        await prices.execute(
            "INSERT INTO core.prices_daily (ticker, d, close, price_basis, source)"
            " VALUES ('THYAO', '2026-01-02', 1, 'adjusted', 'isyatirim')"
        )
    await prices.rollback()


async def test_idempotent_reload_and_stale_derived_actions_are_replaced(prices: DictConn) -> None:
    async def count(sql: str) -> int:
        row = await (await prices.execute(sql)).fetchone()
        assert row is not None
        return int(row["n"])

    before = await count("SELECT count(*) AS n FROM core.prices_daily")
    await prices.execute(
        "INSERT INTO core.corporate_actions (ticker, ex_date, kind, factor, source) VALUES "
        "('FROTO', '2025-05-20', 'other', 0.9, 'yfinance'), ('FROTO', '2025-05-21', 'other', 0.95, 'manual')"
    )
    await _load(prices)
    assert await count("SELECT count(*) AS n FROM core.prices_daily") == before
    kinds = await (
        await prices.execute(
            "SELECT ex_date, kind, source FROM core.corporate_actions WHERE ticker = 'FROTO' ORDER BY ex_date"
        )
    ).fetchall()
    assert [(r["ex_date"].isoformat(), r["kind"], r["source"]) for r in kinds] == [
        ("2025-04-03", "temettu", "isyatirim"),
        ("2025-05-07", "bedelsiz", "isyatirim"),
        ("2025-05-21", "other", "manual"),  # manual rows are never touched by ingestion
    ]
    await prices.rollback()


async def test_raw_and_adjusted_levels(prices: DictConn) -> None:
    assert await close_on(prices, "THYAO", date(2026, 9, 1)) == D("301.5")
    assert await close_on(prices, "THYAO", date(2026, 7, 15)) is None
    assert await open_on(prices, "THYAO", date(2026, 8, 4)) is None  # Yahoo's open rejected
    o = await open_on(prices, "THYAO", date(2026, 9, 1))
    assert o is not None and D(300) <= o <= D("305.5")
    # FROTO: raw levels stay raw; the adjusted close before the split is 1/10 (and the dividend after it is
    # outside the window, so the only factors are 2025-04-03 dividend and 2025-05-07 bonus).
    assert await close_on(prices, "FROTO", date(2025, 5, 6)) == D("877.5")
    adj = await close_on(prices, "FROTO", date(2025, 5, 6), basis="adjusted")
    assert adj is not None and abs(adj - D("87.75")) < D("0.001")
    adj_open = await open_on(prices, "FROTO", date(2025, 5, 7), basis="adjusted")
    assert adj_open is not None and abs(adj_open - (await open_on(prices, "FROTO", date(2025, 5, 7)) or 0)) < D(
        "0.000001"
    )
    # XU100 has no İş Yatırım rows → Yahoo adjusted series for returns, no raw level.
    assert await close_on(prices, "XU100", date(2026, 9, 1)) is None
    assert await close_on(prices, "XU100", date(2026, 9, 1), basis="adjusted") is not None
    assert await open_on(prices, "XU100", date(2026, 9, 1), basis="adjusted") is not None
    assert await close_on(prices, "NOPE1", date(2026, 9, 1), basis="adjusted") is None


async def test_adv20_is_point_in_time(prices: DictConn) -> None:
    asof = date(2026, 9, 30)
    rows = await (
        await prices.execute(
            "SELECT turnover_try FROM core.prices_daily"
            " WHERE ticker = 'THYAO' AND source = 'isyatirim' AND d >= %s AND d < %s",
            (add_sessions(asof, -20), asof),
        )
    ).fetchall()
    assert len(rows) == 20
    assert await adv20(prices, "THYAO", asof) == sum(r["turnover_try"] for r in rows) / 20
    assert await adv20(prices, "THYAO", date(2026, 7, 2)) is None  # only two sessions stored before
    assert await adv20(prices, "TRKCM", date(2020, 3, 31)) is not None  # delisted name still has history


async def test_returns_across_the_split_use_the_adjusted_series(prices: DictConn) -> None:
    # Across the 10:1 bonus the raw close falls 90 %; the adjusted return is a few percent.
    r = await forward_return(prices, "FROTO", date(2025, 5, 6), 1, entry="close")
    assert r is not None and abs(r - (D("87.25") / D("87.75") - 1)) < D("0.0001")
    one_day = await forward_return(prices, "FROTO", date(2025, 5, 7), 1)
    o, c = await open_on(prices, "FROTO", date(2025, 5, 7)), await close_on(prices, "FROTO", date(2025, 5, 7))
    assert o is not None and c is not None and one_day is not None and abs(one_day - (c / o - 1)) < D("0.000001")
    five = await forward_return(prices, "FROTO", date(2025, 5, 2), 5)
    assert five is not None and abs(five) < D("0.2")
    # Index from Yahoo; no bar → None; bad horizon → error.
    assert await forward_return(prices, "XU100", date(2026, 9, 1), 5) is not None
    assert await forward_return(prices, "THYAO", date(2026, 9, 28), 20) is None
    assert await forward_return(prices, "THYAO", date(2026, 8, 4), 1) is not None  # no raw open → Yahoo series
    with pytest.raises(ValueError, match="horizon"):
        await forward_return(prices, "THYAO", date(2026, 9, 1), 0)
    rets = await daily_returns(prices, "FROTO", date(2025, 5, 5), date(2025, 5, 9))
    assert [d.day for d, _ in rets] == [5, 6, 7, 8, 9]
    assert all(abs(x) < D("0.1") for _, x in rets)  # no -90 % day at the split


async def test_latest_mark_is_point_in_time(prices: DictConn) -> None:
    before_open = await latest_mark(prices, "THYAO", ist(2026, 9, 30, 9, 0))
    assert before_open is not None and (before_open.d, before_open.field) == (date(2026, 9, 29), "close")
    in_session = await latest_mark(prices, "THYAO", ist(2026, 9, 30, 10, 20))
    assert in_session is not None and (in_session.d, in_session.field) == (date(2026, 9, 30), "open")
    after_eod = await latest_mark(prices, "THYAO", ist(2026, 9, 30, 18, 31))
    assert after_eod is not None and (after_eod.d, after_eod.field) == (date(2026, 9, 30), "close")
    assert after_eod.price == await close_on(prices, "THYAO", date(2026, 9, 30))
    holiday = await latest_mark(prices, "THYAO", ist(2026, 7, 15, 12, 0))
    assert holiday is not None and holiday.d == date(2026, 7, 14)
    weekend = await latest_marks(prices, ["THYAO", "FROTO", "XU100", "THYAO"], ist(2026, 10, 3, 12, 0))
    assert set(weekend) == {"THYAO", "FROTO"} and weekend["THYAO"].d == date(2026, 9, 30)
    assert weekend["FROTO"].d == date(2025, 6, 30)  # caller judges staleness from Mark.d (R09)
    assert await latest_marks(prices, [], ist(2026, 10, 3, 12, 0)) == {}
    source = DbPriceSource(prices)
    mark = await source.latest_mark("THYAO", ist(2026, 9, 30, 18, 31))
    assert mark == after_eod
    assert await source.latest_mark("THYAO", ist(2026, 6, 1, 12, 0)) is None
