"""GET /me/calendar and GET /market/strip against the test database (agent HOME)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest

from kaptan.db import DictConn
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

TICKER = "ZZAGN"
IDX = 996000001
INSERT = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  published_at, first_seen_at, available_at, ingest_source, origin, visible)
VALUES (%s, NULL, %s, '{}', %s, 'Deneme A.Ş.', %s, %s, %s, %s, 'NEW', 'E3', 'subject_map.v1',
  %s, NULL, %s, 'live', 'kap', true)
"""


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    await owner_pg.execute("INSERT INTO core.watchlist (ticker, ord, added_at) VALUES (%s, 999, now())", (TICKER,))
    meeting = ("2030-03-05 09:00+00", "2030-03-05 09:01+00")
    await owner_pg.execute(
        INSERT,
        (
            IDX,
            [TICKER],
            TICKER,
            "ODA",
            "ODA",
            "Genel Kurul İşlemlerine İlişkin Bildirim",
            "Genel Kurul 20.03.2030 günü",
            *meeting,
        ),
    )
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker = %s", (TICKER,))
        await owner_pg.execute("DELETE FROM core.disclosures WHERE disclosure_index = %s", (IDX,))
        await owner_pg.commit()


async def test_both_need_a_session(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/me/calendar")).status_code == 401
    assert (await client.get("/api/v1/market/strip")).status_code == 401


async def test_calendar_shape_and_days_bounds(client: httpx.AsyncClient) -> None:
    h = bearer((await login(client))["access_token"])
    doc = (await client.get("/api/v1/me/calendar", headers=h)).json()
    assert set(doc) == {"from", "to", "events", "notes"}
    assert doc["notes"]
    assert_matches("Calendar", doc)
    assert (await client.get("/api/v1/me/calendar", params={"days": 0}, headers=h)).status_code == 422
    assert (await client.get("/api/v1/me/calendar", params={"days": 121}, headers=h)).status_code == 422


async def test_strip_has_market_state_and_honest_nulls(client: httpx.AsyncClient) -> None:
    h = bearer((await login(client))["access_token"])
    doc = (await client.get("/api/v1/market/strip", headers=h)).json()
    assert doc["market"]["label"] in ("Borsa açık", "Borsa kapalı")
    assert "index" in doc and "usd_try" in doc
    assert_matches("MarketStrip", doc)


async def test_watched_company_general_meeting_comes_from_its_notice(owner_pg: DictConn, data: None) -> None:
    from datetime import UTC, date, datetime

    from kaptan.agenda import events

    doc = await events.calendar(owner_pg, datetime(2030, 3, 6, 9, 0, tzinfo=UTC), 30)
    mine = [e for e in doc["events"] if e["ticker"] == TICKER]
    assert [(e["kind"], e["day"], e["why"], e["approximate"]) for e in mine] == [
        ("general_meeting", date(2030, 3, 20), "watched", False)
    ]
    assert mine[0]["source_url"].endswith(str(IDX))
