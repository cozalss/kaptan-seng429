"""GET /me/digest and the watchlist bypass of the pre-gate against the test database (agent INFO)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
import pytest
from psycopg.types.json import Jsonb

from kaptan.agents.feed import _pre_gate_vetoes
from kaptan.db import DictConn
from kaptan.digest.store import digest
from kaptan.risk.watch import is_watched
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

BASE = 997100000
WATCHED, OTHER, HELD_NOISE = "ZZDWA", "ZZDOT", "ZZDNO"
FRIDAY = datetime(2030, 3, 8, 9, 0, tzinfo=UTC)  # a trading day
NOW_SATURDAY = datetime(2030, 3, 9, 9, 0, tzinfo=UTC)
INSERT = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  is_noise, published_at, first_seen_at, available_at, ingest_source, origin, visible, parsed, fin_year, fin_period)
VALUES (%(i)s, NULL, %(codes)s, '{}', %(t)s, 'Deneme A.Ş.', 'ODA', 'ODA', %(subject)s, %(summary)s, %(reason)s,
  %(route)s, 'subject_map.v1', %(noise)s, %(at)s, NULL, %(at)s, 'live', 'kap', true, %(parsed)s, %(fy)s, %(fp)s)
"""


def doc(offset: int, ticker: str, subject: str, route: str, **kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "i": BASE + offset,
        "codes": [ticker],
        "t": ticker,
        "subject": subject,
        "summary": "",
        "reason": "NEW",
        "route": route,
        "noise": False,
        "at": FRIDAY,
        "parsed": None,
        "fy": None,
        "fp": None,
    }
    return {**base, **kw}


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    rows = [
        doc(1, WATCHED, "Finansal Rapor", "E4", fy=2030, fp="4"),
        doc(2, OTHER, "Yeni İş İlişkisi", "E3"),
        doc(3, OTHER, "Pay Bazında Devre Kesici Bildirimi", "noise", noise=True),
        doc(4, OTHER, "Sorumluluk Beyanı (Konsolide)", "archive_only"),
        doc(5, OTHER, "Finansal Rapor", "E4", reason="CORR"),
        doc(6, OTHER, "Pay Alım Satım Bildirimi", "E2", parsed=Jsonb({"status": "ok", "direction": "buy"})),
    ]
    await owner_pg.execute("INSERT INTO core.watchlist (ticker, ord, added_at) VALUES (%s, 998, now())", (WATCHED,))
    for r in rows:
        await owner_pg.execute(INSERT, r)
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM core.universe_overrides WHERE ticker = %s", (WATCHED,))
        await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker = %s", (WATCHED,))
        await owner_pg.execute(
            "DELETE FROM core.disclosures WHERE disclosure_index BETWEEN %s AND %s", (BASE, BASE + 99)
        )
        await owner_pg.commit()


async def test_needs_a_session_and_a_good_day(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/me/digest")).status_code == 401
    h = bearer((await login(client))["access_token"])
    assert (await client.get("/api/v1/me/digest", params={"day": "bugun"}, headers=h)).status_code == 422
    assert (await client.get("/api/v1/me/digest", params={"day": "2030-02-31"}, headers=h)).status_code == 422
    doc_ = (await client.get("/api/v1/me/digest", params={"day": "2030-03-08"}, headers=h)).json()
    assert_matches("Digest", doc_)


async def test_the_day_lists_only_notable_new_events_watched_first(owner_pg: DictConn, data: None) -> None:
    out = await digest(owner_pg, NOW_SATURDAY, FRIDAY.date())
    mine = [i for i in out["items"] if i["ticker"] in (WATCHED, OTHER)]
    assert [(i["ticker"], i["kind"]) for i in mine] == [
        (WATCHED, "earnings"),
        (OTHER, "insider"),
        (OTHER, "contract"),
    ]
    assert mine[0]["why"] == "watched" and "2030 yıllık" in mine[0]["line"]
    assert all(i["source_url"].endswith(str(i["disclosure_index"])) for i in mine)
    assert all(i["outside_list"] for i in mine)  # none of them is in the test universe
    assert out["note"] is None and out["is_trading_day"] is True


async def test_at_the_weekend_the_default_is_the_last_trading_day(owner_pg: DictConn, data: None) -> None:
    out = await digest(owner_pg, NOW_SATURDAY)
    assert str(out["day"]) == "2030-03-08"
    assert out["note"] == "Borsa kapalı; son işlem gününün duyuruları."
    assert out["next_day"] is None
    assert str(out["prev_day"]) == "2030-03-07"
    assert any(i["ticker"] == WATCHED for i in out["items"])


async def test_an_empty_closed_day_is_honest(owner_pg: DictConn) -> None:
    out = await digest(owner_pg, NOW_SATURDAY, datetime(2030, 3, 9).date())
    assert out["items"] == [] and out["total"] == 0
    assert out["is_trading_day"] is False and out["note"] == "Bu gün borsa kapalıydı."


async def test_a_watched_stock_is_not_vetoed_by_the_universe(owner_pg: DictConn, data: None) -> None:
    assert await is_watched(owner_pg, WATCHED) is True
    assert await is_watched(owner_pg, OTHER) is False
    assert await _pre_gate_vetoes(owner_pg, OTHER) is True  # outside the universe, not watched
    assert await _pre_gate_vetoes(owner_pg, WATCHED) is False  # watched: analysed like any other


async def test_an_exclusion_you_wrote_beats_the_star(owner_pg: DictConn, data: None) -> None:
    await owner_pg.execute(
        "INSERT INTO core.universe_overrides (ticker, mode, reason, set_by, set_at) "
        "VALUES (%s, 'exclude', 'Ben bu şirketi dışarıda bırakmak istiyorum', 'test', now())",
        (WATCHED,),
    )
    await owner_pg.commit()
    assert await is_watched(owner_pg, WATCHED) is False
    assert await _pre_gate_vetoes(owner_pg, WATCHED) is True


async def test_the_price_jobs_always_fetch_the_watched_stocks(owner_pg: DictConn, data: None) -> None:
    from datetime import date

    from kaptan.workers.scheduler import EOD_TICKERS_SQL, WATCHED_SQL

    async def tickers(sql: str, params: object = ()) -> set[str]:
        async with owner_pg.cursor() as cur:
            await cur.execute(sql, params)
            return {str(r["ticker"]) for r in await cur.fetchall()}

    assert WATCHED in await tickers(WATCHED_SQL)
    assert WATCHED in await tickers(EOD_TICKERS_SQL, {"day": date(2030, 3, 8)})
