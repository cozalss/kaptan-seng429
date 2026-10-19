"""The morning brief (FR-35, M3 B1): built from the seeded day, stored, served by GET /brief/today|{date}."""

from __future__ import annotations

from datetime import date, datetime

import httpx
import pytest
from psycopg.types.json import Jsonb

from kaptan.brief import build_brief, get_brief, run_morning_brief
from kaptan.db import DictConn
from kaptan.domain.roles import Role
from kaptan.domain.schemas.reports import MorningBrief
from kaptan.prices.calendar import IST
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

DAY = date(2027, 1, 11)
NOW = datetime(2027, 1, 11, 8, 45, tzinfo=IST)
API = "/api/v1"


async def test_build_is_a_valid_deterministic_brief(pg: DictConn) -> None:
    doc = await build_brief(pg, DAY, NOW)
    assert MorningBrief.model_validate(doc)
    assert doc["date"] == "2027-01-11" and doc["is_sample"] is False
    assert doc["summary_tr"].startswith("11 Ocak 2027 Pazartesi sabah özeti.")
    for word in ("demo", "kurgusal", "temsili", "sanal para"):
        assert word not in doc["summary_tr"].lower()
    assert all(d["available_at"] <= "2027-01-11T05:45:00.000Z" for d in doc["important_disclosures"])
    assert all(p["planned_exit_date"] == "2027-01-11" for p in doc["expiring_today"])
    assert all(c["status"] == "pending" for c in doc["pending_approvals"])
    assert await build_brief(pg, DAY, NOW) == doc


async def test_run_stores_and_replaces_the_day(pg: DictConn) -> None:
    summary = await run_morning_brief(pg, DAY, NOW)
    assert summary["date"] == "2027-01-11"
    first = await get_brief(pg, DAY)
    assert first is not None and first["generated_at"] == "2027-01-11T05:45:00.000Z"
    later = datetime(2027, 1, 11, 9, 0, tzinfo=IST)
    await run_morning_brief(pg, DAY, later)
    again = await get_brief(pg, DAY)
    assert again is not None and again["generated_at"] == "2027-01-11T06:00:00.000Z"
    assert await get_brief(pg, date(2027, 1, 12)) is None


async def test_endpoints_serve_the_stored_brief(client: httpx.AsyncClient, owner_pg: DictConn) -> None:
    doc = await build_brief(owner_pg, date(2026, 1, 5), datetime(2026, 1, 5, 8, 45, tzinfo=IST))
    await owner_pg.execute(
        "INSERT INTO ops.morning_briefs (d, generated_at, doc) VALUES (%s, %s, %s) "
        "ON CONFLICT (d) DO UPDATE SET doc = EXCLUDED.doc",
        (date(2026, 1, 5), datetime(2026, 1, 5, 8, 45, tzinfo=IST), Jsonb(doc)),
    )
    await owner_pg.commit()
    roles: tuple[Role, ...] = ("admin", "risk_officer", "analyst", "auditor")
    try:
        assert (await client.get(f"{API}/brief/2026-01-05")).status_code == 401
        for role in roles:
            token = (await login(client, role))["access_token"]
            res = await client.get(f"{API}/brief/2026-01-05", headers=bearer(token))
            assert res.status_code == 200, res.text
            assert res.json() == doc
        missing = await client.get(f"{API}/brief/2026-01-06", headers=bearer(token))
        assert missing.status_code == 404 and missing.json()["detail"] == "Bu gün için sabah özeti yok."
        today = await client.get(f"{API}/brief/today", headers=bearer(token))
        assert today.status_code in (200, 404)
        assert (await client.get(f"{API}/brief/2026-13-40", headers=bearer(token))).status_code == 422
    finally:
        await owner_pg.execute("DELETE FROM ops.morning_briefs WHERE d = %s", (date(2026, 1, 5),))
        await owner_pg.commit()
