"""Every endpoint the panel calls answers 200, in the panel's shape, on a book that has no starting money yet."""

from __future__ import annotations

import httpx
import pytest

from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh, sql

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]

#: (path, zod schema name or None, list of items?)
ENDPOINTS = [
    ("/risk/status", "RiskStatus", False),
    ("/limits", "LimitsView", False),
    ("/personal/stage", "PersonalStageStatus", False),
    ("/me/alerts", "AlertSettings", False),
    ("/system/status", "SystemStatus", False),
    ("/disclosures/counters", "DayCounters", False),
    ("/approvals", "ApprovalCard", True),
    ("/tickets", "OrderTicket", True),
    ("/portfolio/positions", "Position", True),
    ("/portfolio/pnl", "PnlPoint", True),
    ("/me/overview", None, False),
    ("/me/money", None, False),
    ("/audit?limit=20", "AuditPage", False),
]


async def _empty_book(settings: Settings) -> None:
    for table in ("trading.book_ledger", "trading.positions", "trading.pnl_daily"):
        await sql(settings, f"DELETE FROM {table}")  # noqa: S608 - fixed table names


@pytest.mark.parametrize(("path", "schema", "many"), ENDPOINTS, ids=[e[0] for e in ENDPOINTS])
async def test_the_endpoint_answers_before_the_starting_money(
    api: httpx.AsyncClient, migrated: Settings, path: str, schema: str | None, many: bool
) -> None:
    await _empty_book(migrated)
    res = await call(api, "GET", path)
    assert res.status_code == 200, res.text
    body = res.json()
    if schema is not None:
        assert_matches(schema, body, many=many)


async def test_the_morning_brief_is_honestly_absent_or_valid(api: httpx.AsyncClient, migrated: Settings) -> None:
    await _empty_book(migrated)
    res = await call(api, "GET", "/brief/today")
    if res.status_code == 200:
        assert_matches("MorningBrief", res.json())
    else:
        assert (res.status_code, res.json()["code"]) == (404, "not_found")


async def test_the_risk_status_of_a_fresh_book_is_zero(api: httpx.AsyncClient, migrated: Settings) -> None:
    await _empty_book(migrated)
    body = (await call(api, "GET", "/risk/status")).json()
    assert (body["equity"], body["peak_equity"], body["daily_pnl_pct"], body["drawdown_pct"]) == (0, 0, 0, 0)
    overview = (await call(api, "GET", "/me/overview")).json()
    assert overview["needs_setup"] is True and overview["capital_start"] == 0
