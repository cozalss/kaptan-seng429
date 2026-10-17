"""GET /runs/{run_id}/explain (package A): parity with selectors.explainFor() on a fresh seed, 404s,
and the in-flight overlay of an injected demo run."""

from __future__ import annotations

import httpx
import pytest

from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import DEMO_E3_RUN, api, call, expected, fresh, inject_demo_e3, normalise

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]


async def test_every_fixture_run_matches_the_mock(api: httpx.AsyncClient) -> None:
    for run_id, want in expected("explain.json").items():
        res = await call(api, "auditor", "GET", f"/runs/{run_id}/explain")
        assert res.status_code == 200, (run_id, res.text)
        assert_matches("Explain", res.json())
        got = normalise(res.json())
        diff = sorted(k for k in want if got.get(k) != normalise(want[k]))
        assert not diff, (run_id, diff)


@pytest.mark.parametrize("run_id", ["run-nope", DEMO_E3_RUN])
async def test_unknown_or_not_injected_runs_are_404(api: httpx.AsyncClient, run_id: str) -> None:
    res = await call(api, "analyst", "GET", f"/runs/{run_id}/explain")
    assert (res.status_code, res.json()) == (404, {"detail": "Koşu bulunamadı.", "code": "not_found"})


async def test_an_injected_run_in_flight_then_done(api: httpx.AsyncClient, migrated: Settings) -> None:
    await inject_demo_e3(migrated, seconds_ago=3.75)
    running = (await call(api, "analyst", "GET", f"/runs/{DEMO_E3_RUN}/explain")).json()
    assert_matches("Explain", running)
    assert (running["run"]["status"], running["run"]["finished_at"]) == ("running", None)
    assert running["approval"] is None and running["proposal"] is None
    assert running["disclosure"]["classification"] is None
    statuses = [n["status"] for n in running["trace"]["nodes"]]
    assert "running" in statuses and statuses[-1] == "waiting"
    pending = (await call(api, "analyst", "GET", "/approvals")).json()
    assert DEMO_E3_RUN not in {c["run_id"] for c in pending}

    await inject_demo_e3(migrated, seconds_ago=60)
    done = (await call(api, "analyst", "GET", f"/runs/{DEMO_E3_RUN}/explain")).json()
    assert done["run"]["status"] == "interrupted"
    assert done["approval"]["status"] == "pending"
    assert done["proposal"] is not None
    assert "running" not in {n["status"] for n in done["trace"]["nodes"]}
    pending = (await call(api, "analyst", "GET", "/approvals")).json()
    assert pending[0]["run_id"] == DEMO_E3_RUN  # newest first
