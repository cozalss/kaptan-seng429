"""Package B: GET /portfolio/positions, GET /portfolio/pnl and open_position() (used by package A)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.db import DictConn
from kaptan.demo.fixtures import FIXTURE_DIR
from kaptan.domain.schemas import Position
from kaptan.portfolio import open_position
from kaptan.portfolio.positions import PositionError, list_positions
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration


def _expected(name: str) -> Any:
    return json.loads((FIXTURE_DIR / "expected" / name).read_text(encoding="utf-8"))


async def _get(client: httpx.AsyncClient, path: str, role: str = "analyst") -> httpx.Response:
    session = await login(client, role)  # type: ignore[arg-type]
    return await client.get(f"{API_PREFIX}{path}", headers=bearer(session["access_token"]))


async def test_positions_match_the_mock_at_13_40(client: httpx.AsyncClient) -> None:
    res = await _get(client, "/portfolio/positions")
    assert res.status_code == 200, res.text
    assert_matches("Position", res.json(), many=True)
    assert res.json() == _expected("positions.json")


async def test_pnl_matches_the_fixture_and_filters_inclusively(client: httpx.AsyncClient) -> None:
    full = await _get(client, "/portfolio/pnl", "auditor")
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


async def test_open_position_paper_and_personal(pg: DictConn, migrated: Settings) -> None:
    filled = datetime(2027, 1, 11, 10, 41, 2, tzinfo=UTC)
    async with pg.transaction():
        paper = await open_position(
            pg,
            book="paper",
            proposal_id="prop-day-e1-krgcl",
            run_id="run-day-e1-krgcl",
            qty=100,
            avg_cost=10.0,
            opened_at=filled,
        )
        personal = await open_position(
            pg,
            book="personal",
            proposal_id="prop-day-e1-krgcl",
            run_id="run-day-e1-krgcl",
            qty=40,
            avg_cost=10.0,
            opened_at=filled,
        )
        again = await open_position(
            pg,
            book="personal",
            proposal_id="prop-day-e1-krgcl",
            run_id="run-day-e1-krgcl",
            qty=30,
            avg_cost=11.0,
            opened_at=filled,
        )
    docs = [Position.model_validate(p).model_dump(mode="json") for p in (paper, personal, again)]
    assert_matches("Position", docs, many=True)
    assert paper["book"] == "paper" and paper["ticker"] == "KRGCL" and paper["holding_days"] == 0
    assert personal["planned_exit_date"].isoformat() == "2027-01-18"  # five sessions
    assert again["qty"] == 30 and again["avg_cost"] == 11.0
    rows = await list_positions(pg, filled)
    assert rows[0]["book"] == "paper" and rows[1]["book"] == "personal"  # paper first on a tie
    assert len(rows) == 9
    with pytest.raises(PositionError):
        await open_position(
            pg, book="paper", proposal_id="nope", run_id="run-day-e1-krgcl", qty=1, avg_cost=1.0, opened_at=filled
        )
    with pytest.raises(PositionError):
        await open_position(pg, book="paper", proposal_id="x", run_id="y", qty=0, avg_cost=1.0, opened_at=filled)
    with pytest.raises(PositionError):
        await open_position(
            pg, book="paper", proposal_id="x", run_id="y", qty=1, avg_cost=1.0, opened_at=datetime(2027, 1, 11)
        )
    await pg.rollback()
    await reseed_test_db(migrated)
