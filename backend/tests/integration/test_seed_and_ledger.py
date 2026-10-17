"""The demo seed in Postgres: counts, the ledger verifies, and the ledger really is append-only."""

from __future__ import annotations

from datetime import UTC, datetime

import psycopg
import pytest

from kaptan.audit.verify import load_chain, verify_db
from kaptan.audit.writer import AuditDraft, append
from kaptan.db import DictConn
from kaptan.demo.seed import SeedResult
from kaptan.settings import Settings
from tests.conftest import reseed_test_db

pytestmark = pytest.mark.integration


async def _count(conn: DictConn, table: str) -> int:
    async with conn.cursor() as cur:
        await cur.execute(f"SELECT count(*) AS n FROM {table}")  # noqa: S608 - fixed table names
        row = await cur.fetchone()
    assert row is not None
    return int(row["n"])


async def test_seed_counts(seeded: SeedResult, pg: DictConn) -> None:
    assert seeded.counts["audit.audit_log"] == 4812
    expected = {
        "auth.users": 5,
        "core.disclosures": 318 + 3 + 7,
        "trading.agent_runs": 23,
        "trading.approvals": 13,
        "trading.limit_versions": 1,
        "trading.pnl_daily": 166,
        "trading.positions": 7,
        "audit.audit_log": 4812,
    }
    for table, n in expected.items():
        assert await _count(pg, table) == n, table
    async with pg.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM core.disclosures WHERE visible")
        assert (await cur.fetchone())["n"] == 212  # type: ignore[index]
        await cur.execute("SELECT max(release_order) AS n FROM core.disclosures")
        assert (await cur.fetchone())["n"] == 106  # type: ignore[index]
        await cur.execute("SELECT started_at, tamper_on FROM ops.demo_state")
        row = await cur.fetchone()
    assert row is not None and row["tamper_on"] is False


async def test_ledger_verifies_as_app_role(pg: DictConn) -> None:
    result = await verify_db(pg, "2027-01-11T10:40:00.000Z")
    assert result["ok"] is True
    assert result["checked"] == 4812
    assert result["head_hash"] == "9f9c93b0077a1408efc2d91ac7910ab837062d8958c7d99a71cb1a9a3e5ed640"


async def test_app_role_cannot_rewrite_the_ledger(pg: DictConn) -> None:
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        await pg.execute("UPDATE audit.audit_log SET payload = '{}' WHERE chain_pos = 1")
    await pg.rollback()
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        await pg.execute("DELETE FROM audit.audit_log WHERE chain_pos = 1")
    await pg.rollback()
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        await pg.execute("TRUNCATE audit.audit_log")
    await pg.rollback()


async def test_even_the_owner_hits_the_append_only_trigger(owner_pg: DictConn) -> None:
    with pytest.raises(psycopg.errors.RaiseException, match="yalnızca eklenebilir"):
        await owner_pg.execute("UPDATE audit.audit_log SET payload = '{}' WHERE chain_pos = 1")
    await owner_pg.rollback()


async def test_append_then_verify_then_tamper_detected(migrated: Settings, pg: DictConn, owner_pg: DictConn) -> None:
    async with pg.transaction():
        entries = await append(
            pg,
            [
                AuditDraft(
                    actor="user:uye-3",
                    action="note.added",
                    entity_type="trade_proposal",
                    entity_id="prop-day-e1-krgcl",
                    payload={"ticker": "KRGCL", "company": "x", "role": "risk_officer"},
                    run_id="run-day-e1-krgcl",
                    strategy_version="v1.1-fwd",
                ),
                AuditDraft(
                    actor="system:test",
                    action="audit.verified",
                    entity_type="audit_log",
                    entity_id="chain",
                    payload={"price": 48.32, "ratio": 0.004},
                    occurred_at=datetime(2027, 1, 11, 10, 41, tzinfo=UTC),
                ),
            ],
        )
    assert [e.chain_pos for e in entries] == [4813, 4814]
    chain = await load_chain(pg)
    assert chain[-1].to_api()["payload"] == {"price": 48.32, "ratio": 0.004}
    assert (await verify_db(pg, "t"))["ok"] is True

    # Behind the chain's back (the demo tamper test does this with the owner connection).
    async with owner_pg.transaction():
        await owner_pg.execute("ALTER TABLE audit.audit_log DISABLE TRIGGER trg_audit_immutable")
        await owner_pg.execute(
            "UPDATE audit.audit_log SET payload = payload || '{\"kurcalandi\": true}' WHERE chain_pos = 3907"
        )
        await owner_pg.execute("ALTER TABLE audit.audit_log ENABLE TRIGGER trg_audit_immutable")
    result = await verify_db(pg, "2027-01-11T10:42:00.000Z")
    assert (result["ok"], result["first_bad_pos"], result["kind"], result["checked"]) == (
        False,
        3907,
        "hash_mismatch",
        3906,
    )
    await pg.rollback()  # release the read snapshot before the reseed TRUNCATEs
    await reseed_test_db(migrated)  # leave the shared test database clean
