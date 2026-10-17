"""Package C writes: /demo/inject, /demo/tamper, /demo/reset, the live ticker and the demo timers."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI

from kaptan.api.deps import settings_dep
from kaptan.api.main import API_PREFIX, create_app
from kaptan.clock import DEMO_ANCHOR
from kaptan.demo import control, ports
from kaptan.demo.fixtures import FIXTURE_DIR, DemoFixtures
from kaptan.demo.seed import SeedResult
from kaptan.demo.ticker import TICKER_TASK, start_ticker, tick
from kaptan.demo.timers import timers_of
from kaptan.events import bus
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

META = DemoFixtures().meta
COUNTERS_AT_ANCHOR = json.loads((FIXTURE_DIR / "expected" / "counters.json").read_text(encoding="utf-8"))


@pytest.fixture
async def demo(seeded: SeedResult, migrated: Settings) -> AsyncIterator[tuple[FastAPI, httpx.AsyncClient]]:
    """The app and a client on it; the test database is reseeded afterwards."""
    await reseed_test_db(migrated)
    app = create_app(migrated)
    app.dependency_overrides[settings_dep] = lambda: migrated
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
            app.state.clock.started_at = None  # reloaded below from the fresh seed
            async with app.state.pool.connection() as conn, conn.cursor() as cur:
                await cur.execute("SELECT started_at FROM ops.demo_state WHERE id = 1")
                row = await cur.fetchone()
            assert row is not None
            app.state.clock.restart(row["started_at"])
            yield app, http
    await reseed_test_db(migrated)


_TOKENS: dict[tuple[int, str], str] = {}


async def _auth(http: httpx.AsyncClient, role: str) -> dict[str, str]:
    """One login per client and role (the login rate limiter allows 5 a minute)."""
    key = (id(http), role)
    if key not in _TOKENS:
        _TOKENS[key] = (await login(http, role))["access_token"]  # type: ignore[arg-type]
    return bearer(_TOKENS[key])


async def _post(http: httpx.AsyncClient, path: str, body: Any = None, role: str = "admin") -> httpx.Response:
    return await http.post(f"{API_PREFIX}{path}", json=body, headers=await _auth(http, role))


async def _get(http: httpx.AsyncClient, path: str, role: str = "auditor") -> Any:
    res = await http.get(f"{API_PREFIX}{path}", headers=await _auth(http, role))
    assert res.status_code == 200, res.text
    return res.json()


def _counters(body: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in body.items() if k != "as_of"}


async def _last_feed_events(app: FastAPI, n: int = 5) -> list[str]:
    entries = await app.state.redis.xrevrange(bus.stream_key("feed"), count=n)
    return [fields["event"] for _id, fields in entries]


# ── tamper ─────────────────────────────────────────────────────────────────
async def test_tamper_on_breaks_the_chain_at_3907_and_off_heals_it(demo: tuple[FastAPI, httpx.AsyncClient]) -> None:
    _app, http = demo
    res = await _post(http, "/demo/tamper", {"on": True})
    assert res.status_code == 200, res.text
    assert res.json() == {"tamper_on": True}
    verify = await _post(http, "/audit/verify", role="auditor")
    body = verify.json()
    assert_matches("ChainVerifyResult", body)
    assert (body["ok"], body["first_bad_pos"], body["kind"], body["checked"]) == (False, 3907, "hash_mismatch", 3906)
    page = await _get(http, "/audit?scope=all&q=%233907")
    assert page["tamper_on"] is True
    assert page["items"][0]["payload"]["kurcalandi"] is True
    length = page["length"]
    assert length == META["audit_base_length"]  # no audit entry for the tamper test

    off = await _post(http, "/demo/tamper", {"on": False})
    assert off.json() == {"tamper_on": False}
    healed = (await _post(http, "/audit/verify", role="risk_officer")).json()
    assert (healed["ok"], healed["checked"]) == (True, META["audit_base_length"])


async def test_demo_endpoints_are_404_outside_demo_mode(migrated: Settings, seeded: SeedResult) -> None:
    settings = migrated.model_copy(update={"demo_mode": False})
    app = create_app(settings)
    app.dependency_overrides[settings_dep] = lambda: settings
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
            res = await _post(http, "/demo/reset")
    assert res.status_code == 404
    assert res.json() == {"detail": "Demo modu kapalı.", "code": "not_found"}


# ── inject ─────────────────────────────────────────────────────────────────
async def _fake_e(app: Any, conn: Any, scenario: str, clock: Any) -> None:
    """Stands in for package E: what run_scenario makes visible (the disclosure and the run)."""
    async with conn.transaction():
        await conn.execute(
            "UPDATE core.disclosures SET visible = true, published_at = %(t)s, first_seen_at = %(t)s, "
            "available_at = %(t)s WHERE scenario = %(s)s",
            {"t": clock.now(), "s": scenario},
        )
        await conn.execute(
            "UPDATE trading.agent_runs SET visible = true, injected_at = %s WHERE scenario = %s",
            (clock.now(), scenario),
        )


async def test_inject_e3_audits_and_counts_like_the_mock(
    demo: tuple[FastAPI, httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    app, http = demo
    monkeypatch.setattr(ports, "run_scenario", _fake_e)
    res = await _post(http, "/demo/inject", {"scenario": "e3_contract"})
    assert res.status_code == 200, res.text
    assert res.json() == {"disclosure_index": META["demo"]["e3_index"], "run_id": META["demo"]["e3_run"]}

    page = await _get(http, "/audit?scope=all&limit=1")
    entry = page["items"][0]
    assert entry["action"] == "demo.injected"
    assert entry["actor"] == "user:uye-1"
    assert (entry["entity_type"], entry["entity_id"]) == ("disclosure", str(META["demo"]["e3_index"]))
    assert entry["payload"] == {"scenario": "e3_contract", "ticker": "ORNEK", "fixture": True}
    assert (entry["run_id"], entry["strategy_version"]) == (META["demo"]["e3_run"], "v1.1-fwd")
    assert entry["occurred_at"].startswith("2027-01-11T10:")

    # In flight (< 7.5 s): the row counts, its class and its card do not yet (runProgress < 1).
    during = _counters(await _get(http, "/disclosures/counters"))
    want = _counters(COUNTERS_AT_ANCHOR)
    assert during == {**want, "total": want["total"] + 1, "processed": want["processed"] + 1}
    assert await _last_feed_events(app, 2) == ["counters", "disclosure"]

    async with app.state.pool.connection() as conn:  # the run animation is over
        await conn.execute("UPDATE ops.demo_injections SET real_at = now() - interval '8 seconds'")
        await conn.commit()
    after = _counters(await _get(http, "/disclosures/counters"))
    assert after["e_candidates"] == want["e_candidates"] + 1
    assert after["proposals"] == want["proposals"] + 1
    assert (await _get(http, "/audit?scope=all&limit=1"))["length"] == page["length"]


async def test_inject_without_the_pipeline_is_503(
    demo: tuple[FastAPI, httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, http = demo
    monkeypatch.setattr(ports, "SCENARIO_MODULES", ("kaptan.no_such_module",))
    res = await _post(http, "/demo/inject", {"scenario": "redteam_injection"})
    assert res.status_code == 503
    assert res.json() == {"detail": "Senaryo hattı henüz hazır değil.", "code": "unavailable"}
    bad = await _post(http, "/demo/inject", {"scenario": "nope"})
    assert bad.status_code == 422


async def test_loss_simulation_steps_halt_then_kill(
    demo: tuple[FastAPI, httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    app, http = demo
    real_start = control.start_loss_simulation
    monkeypatch.setattr(control, "start_loss_simulation", lambda a: real_start(a, step_s=0.05))
    res = await _post(http, "/demo/inject", {"scenario": "loss_simulation"})
    assert res.status_code == 200, res.text
    assert res.json() == {"disclosure_index": None, "run_id": None}
    for _ in range(100):
        if not any(n.startswith("demo:loss-step") for n in timers_of(app).names()):
            break
        await asyncio.sleep(0.05)
    risk = await _get(http, "/risk/status")
    if risk.get("code") == "not_implemented":  # pragma: no cover - package B not merged
        return
    assert risk["halted_today"] is True
    assert risk["daily_pnl_pct"] == META["loss_daily"][-1]
    actions = [e["action"] for e in (await _get(http, "/audit?scope=all&limit=4"))["items"]]
    assert "demo.injected" in actions
    assert "risk.halted" in actions


# ── ticker ─────────────────────────────────────────────────────────────────
async def test_ticker_releases_the_next_row_retimed_to_now(demo: tuple[FastAPI, httpx.AsyncClient]) -> None:
    app, http = demo
    item, released = await tick(app)
    assert item is not None
    assert released == 1
    assert_matches("DisclosureListItem", item)
    assert item["disclosure_index"] == META["day_index_base"] + META["day_by_anchor"]["total"]
    now = app.state.clock.now()
    published = item["published_at"]
    assert published[:16] == now.isoformat()[:16]
    counters = await _get(http, "/disclosures/counters")
    assert counters["total"] == COUNTERS_AT_ANCHOR["total"] + 1
    assert await _last_feed_events(app, 2) == ["counters", "disclosure"]


async def test_ticker_loop_and_reset_stop_every_timer(demo: tuple[FastAPI, httpx.AsyncClient]) -> None:
    app, http = demo
    timers = timers_of(app)
    start_ticker(app, first_delay_s=0, delay_fn=lambda _n: 0.02)
    start_ticker(app)  # already running: no second loop
    timers.later(3600, lambda: asyncio.sleep(0), name="demo:far-future")
    assert TICKER_TASK in timers.names()
    for _ in range(100):
        if (await _get(http, "/disclosures/counters"))["total"] >= COUNTERS_AT_ANCHOR["total"] + 3:
            break
        await asyncio.sleep(0.02)
    await _post(http, "/demo/tamper", {"on": True})

    res = await _post(http, "/demo/reset")
    assert res.status_code == 204
    assert "demo:far-future" not in timers.names()
    assert TICKER_TASK not in timers.names()  # demo_live_ticker is off in the test settings
    assert app.state.clock.now() - DEMO_ANCHOR < timedelta(seconds=30)
    assert _counters(await _get(http, "/disclosures/counters")) == _counters(COUNTERS_AT_ANCHOR)
    verify = (await _post(http, "/audit/verify", role="auditor")).json()
    assert (verify["ok"], verify["checked"]) == (True, META["audit_base_length"])
    assert (await _get(http, "/audit?scope=all&limit=1"))["tamper_on"] is False
    assert (await _last_feed_events(app, 1)) == ["counters"]


async def test_reset_restarts_the_ticker_when_enabled(demo: tuple[FastAPI, httpx.AsyncClient]) -> None:
    app, _http = demo
    settings = app.dependency_overrides[settings_dep]().model_copy(update={"demo_live_ticker": True})
    await control.reset(app, settings)
    assert TICKER_TASK in timers_of(app).names()
    await control.on_shutdown(app)
    assert timers_of(app).active == 0
