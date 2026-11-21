"""Company page, search, watchlist and the disclosure filters / reading, against the test database."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from kaptan.db import DictConn
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

TICKER = "ZZINS"
OTHER = "ZZINT"
IDX = 995000001
DAY = "2030-03-05"

DISCLOSURE = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  published_at, first_seen_at, available_at, ingest_source, origin, visible, classification)
VALUES (%s, NULL, %s, '{}', %s, 'Deneme Hava Yolları A.O.', 'ODA', 'ODA', 'Yeni İş İlişkisi', 'Büyük sipariş', 'NEW',
  'E3', 'subject_map.v1', '2030-03-05 09:00+00', NULL, '2030-03-05 09:01+00', 'live', 'kap', true, %s)
"""


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    """Committed rows the API connections can see; removed afterwards."""
    await owner_pg.execute(
        "INSERT INTO core.issuer_profiles (ticker, name, sector, source)"
        " VALUES (%s, 'Deneme Hava Yolları', 'Ulaştırma', 'manual')",
        (TICKER,),
    )
    await owner_pg.execute(
        DISCLOSURE, (IDX, [TICKER], TICKER, '{"event_type": "E3", "confidence": 0.9, "method": "subject_map"}')
    )
    await owner_pg.execute(DISCLOSURE.replace("'NEW',\n  'E3'", "'NEW',\n  'E1'"), (IDX + 1, [OTHER], OTHER, None))
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker LIKE 'ZZ%'")
        await owner_pg.execute("DELETE FROM core.disclosures WHERE disclosure_index IN (%s, %s)", (IDX, IDX + 1))
        await owner_pg.execute("DELETE FROM core.issuer_profiles WHERE ticker = %s", (TICKER,))
        await owner_pg.commit()


async def _auth(client: httpx.AsyncClient) -> dict[str, str]:
    return bearer((await login(client))["access_token"])


async def test_it_all_needs_a_session(client: httpx.AsyncClient) -> None:
    for url in ("/api/v1/companies/THYAO", "/api/v1/search?q=thy", "/api/v1/watchlist", f"/api/v1/disclosures/{IDX}"):
        assert (await client.get(url)).status_code == 401
    assert (await client.put("/api/v1/watchlist/THYAO")).status_code == 401


async def test_search_finds_a_company_by_turkish_name_and_disclosures_by_words(
    client: httpx.AsyncClient, data: None
) -> None:
    h = await _auth(client)
    found = (await client.get("/api/v1/search", params={"q": "HAVA YOLLARI"}, headers=h)).json()
    assert [c["ticker"] for c in found["companies"]] == [TICKER]
    by_code = (await client.get("/api/v1/search", params={"q": "zzins"}, headers=h)).json()
    assert by_code["companies"][0]["ticker"] == TICKER
    words = (await client.get("/api/v1/search", params={"q": "yeni is iliskisi"}, headers=h)).json()
    assert IDX in [d["disclosure_index"] for d in words["disclosures"]]
    assert (await client.get("/api/v1/search", params={"q": "a"}, headers=h)).json()["companies"] == []
    assert (await client.get("/api/v1/search", params={"q": "100%_"}, headers=h)).status_code == 200


async def test_company_page_and_unknown_code(client: httpx.AsyncClient, data: None) -> None:
    h = await _auth(client)
    page = await client.get(f"/api/v1/companies/{TICKER.lower()}", headers=h)
    assert page.status_code == 200, page.text
    doc = page.json()
    assert doc["name"] == "Deneme Hava Yolları" and doc["sector"] == "Ulaştırma" and doc["watched"] is False
    assert doc["price"]["points"] == [] and doc["position"] is None and doc["decisions"] == []
    assert [d["disclosure_index"] for d in doc["disclosures"]] == [IDX]
    assert doc["following"]["known"] is False
    assert (await client.get("/api/v1/companies/QQQQQ", headers=h)).status_code == 404
    assert (await client.get("/api/v1/companies/AB", headers=h)).status_code == 422
    assert (await client.get(f"/api/v1/companies/{TICKER}?period=5y", headers=h)).status_code == 422


async def test_watchlist_star_unstar_is_audited_and_capped(
    client: httpx.AsyncClient, data: None, owner_pg: DictConn
) -> None:
    h = await _auth(client)
    # The shared test database may already hold seeded watchlist rows (the demo seed): compare to them.
    before = [w["ticker"] for w in (await client.get("/api/v1/watchlist", headers=h)).json()]
    assert TICKER not in before
    first = await client.put(f"/api/v1/watchlist/{TICKER}", headers=h)
    assert first.status_code == 200 and sorted(w["ticker"] for w in first.json()) == sorted([*before, TICKER])
    again = await client.put(f"/api/v1/watchlist/{TICKER}", headers=h)  # starring twice is one record
    assert again.status_code == 200 and len(again.json()) == len(before) + 1
    assert (await client.get(f"/api/v1/companies/{TICKER}", headers=h)).json()["watched"] is True
    assert (await client.put("/api/v1/watchlist/NOPE9", headers=h)).status_code == 404

    cur = await owner_pg.execute(
        "SELECT action, entity_id FROM audit.audit_log WHERE action LIKE 'watchlist.%' ORDER BY chain_pos DESC LIMIT 5"
    )
    assert [r["action"] for r in await cur.fetchall()].count("watchlist.added") >= 1

    gone = await client.delete(f"/api/v1/watchlist/{TICKER}", headers=h)
    assert gone.status_code == 200 and sorted(w["ticker"] for w in gone.json()) == sorted(before)
    cur = await owner_pg.execute("SELECT action FROM audit.audit_log WHERE action = 'watchlist.removed' LIMIT 1")
    assert await cur.fetchone() is not None

    for i in range(50):
        await owner_pg.execute("INSERT INTO core.watchlist (ticker, ord) VALUES (%s, %s)", (f"ZZ{i:03d}", 1000 + i))
    await owner_pg.commit()
    full = await client.put(f"/api/v1/watchlist/{TICKER}", headers=h)
    assert full.status_code == 409 and full.json()["code"] == "watchlist_full"


async def test_disclosure_filters_and_reading(client: httpx.AsyncClient, data: None) -> None:
    h = await _auth(client)
    day = {"day": DAY, "limit": 50}
    everything = (await client.get("/api/v1/disclosures", params=day, headers=h)).json()
    assert {IDX, IDX + 1} <= {d["disclosure_index"] for d in everything}
    typed = (await client.get("/api/v1/disclosures", params={**day, "type": "E3"}, headers=h)).json()
    assert [d["disclosure_index"] for d in typed] == [IDX]
    assert (await client.get("/api/v1/disclosures", params={**day, "type": "X9"}, headers=h)).status_code == 422
    assert (await client.get("/api/v1/disclosures", params={**day, "acted": "true"}, headers=h)).json() == []

    assert (await client.get("/api/v1/disclosures", params={**day, "scope": "watchlist"}, headers=h)).json() == []
    await client.put(f"/api/v1/watchlist/{TICKER}", headers=h)
    mine = (await client.get("/api/v1/disclosures", params={**day, "scope": "watchlist"}, headers=h)).json()
    assert [d["disclosure_index"] for d in mine] == [IDX]
    assert (await client.get("/api/v1/disclosures", params={**day, "scope": "mine"}, headers=h)).json() == mine

    reading: dict[str, Any] = (await client.get(f"/api/v1/disclosures/{IDX}", headers=h)).json()
    assert reading["disclosure_index"] == IDX and reading["numbers"] == [] and reading["decision"] is None
    assert (await client.get("/api/v1/disclosures/1", headers=h)).status_code == 404
    assert (await client.get("/api/v1/disclosures/counters", headers=h)).status_code == 200
