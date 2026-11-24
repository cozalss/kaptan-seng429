"""One meaning of "important" against the test database (wave 6 SIGNAL)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
from psycopg.types.json import Jsonb

from kaptan.alerts.watch import AlertWatch
from kaptan.brief.build import build_brief
from kaptan.db import DictConn
from kaptan.digest.store import digest
from kaptan.reading.marks import read_all, reading_state
from kaptan.signal import describe, signals_between
from kaptan.signal.triage import set_state
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

BASE = 995500000
HELD, WATCHED, STRANGER = "ZZSHE", "ZZSWA", "ZZSOT"
AT = datetime(2030, 5, 7, 9, 0, tzinfo=UTC)  # a Tuesday
NOW = datetime(2030, 5, 7, 12, 0, tzinfo=UTC)
INSERT = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  is_noise, published_at, first_seen_at, available_at, ingest_source, origin, visible, parsed, fin_year, fin_period)
VALUES (%(i)s, NULL, %(codes)s, '{}', %(t)s, 'Deneme A.Ş.', 'ODA', 'ODA', %(subject)s, '', 'NEW',
  %(route)s, 'subject_map.v1', %(noise)s, %(at)s, NULL, %(at)s, 'live', 'kap', true, %(parsed)s, %(fy)s, %(fp)s)
"""


def doc(offset: int, ticker: str, subject: str, route: str, **kw: Any) -> dict[str, Any]:
    base = {"i": BASE + offset, "codes": [ticker], "t": ticker, "subject": subject, "route": route, "noise": False,
            "at": AT, "parsed": None, "fy": None, "fp": None}  # fmt: skip
    return {**base, **kw}


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    buyback = Jsonb({"status": "ok", "latest": {"date": "2030-05-07", "price_try": "10.5", "nominal_try": "2000"}})
    rows = [
        doc(1, HELD, "Pay Geri Alım", "E1", parsed=buyback),
        doc(2, WATCHED, "Finansal Rapor", "E4", fy=2030, fp="1"),
        doc(3, STRANGER, "Pay Alım Satım Bildirimi", "E2", parsed=Jsonb({"status": "ok", "direction": "sell"})),
        doc(4, HELD, "Devre Kesici", "noise", noise=True),
        doc(5, HELD, "Sorumluluk Beyanı", "archive_only"),
    ]
    for r in rows:
        await owner_pg.execute(INSERT, r)
    await owner_pg.execute("INSERT INTO core.watchlist (ticker, ord, added_at) VALUES (%s, 997, now())", (WATCHED,))
    await owner_pg.execute(
        "INSERT INTO trading.positions (book, origin, ticker, company_name, qty, avg_cost, last_price, opened_at,"
        " planned_exit_date, strategy_version, realized_pnl)"
        " VALUES ('personal', 'own', %s, 'Deneme', 10, 10, 10, %s, %s, '', 0)",
        (HELD, AT, AT.date()),
    )
    await owner_pg.execute("UPDATE core.reading_state SET read_through = '2030-05-01 00:00+00'")
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM trading.positions WHERE ticker = %s", (HELD,))
        await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker = %s", (WATCHED,))
        for table in ("disclosure_triage", "disclosure_read", "signal_line"):
            await owner_pg.execute(f"DELETE FROM core.{table} WHERE disclosure_index >= %s", (BASE,))  # noqa: S608
        await owner_pg.execute("DELETE FROM core.disclosures WHERE disclosure_index >= %s", (BASE,))
        await owner_pg.commit()


async def test_describe_gives_one_meaning_of_important(owner_pg: DictConn, data: None) -> None:
    held = await describe(owner_pg, BASE + 1, NOW)
    assert held is not None and held.important and held.mine == "held" and held.kind == "buyback"
    assert "2.000 adet" in held.line_tr and "10,50 ₺" in held.line_tr and held.tone == "olumlu"
    assert held.panel_path == f"/bildirimler?gun=2030-05-07&bildirim={BASE + 1}"
    watched = await describe(owner_pg, BASE + 2, NOW)
    assert watched is not None and watched.mine == "watched" and watched.tone == "belirsiz"
    stranger = await describe(owner_pg, BASE + 3, NOW)
    assert stranger is not None and stranger.mine is None and stranger.tone == "olumsuz"
    for n in (4, 5):  # noise and archive-only are not important
        s = await describe(owner_pg, BASE + n, NOW)
        assert s is not None and s.important is False and s.kind is None
    assert await describe(owner_pg, 1, NOW) is None


async def test_signals_between_filters(owner_pg: DictConn, data: None) -> None:
    lo, hi = AT - timedelta(hours=1), AT + timedelta(hours=1)
    important = await signals_between(owner_pg, lo, hi, now=NOW)
    assert {s.disclosure_index for s in important if s.disclosure_index >= BASE} == {BASE + 1, BASE + 2, BASE + 3}
    mine = await signals_between(owner_pg, lo, hi, only_mine=True, now=NOW)
    assert {s.disclosure_index for s in mine if s.disclosure_index >= BASE} == {BASE + 1, BASE + 2}
    everything = await signals_between(owner_pg, lo, hi, only_important=False, now=NOW)
    assert {s.disclosure_index for s in everything if s.disclosure_index >= BASE} == {BASE + n for n in range(1, 6)}


async def test_a_held_stock_that_is_not_watched_gets_an_alert(owner_pg: DictConn, data: None) -> None:
    class Pool:
        def connection(self) -> Any:
            return _Ctx(owner_pg)

    class _Ctx:
        def __init__(self, conn: DictConn) -> None:
            self.conn = conn

        async def __aenter__(self) -> DictConn:
            return self.conn

        async def __aexit__(self, *_: object) -> None:
            return None

    watch = AlertWatch(None, Pool(), None, lambda: NOW)  # type: ignore[arg-type]
    stamp = f"{int(NOW.timestamp() * 1000)}-0"

    def entry(index: int) -> tuple[str, dict[str, str]]:
        return stamp, {"event": "disclosure", "data": json.dumps({"disclosure_index": index})}

    held = await watch.mine_hits([entry(BASE + 1)], frozenset(), NOW)
    assert [(s.ticker, s.mine) for s in held] == [(HELD, "held")]  # HELD is not on the watchlist: it still counts
    # held wins over watched
    await owner_pg.execute("INSERT INTO core.watchlist (ticker, ord, added_at) VALUES (%s, 996, now())", (HELD,))
    both = await watch.mine_hits([entry(BASE + 1)], frozenset(), NOW)
    await owner_pg.execute("DELETE FROM core.watchlist WHERE ticker = %s", (HELD,))
    assert both[0].mine == "held"
    # noise of a held stock, a stranger's disclosure and a muted stock are not announced
    assert await watch.mine_hits([entry(BASE + 4), entry(BASE + 5), entry(BASE + 3)], frozenset(), NOW) == []
    assert await watch.mine_hits([entry(BASE + 1)], frozenset({HELD}), NOW) == []


async def test_unread_counts_only_important_of_mine_and_triage_is_one_concept(owner_pg: DictConn, data: None) -> None:
    state = await reading_state(owner_pg, NOW)
    assert set(state["unread_indexes"]) >= {BASE + 1, BASE + 2} and BASE + 3 not in state["unread_indexes"]
    assert BASE + 4 not in state["unread_indexes"] and BASE + 5 not in state["unread_indexes"]
    assert state["unread_other"] >= 1
    await set_state(owner_pg, BASE + 1, "yapilacak", now=NOW)
    await set_state(owner_pg, BASE + 2, "sonra", now=NOW)
    state = await reading_state(owner_pg, NOW)
    assert BASE + 1 not in state["unread_indexes"] and BASE + 2 not in state["unread_indexes"]
    assert state["saved_indexes"][:1] == [BASE + 2]  # the old star is the state "sonra"
    assert {"disclosure_index": BASE + 1, "state": "yapilacak"} in state["triage"] and state["act_count"] >= 1
    await read_all(owner_pg, now=NOW)  # the plain call clears nothing that counts
    assert (await reading_state(owner_pg, NOW))["read_through"].isoformat().startswith("2030-05-01")
    await read_all(owner_pg, now=NOW, important=True)
    assert (await reading_state(owner_pg, NOW))["unread"] == 0


async def test_digest_and_brief_carry_the_same_lines(owner_pg: DictConn, data: None) -> None:
    out = await digest(owner_pg, NOW, date(2030, 5, 7))
    item = next(i for i in out["items"] if i["disclosure_index"] == BASE + 1)
    assert item["line"].startswith("Kendi hissesinden") and item["tone"] == "olumlu" and item["why"] == "held"
    assert "henüz alım yok" not in item["line"] and item["panel_path"].endswith(f"bildirim={BASE + 1}")
    brief = await build_brief(owner_pg, date(2030, 5, 7), NOW)
    mine = [s for s in brief["signals"] if s["disclosure_index"] >= BASE]
    assert [s["mine"] for s in mine][:2] == ["held", "watched"]  # mine first, held first
    assert brief["missed_note_tr"] is None
    assert "önemli duyuru var" in brief["summary_tr"]


async def test_endpoints(client: httpx.AsyncClient, data: None) -> None:
    assert (await client.get("/api/v1/me/signals")).status_code == 401
    h = bearer((await login(client))["access_token"])
    assert (await client.get("/api/v1/me/signals", params={"day": "x"}, headers=h)).status_code == 422
    out = (await client.get("/api/v1/me/signals", params={"day": "2030-05-07"}, headers=h)).json()
    assert_matches("SignalList", out)
    assert out["items"][0]["mine"] == "held"
    one = await client.get(f"/api/v1/me/signals/{BASE + 2}", headers=h)
    assert_matches("SignalItem", one.json())
    assert (await client.get("/api/v1/me/signals/1", headers=h)).status_code == 404
    put = await client.put(f"/api/v1/me/triage/{BASE + 2}", json={"state": "tamam"}, headers=h)
    assert put.status_code == 200 and {"disclosure_index": BASE + 2, "state": "tamam"} in put.json()["triage"]
    assert (await client.put("/api/v1/me/triage/1", json={"state": "tamam"}, headers=h)).status_code == 404
    assert (await client.put(f"/api/v1/me/triage/{BASE}", json={"state": "x"}, headers=h)).status_code == 422
    gone = await client.delete(f"/api/v1/me/triage/{BASE + 2}", headers=h)
    assert all(m["disclosure_index"] != BASE + 2 for m in gone.json()["triage"])
