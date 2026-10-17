"""Opt-in live smoke test against kap.org.tr: `uv run pytest -m live tests/integration/test_ingest_live.py`.

Budget: 4 KAP requests, ≥ KAP_MIN_INTERVAL_S apart (list/main, byCriteria, company/items, one
BildirimPdf). No database, nothing stored. Skipped by default (`-m 'not live'` in pyproject).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from kaptan.ingest.kap_client import KapClient
from kaptan.ingest.kap_detail import fetch_detail
from kaptan.ingest.normalize import normalize_rows
from kaptan.ingest.parsers import parse_detail
from kaptan.settings import get_settings
from kaptan.text.turkish import IST

pytestmark = pytest.mark.live


def last_weekday() -> datetime:
    day = datetime.now(UTC).astimezone(IST) - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


async def test_kap_endpoints_still_answer_in_the_shapes_we_parse() -> None:
    day = last_weekday().date()
    async with KapClient.from_settings(get_settings()) as kap:
        main = await kap.list_main(day, day)
        rows, errors = normalize_rows(main, source="live", seen_at=datetime.now(UTC))
        assert len(rows) > 50 and not errors, errors[:3]
        assert all(r.disclosure_oid for r in rows)

        crit = await kap.by_criteria(day, day)
        crit_rows, crit_errors = normalize_rows(crit, source="backfill", seen_at=None)
        assert len(crit_rows) > 50 and not crit_errors
        overlap = {r.disclosure_index for r in crit_rows} & {r.disclosure_index for r in rows}
        assert len(overlap) >= 0.9 * len(crit_rows)  # same day, two endpoints (recorded day: 476 of 476)

        members = await kap.company_items("IGS")
        assert len(members) > 400 and any(m.get("stockCode") == "THYAO" for m in members)

        target = next((r for r in rows if r.subject_route == "E1"), None) or next(
            r for r in rows if r.subject_route in {"E2", "E3", "E4", "llm"}
        )
        detail = await fetch_detail(kap, target.disclosure_index)
        assert detail.tr and detail.source in {"bildirim_pdf", "rsc_payload"}
        doc = parse_detail(target.subject, detail.tr)
        assert doc is not None and doc["status"] != "failed", doc
        assert kap.requests_made <= 5
