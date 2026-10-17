"""run_scenario() against Postgres: the demo scenarios through the replay pipeline, and the DoD end to end
(POST /demo/inject e3_contract → the same Explain as runs.json modulo timestamps, a pending card in /approvals)."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

from kaptan.agents import run_scenario
from kaptan.audit.verify import verify_db
from kaptan.clock import DEMO_ANCHOR, Clock
from kaptan.db import DictConn
from kaptan.demo.fixtures import DemoFixtures
from kaptan.domain.schemas import iso_ms
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db

pytestmark = pytest.mark.integration

FX = DemoFixtures()
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def _mask(doc: Any) -> Any:
    if isinstance(doc, dict):
        return {k: _mask(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [_mask(v) for v in doc]
    return "<t>" if isinstance(doc, str) and ISO.match(doc) else doc


def _fixture(run_id: str) -> dict[str, Any]:
    explain: dict[str, Any] = next(r for r in FX.runs if r["explain"]["run"]["run_id"] == run_id)["explain"]
    return explain


async def _one(conn: DictConn, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    assert row is not None
    return dict(row)


def _clock() -> Clock:
    return Clock(demo=True, started_at=datetime.now(UTC))


async def test_e3_contract_writes_run_card_counters_and_ledger(pg: DictConn, migrated: Settings) -> None:
    try:
        before = await _one(pg, "SELECT llm_calls, llm_tokens FROM core.day_counters WHERE d = '2027-01-11'")
        quota = await _one(pg, "SELECT sum(used) AS used FROM trading.quota_usage")
        await pg.commit()

        result = await run_scenario(pg, "e3_contract", _clock())

        assert result.run_id == "run-demo-e3-ornek"
        assert result.first_injection is True
        assert _mask(result.explain) == _mask(_fixture("run-demo-e3-ornek"))
        run = await _one(
            pg,
            "SELECT visible, injected_at, status, outcome, explain FROM trading.agent_runs WHERE run_id = %s",
            (result.run_id,),
        )
        assert (run["visible"], run["status"], run["outcome"]) == (True, "interrupted", "PROPOSE")
        assert run["explain"] == result.explain
        assert run["injected_at"] >= DEMO_ANCHOR
        disc = await _one(pg, "SELECT visible, published_at FROM core.disclosures WHERE disclosure_index = 1651901")
        assert disc["visible"] is True
        assert iso_ms(disc["published_at"]) == result.explain["disclosure"]["published_at"]
        card = await _one(
            pg, "SELECT status, card, expires_at FROM trading.approvals WHERE proposal_id = 'prop-demo-e3-ornek'"
        )
        assert card["status"] == "pending"
        assert card["card"]["qty"] == 1240
        assert card["card"]["final_notional_try"] == 59954
        assert iso_ms(card["expires_at"]) == "2027-01-12T06:50:00.000Z"
        last = await _one(
            pg, "SELECT actor, action, entity_id, run_id, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1"
        )
        assert (last["actor"], last["action"], last["entity_id"]) == (
            "agent:request_approval",
            "proposal.created",
            "prop-demo-e3-ornek",
        )
        assert last["payload"] == {"ticker": "ORNEK", "company": "ÖRNEK ENERJİ A.Ş.", "qty": 1240}
        after = await _one(pg, "SELECT llm_calls, llm_tokens FROM core.day_counters WHERE d = '2027-01-11'")
        assert after["llm_calls"] == before["llm_calls"] + 6
        assert after["llm_tokens"] == before["llm_tokens"] + 16_400 + 2_510
        assert (await _one(pg, "SELECT sum(used) AS used FROM trading.quota_usage"))["used"] == quota["used"] + 7

        again = await run_scenario(pg, "e3_contract", _clock())  # re-injection: usage moves only once
        assert again.first_injection is False
        assert (await _one(pg, "SELECT llm_calls FROM core.day_counters WHERE d = '2027-01-11'"))["llm_calls"] == after[
            "llm_calls"
        ]
        verified = await verify_db(pg, iso_ms(datetime.now(UTC)))
        assert verified["ok"] is True
        await pg.commit()
    finally:
        await pg.rollback()
        await reseed_test_db(migrated)


@pytest.mark.parametrize(
    ("scenario", "run_id", "actor", "action", "payload_key"),
    [
        ("redteam_injection", "run-demo-redteam-dmogd", "agent:compliance", "compliance.rejected", "reason"),
        ("restricted_r04", "run-demo-r04-tmslj", "agent:pre_gate", "risk.rejected", "reasons"),
    ],
)
async def test_vetoed_scenarios_audit_their_outcome(
    pg: DictConn, migrated: Settings, scenario: str, run_id: str, actor: str, action: str, payload_key: str
) -> None:
    try:
        result = await run_scenario(pg, scenario, _clock())
        assert _mask(result.explain) == _mask(_fixture(run_id))
        assert result.explain["approval"] is None
        last = await _one(
            pg, "SELECT actor, action, run_id, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1"
        )
        assert (last["actor"], last["action"], last["run_id"]) == (actor, action, run_id)
        expected = _fixture(run_id)["pre_gate"]["reasons"] if payload_key == "reasons" else "prompt_injection"
        assert last["payload"][payload_key] == expected
        missing = await _one(pg, "SELECT count(*) AS n FROM trading.approvals WHERE run_id = %s", (run_id,))
        assert missing["n"] == 0
        await pg.commit()
    finally:
        await pg.rollback()
        await reseed_test_db(migrated)


async def test_unknown_scenario_is_refused(pg: DictConn) -> None:
    with pytest.raises(ValueError, match="pipeline"):
        await run_scenario(pg, "loss_simulation", _clock())


async def test_inject_endpoint_then_pending_card_in_approvals(
    client: httpx.AsyncClient, pg: DictConn, migrated: Settings
) -> None:
    try:
        admin = await login(client, "admin")
        res = await client.post(
            "/api/v1/demo/inject", json={"scenario": "e3_contract"}, headers=bearer(admin["access_token"])
        )
        assert res.status_code == 200, res.text
        assert res.json() == {"disclosure_index": 1651901, "run_id": "run-demo-e3-ornek"}
        # skip the 7.5 s animation: the run was injected long enough ago
        await pg.execute(
            "UPDATE trading.agent_runs SET injected_at = injected_at - interval '1 hour' WHERE run_id = %s",
            ("run-demo-e3-ornek",),
        )
        await pg.commit()
        officer = await login(client, "risk_officer")
        cards = await client.get("/api/v1/approvals?status=pending", headers=bearer(officer["access_token"]))
        assert cards.status_code == 200, cards.text
        mine = [c for c in cards.json() if c["proposal_id"] == "prop-demo-e3-ornek"]
        assert len(mine) == 1
        assert mine[0]["status"] == "pending"
        explain = await client.get("/api/v1/runs/run-demo-e3-ornek/explain", headers=bearer(officer["access_token"]))
        assert explain.status_code == 200, explain.text
        got = {k: v for k, v in explain.json().items() if k != "audit_positions"}
        want = {k: v for k, v in _fixture("run-demo-e3-ornek").items() if k != "audit_positions"}
        assert _mask(got) == _mask(want)
        actions = [a["action"] for a in explain.json()["audit_positions"]]
        assert actions[-2:] == ["demo.injected", "proposal.created"]
    finally:
        await pg.rollback()
        await reseed_test_db(migrated)


def test_demo_clock_now_is_after_anchor() -> None:
    assert _clock().now() - DEMO_ANCHOR < timedelta(minutes=1)
