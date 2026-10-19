"""FR-19: every run writes one trading.agent_outputs row per executed node and one trading.risk_checks row
per gate check, inside the run transaction; a re-run replaces them; API output and audit stay unchanged."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from kaptan.agents import run_scenario
from kaptan.agents.run_rows import check_rows, output_rows
from kaptan.audit.verify import verify_db
from kaptan.clock import Clock
from kaptan.db import DictConn
from kaptan.demo.fixtures import DemoFixtures
from kaptan.domain.schemas import iso_ms
from kaptan.settings import Settings
from tests.conftest import reseed_test_db

pytestmark = pytest.mark.integration


async def _rows(conn: DictConn, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def test_demo_inject_writes_outputs_and_checks_and_replaces_them(pg: DictConn, migrated: Settings) -> None:
    try:
        clock = Clock(demo=True, started_at=datetime.now(UTC))
        result = await run_scenario(pg, "e3_contract", clock)
        explain = result.explain
        outputs = await _rows(
            pg,
            "SELECT node, status, output, prompt_manifest_hash FROM trading.agent_outputs"
            " WHERE run_id = %s ORDER BY id",
            (result.run_id,),
        )
        checks = await _rows(
            pg,
            "SELECT rule_code, phase, outcome, proposal_id FROM trading.risk_checks WHERE run_id = %s ORDER BY id",
            (result.run_id,),
        )
        assert [o["node"] for o in outputs] == [n["node"] for n in explain["trace"]["nodes"]]
        assert {o["prompt_manifest_hash"] for o in outputs} == {DemoFixtures().meta["prompt_manifest_hash"]}
        reader = next(o for o in outputs if o["node"] == "reader")
        assert reader["output"]["amount_try_stated"] == explain["reader"]["amount_try_stated"]
        assert [(c["rule_code"], c["outcome"]) for c in checks] == [
            (c["rule_code"], c["outcome"]) for c in explain["risk_checks"]
        ]
        assert {c["proposal_id"] for c in checks} == {explain["proposal"]["proposal_id"]}
        assert (await verify_db(pg, iso_ms(datetime.now(UTC))))["ok"] is True
        await pg.commit()

        again = await run_scenario(pg, "e3_contract", clock)  # re-inject: same run_id, rows replaced
        n = await _rows(pg, "SELECT count(*) AS n FROM trading.agent_outputs WHERE run_id = %s", (again.run_id,))
        assert n[0]["n"] == len(again.explain["trace"]["nodes"])
        await pg.commit()
    finally:
        await pg.rollback()
        await reseed_test_db(migrated)


def test_rows_are_derived_from_the_explain_only() -> None:
    run = next(r for r in DemoFixtures().runs if r["explain"]["run"]["run_id"] == "run-demo-r04-tmslj")
    explain = run["explain"]
    rows = output_rows(explain, "h")
    assert [r[1] for r in rows] == [n["node"] for n in explain["trace"]["nodes"]]
    assert check_rows(explain) == []  # a pre-gate veto never reaches the gate
