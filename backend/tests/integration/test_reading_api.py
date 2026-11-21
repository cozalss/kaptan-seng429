"""Saved and unread disclosures, price statistics, BIST 100 line, insider strip and compare (wave 5 READ)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, timedelta

import httpx
import pytest

from kaptan.companies.market import event_counts, price_stats
from kaptan.db import DictConn
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

T1, T2 = "ZZRDA", "ZZRDB"
IDX = 996000001  # T1 buyback (E1), IDX+1 T1 insider (E2), IDX+2 T2 noise
STAMP = "2030-04-01 09:00+00"
LATE = "2030-04-05 09:00+00"

DISC = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  published_at, first_seen_at, available_at, ingest_source, origin, visible, is_noise, classification)
VALUES (%s, NULL, %s, '{}', %s, 'Deneme A.S.', 'ODA', 'ODA', 'Konu', 'Ozet', 'NEW', 'E1', 'subject_map.v1',
  %s, NULL, %s, 'live', 'kap', true, %s, %s)
"""
PRICE = """
INSERT INTO core.prices_daily (ticker, d, open, high, low, close, volume, source, price_basis)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'raw')
"""


def _cls(t: str) -> str:
    return f'{{"event_type": "{t}", "confidence": 0.9, "method": "subject_map"}}'


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    for t in (T1, T2):
        await owner_pg.execute(
            "INSERT INTO core.issuer_profiles (ticker, name, sector, source) VALUES (%s, %s, 'Deneme', 'manual')",
            (t, f"Sirket {t}"),
        )
    await owner_pg.execute(DISC, (IDX, [T1], T1, STAMP, LATE, False, _cls("E1")))
    await owner_pg.execute(DISC, (IDX + 1, [T1], T1, "2030-04-02 09:00+00", LATE, False, _cls("E2")))
    await owner_pg.execute(DISC, (IDX + 2, [T2], T2, STAMP, LATE, True, None))
    today = date.today()
    for i in range(5):
        d = today - timedelta(days=i + 1)
        await owner_pg.execute(PRICE, (T1, d, 10, 12 + i, 9, 11 + i, 1000 + i, "isyatirim"))
        await owner_pg.execute(PRICE, (T2, d, 20, 21, 19, 20, 500, "isyatirim"))
        await owner_pg.execute(PRICE, ("XU100", d, None, None, None, 9000 + i, None, "yfinance"))
    await owner_pg.execute("UPDATE core.reading_state SET read_through = '2030-01-01 00:00+00'")
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker IN (%s, %s)", (T1, T2))
        await owner_pg.execute("DELETE FROM core.disclosure_saved WHERE disclosure_index >= %s", (IDX,))
        await owner_pg.execute("DELETE FROM core.disclosure_read WHERE disclosure_index >= %s", (IDX,))
        await owner_pg.execute("DELETE FROM core.disclosures WHERE disclosure_index >= %s", (IDX,))
        await owner_pg.execute("DELETE FROM core.prices_daily WHERE ticker IN (%s, %s, 'XU100')", (T1, T2))
        await owner_pg.execute("DELETE FROM core.issuer_profiles WHERE ticker IN (%s, %s)", (T1, T2))
        await owner_pg.commit()


async def _auth(client: httpx.AsyncClient) -> dict[str, str]:
    return bearer((await login(client))["access_token"])


def test_pure_stats_and_counts() -> None:
    assert price_stats([]) is None
    row = {"d": date(2030, 1, 2), "adj_high": None, "adj_low": None, "adj_close": 10, "adj_factor": 1,
           "raw_close": 10, "high": None, "low": None, "volume": None}  # fmt: skip
    stats = price_stats([row])
    assert stats is not None and stats["year_high"] == 10.0 and stats["day_high"] is None and stats["volume"] is None
    assert stats["adjusted"] is False and stats["from_high_pct"] == 0.0
    assert event_counts([{"etype": "E1", "n": 2}, {"etype": None, "n": 1}])["total"] == 3


async def test_needs_a_session(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/me/reading")).status_code == 401
    assert (await client.get("/api/v1/compare?a=AAAA&b=BBBB")).status_code == 401


async def test_unread_save_and_read_all(client: httpx.AsyncClient, data: None) -> None:
    h = await _auth(client)
    first = (await client.get("/api/v1/me/reading", headers=h)).json()
    assert IDX not in first["unread_indexes"]  # not starred yet
    await client.put(f"/api/v1/watchlist/{T1}", headers=h)
    st = (await client.get("/api/v1/me/reading", headers=h)).json()
    assert {IDX, IDX + 1} <= set(st["unread_indexes"]) and IDX + 2 not in st["unread_indexes"]
    one = (await client.put(f"/api/v1/me/reading/read/{IDX}", headers=h)).json()
    assert IDX not in one["unread_indexes"] and IDX + 1 in one["unread_indexes"]
    assert (await client.put("/api/v1/me/reading/read/1", headers=h)).status_code == 404

    saved = (await client.put(f"/api/v1/me/reading/saved/{IDX + 1}", headers=h)).json()
    assert saved["saved_indexes"] == [IDX + 1]
    again = (await client.put(f"/api/v1/me/reading/saved/{IDX + 1}", headers=h)).json()
    assert again["saved_indexes"] == [IDX + 1]
    listed = (await client.get("/api/v1/me/reading/saved", headers=h)).json()
    assert [d["disclosure_index"] for d in listed] == [IDX + 1]
    assert (await client.put("/api/v1/me/reading/saved/1", headers=h)).status_code == 404
    gone = (await client.delete(f"/api/v1/me/reading/saved/{IDX + 1}", headers=h)).json()
    assert gone["saved_indexes"] == []

    # "Hepsini okundu say" never moves the mark back: the stored 2030 mark stays, so nothing 2030 is unread
    # only if it was already older; here the API clock is earlier, so the state is unchanged.
    done = await client.post("/api/v1/me/reading/read-all", headers=h)
    assert done.status_code == 200 and done.json()["read_through"] >= "2030-01-01"


async def test_company_page_stats_benchmark_and_insiders(client: httpx.AsyncClient, data: None) -> None:
    h = await _auth(client)
    doc = (await client.get(f"/api/v1/companies/{T1}?period=all", headers=h)).json()
    assert doc["stats"]["year_days"] == 5 and doc["stats"]["year_high"] == 16.0 and doc["stats"]["year_low"] == 9.0
    assert doc["stats"]["day_high"] is not None and doc["stats"]["volume"] is not None
    assert doc["benchmark"]["name"] == "BIST 100" and len(doc["benchmark"]["points"]) == 5
    assert [(e["kind"], e["disclosure"]["disclosure_index"]) for e in doc["insiders"]] == [
        ("insider", IDX + 1),
        ("buyback", IDX),
    ]
    quiet = (await client.get(f"/api/v1/companies/{T2}", headers=h)).json()
    assert quiet["insiders"] == []


async def test_compare(client: httpx.AsyncClient, data: None) -> None:
    h = await _auth(client)
    res = await client.get(f"/api/v1/compare?a={T1.lower()}&b={T2}&period=all", headers=h)
    assert res.status_code == 200, res.text
    doc = res.json()
    assert doc["a"]["ticker"] == T1 and len(doc["b"]["price"]["points"]) == 5
    assert doc["a"]["events"] == {"total": 2, "buyback": 1, "insider": 1, "deal": 0, "earnings": 0}
    assert doc["b"]["events"]["total"] == 0  # the only one is noise
    assert (await client.get(f"/api/v1/compare?a={T1}&b={T1}", headers=h)).status_code == 422
    assert (await client.get(f"/api/v1/compare?a={T1}&b=QQQQQ", headers=h)).status_code == 404
