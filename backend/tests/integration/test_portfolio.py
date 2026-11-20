"""Package B: GET /portfolio/positions, GET /portfolio/pnl and open_position() (used by package A)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.db import DictConn
from kaptan.domain.schemas import Position
from kaptan.portfolio import ledger, open_position
from kaptan.portfolio.positions import PositionError, list_positions
from kaptan.risk.book import own_book
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches
from tests.harness.fixtures import FIXTURE_DIR

pytestmark = pytest.mark.integration


def _expected(name: str) -> Any:
    return json.loads((FIXTURE_DIR / "expected" / name).read_text(encoding="utf-8"))


async def _get(client: httpx.AsyncClient, path: str) -> httpx.Response:
    session = await login(client)
    return await client.get(f"{API_PREFIX}{path}", headers=bearer(session["access_token"]))


async def test_positions_read_the_book_and_sit_at_cost_without_a_stored_price(client: httpx.AsyncClient) -> None:
    res = await _get(client, "/portfolio/positions")
    assert res.status_code == 200, res.text
    assert_matches("Position", res.json(), many=True)
    marked = ("last_price", "unrealized_pnl")
    got = [{k: v for k, v in p.items() if k not in marked} for p in res.json()]
    assert got == [{k: v for k, v in p.items() if k not in marked} for p in _expected("positions.json")]
    for p in res.json():  # no stored price in this database: no price, no gain or loss, and it says so
        assert p["last_price"] == p["avg_cost"] and p["unrealized_pnl"] == 0 and p["price_as_of"] is None


async def test_pnl_matches_the_fixture_and_filters_inclusively(client: httpx.AsyncClient) -> None:
    full = await _get(client, "/portfolio/pnl")
    assert full.status_code == 200
    assert_matches("PnlPoint", full.json(), many=True)
    fixture = json.loads((FIXTURE_DIR / "pnl.json").read_text(encoding="utf-8"))
    assert full.json() == fixture
    part = await _get(client, "/portfolio/pnl?from=2026-12-01&to=2027-01-08")
    want = [p for p in fixture if "2026-12-01" <= p["d"] <= "2027-01-08"]
    assert part.json() == want
    assert {p["d"] for p in part.json()} >= {"2026-12-01", "2027-01-08"}
    bad = await _get(client, "/portfolio/pnl?from=2026-13-45")
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation"


async def test_open_position_is_the_persons_fill_in_their_one_book(pg: DictConn, migrated: Settings) -> None:
    filled = datetime(2027, 1, 11, 10, 41, 2, tzinfo=UTC)
    before = await own_book(pg, filled)
    async with pg.transaction():
        await ledger.lock(pg)
        opened = await open_position(
            pg,
            proposal_id="prop-day-e1-krgcl",
            run_id="run-day-e1-krgcl",
            qty=40,
            avg_cost=10.0,
            opened_at=filled,
            commission=Decimal("1.5"),
            now=filled,
        )
    assert_matches("Position", [Position.model_validate(opened).model_dump(mode="json")], many=True)
    assert (opened["origin"], opened["book"], opened["ticker"], opened["holding_days"]) == (
        "suggestion",
        "personal",
        "KRGCL",
        0,
    )
    assert (
        opened["planned_exit_date"].isoformat() == "2027-02-08"
    )  # the proposal's 20 sessions, the date the ticket promised
    after = await own_book(pg, filled)
    assert before.free_cash - after.free_cash == Decimal("401.50")  # qty x price + commission
    rows = await list_positions(pg, filled)
    assert len(rows) == 8 and rows[0]["ticker"] == "KRGCL"  # newest opened first
    with pytest.raises(PositionError):
        await open_position(pg, proposal_id="nope", run_id="run-day-e1-krgcl", qty=1, avg_cost=1.0, opened_at=filled)
    with pytest.raises(PositionError):
        await open_position(pg, proposal_id="x", run_id="y", qty=0, avg_cost=1.0, opened_at=filled)
    with pytest.raises(PositionError):
        await open_position(pg, proposal_id="x", run_id="y", qty=1, avg_cost=1.0, opened_at=datetime(2027, 1, 11))
    await pg.rollback()
    await reseed_test_db(migrated)
