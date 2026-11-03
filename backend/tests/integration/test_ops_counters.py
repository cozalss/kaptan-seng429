"""The DayCounters token floor (the panel mock's 412 000) applies only in DEMO_MODE."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from kaptan.db import DictConn
from kaptan.disclosures.counters import day_counters

pytestmark = pytest.mark.integration


async def test_a_day_without_usage_shows_no_tokens(pg: DictConn) -> None:
    real_day = datetime(2030, 1, 7, 9, 0, tzinfo=UTC)  # no LLM usage recorded on this day
    assert (await day_counters(pg, real_day))["llm_tokens"] == 0


async def test_only_the_istanbul_day_counts(pg: DictConn) -> None:
    """Counters are per day: the fixture day's rows are not "today" on another day."""
    demo_day = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)
    assert (await day_counters(pg, demo_day))["total"] > 0
    other_day = await day_counters(pg, datetime(2030, 1, 7, 9, 0, tzinfo=UTC))
    assert (other_day["total"], other_day["proposals"]) == (0, 0)
    await pg.execute(
        "INSERT INTO core.disclosures (disclosure_index, company_name, disclosure_class, disclosure_type, subject, "
        "summary, reason, subject_route, subject_map_version, published_at, available_at, ingest_source, origin, "
        "visible, is_noise) VALUES (991999001, 'Test A.Ş.', 'ODA', 'ODA', 'Genel Kurul', '', 'NEW', 'noise', "
        "'subject_map.v1', '2030-01-06 21:30+00', '2030-01-06 21:31+00', 'live', 'kap', true, true)"
    )  # 00:30 Istanbul on 7 January
    counted = await day_counters(pg, datetime(2030, 1, 7, 9, 0, tzinfo=UTC))
    assert (counted["total"], counted["noise"]) == (1, 1)


async def test_a_past_day_is_counted_on_request(pg: DictConn) -> None:
    """A past day counts its rows even after the poller hid them from the feed (visible = false)."""
    from datetime import date

    await pg.execute(
        "INSERT INTO core.disclosures (disclosure_index, company_name, disclosure_class, disclosure_type, subject, "
        "summary, reason, subject_route, subject_map_version, published_at, available_at, ingest_source, origin, "
        "visible) VALUES (991999002, 'Test A.Ş.', 'ODA', 'ODA', 'Genel Kurul', '', 'NEW', 'archive_only', "
        "'subject_map.v1', '2030-01-03 09:00+00', '2030-01-03 09:01+00', 'live', 'kap', false)"
    )
    now = datetime(2030, 1, 7, 9, 0, tzinfo=UTC)
    past = await day_counters(pg, now, day=date(2030, 1, 3))
    assert past["total"] == 1 and past["as_of"].startswith("2030-01-07")
    assert (await day_counters(pg, now))["total"] == 0


async def test_counters_endpoint_takes_a_day(client: Any) -> None:
    from tests.conftest import bearer, login

    session = await login(client)
    ok = await client.get("/api/v1/disclosures/counters?day=2027-01-11", headers=bearer(session["access_token"]))
    assert ok.status_code == 200 and ok.json()["total"] > 0
    other = await client.get("/api/v1/disclosures/counters?day=2030-01-08", headers=bearer(session["access_token"]))
    assert other.status_code == 200 and other.json()["total"] == 0
    bad = await client.get("/api/v1/disclosures/counters?day=2027-02-30", headers=bearer(session["access_token"]))
    assert bad.status_code == 422
