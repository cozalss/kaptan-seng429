"""GET /disclosures: the demo day's visible rows in DEMO_MODE, one Istanbul day of KAP rows otherwise."""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from kaptan.db import DictConn
from kaptan.disclosures.listing import list_disclosures, to_item
from kaptan.domain.schemas import DisclosureListItem
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

INSERT = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version,
  published_at, first_seen_at, available_at, ingest_source, origin, visible, classification)
VALUES (%s, NULL, %s, '{}', %s, 'Türk Hava Yolları A.O.', 'ODA', 'ODA', 'Yeni İş İlişkisi', 'Özet', 'NEW', 'E3',
  'subject_map.v1', %s, NULL, %s, %s, 'kap', %s, %s)
"""


async def test_demo_mode_lists_the_visible_demo_day(client: httpx.AsyncClient) -> None:
    session = await login(client)
    res = await client.get("/api/v1/disclosures?limit=5", headers=bearer(session["access_token"]))
    assert res.status_code == 200, res.text
    items = res.json()
    assert 0 < len(items) <= 5
    stamps = [i["published_at"] for i in items]
    assert stamps == sorted(stamps, reverse=True)
    bad = await client.get("/api/v1/disclosures?day=2026-13-45", headers=bearer(session["access_token"]))
    assert bad.status_code == 422
    assert (await client.get("/api/v1/disclosures")).status_code == 401


async def test_live_lists_one_istanbul_day_with_backfill(pg: DictConn) -> None:
    rows: list[tuple[Any, ...]] = [
        (
            992000001,
            ["THYAO", "THYAO.E"],
            "THYAO",
            "2030-01-06 21:30+00",
            "2030-01-06 21:31+00",
            "backfill",
            False,
            '{"event_type": "E3", "confidence": 0.9, "method": "subject_map"}',
        ),
        (992000002, ["PGSUS"], "PGSUS", "2030-01-07 12:00+00", "2030-01-07 12:01+00", "live", True, '{"x": 1}'),
        (992000003, ["ASELS"], "ASELS", "2030-01-07 21:30+00", "2030-01-07 21:31+00", "live", True, None),
    ]
    for r in rows:
        await pg.execute(INSERT, r)
    items = await list_disclosures(pg, date(2030, 1, 7), demo=False)
    assert [i["disclosure_index"] for i in items] == [992000002, 992000001]  # 00:30 Istanbul belongs to the 7th
    first = DisclosureListItem.model_validate(items[1])
    assert first.stock_codes == ["THYAO"] and first.classification is not None
    assert first.disclosure_oid == "992000001" and first.first_seen_at == first.available_at
    assert items[0]["classification"] is None
    only = await list_disclosures(pg, date(2030, 1, 7), demo=False, ticker="PGSUS", limit=10_000)
    assert [i["disclosure_index"] for i in only] == [992000002]


def test_to_item_drops_codes_the_panel_cannot_show() -> None:
    row = {
        "disclosure_index": 1,
        "disclosure_oid": "x",
        "stock_codes": ["AB", "GARAN"],
        "related_stocks": None,
        "primary_ticker": "TOOLONGX",
        "first_seen_at": None,
        "available_at": "t",
        "classification": "nope",
    }
    item = to_item(row)
    assert item["stock_codes"] == ["GARAN"] and item["related_stocks"] == []
    assert item["primary_ticker"] is None and item["classification"] is None and item["first_seen_at"] == "t"
