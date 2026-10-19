"""Data-quality checks on the seeded test database, and retention."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from kaptan.db import DictConn
from kaptan.dq import run_dq
from kaptan.dq.checks import CHECKS

pytestmark = pytest.mark.integration
DAY = date(2026, 10, 20)


async def test_every_check_runs_and_is_stored(pg: DictConn) -> None:
    results = await run_dq(pg, DAY)
    assert [r.code for r in results] == list(CHECKS)
    by = {r.code: r for r in results}
    assert all("error" not in r.observed for r in results), [r for r in results if "error" in r.observed]
    assert by["Q-A1"].passed and by["Q-P1"].passed and by["Q-N1"].severity == "info"
    async with pg.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM ops.dq_results")
        assert (await cur.fetchone())["n"] == len(CHECKS)
    await pg.execute(
        "INSERT INTO core.prices_daily (ticker, d, open, high, low, close, price_basis, source)"
        " VALUES ('TSTAA', '2026-10-19', 10, 9, 8, 10, 'raw', 'isyatirim')"
    )
    again = await run_dq(pg, DAY, only=("Q-P1",))
    assert again[0].passed is False and again[0].observed == {"bad_rows": 1}


async def test_retention_prunes_old_raw_payloads_and_checkpoints(pg: DictConn) -> None:
    from kaptan.dq import run_retention

    now = datetime(2026, 10, 20, 3, 30, tzinfo=UTC)
    old = now - timedelta(days=200)
    async with pg.cursor() as cur:
        await cur.executemany(
            "INSERT INTO ops.ingest_raw (source, natural_key, payload, payload_sha256, fetched_at)"
            " VALUES (%s, %s, '{}', %s, %s)",
            [
                ("kap_list", "k1", b"a", old),
                ("kap_list", "k1", b"b", old + timedelta(days=1)),  # newest of k1: kept although old
                ("kap_list", "k2", b"c", old),  # only payload of k2: kept
                ("kap_list", "k1", b"d", now),  # recent: kept, and now the newest → the two old k1 go
            ],
        )
        await cur.execute(
            "INSERT INTO agent_ckpt.checkpoints (thread_id, checkpoint_id, checkpoint, metadata)"
            " VALUES ('run-live-1', 'c1', '{}', '{}'), ('run-live-2', 'c1', '{}', '{}')"
        )
        await cur.execute(
            "INSERT INTO core.disclosures (disclosure_index, company_name, disclosure_class, disclosure_type,"
            " subject, summary, reason, subject_route, subject_map_version, published_at, available_at,"
            " ingest_source, origin) VALUES (990400001, 'X', 'ODA', 'ODA', 's', '', 'NEW', 'E1', 'v', %s, %s,"
            " 'live', 'kap'), (990400002, 'X', 'ODA', 'ODA', 's', '', 'NEW', 'E1', 'v', %s, %s, 'live', 'kap')",
            (old, old, now, now),
        )
        await cur.execute(
            "INSERT INTO ops.agent_feed (disclosure_index, status, run_id, finished_at) VALUES"
            " (990400001, 'done', 'run-live-1', %s), (990400002, 'waiting_approval', 'run-live-2', NULL)",
            (old,),
        )
    stats = await run_retention(pg, now)
    assert stats.ingest_raw == 2 and stats.threads == 1 and stats.checkpoint_rows == 1
    async with pg.cursor() as cur:
        await cur.execute("SELECT thread_id FROM agent_ckpt.checkpoints WHERE thread_id LIKE 'run-live-%%'")
        assert [r["thread_id"] for r in await cur.fetchall()] == ["run-live-2"]
