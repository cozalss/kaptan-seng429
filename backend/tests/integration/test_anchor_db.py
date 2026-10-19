"""Nightly audit verify + anchor (FR-32, M3 B1). One rolled-back connection per test."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from kaptan.audit.anchor import CHAIN_OK_KEY, anchor_chain
from kaptan.audit.verify import verify_db
from kaptan.db import DictConn
from kaptan.domain.schemas._base import iso_ms

pytestmark = pytest.mark.integration

NOW = datetime(2027, 1, 11, 20, 30, tzinfo=UTC)


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def set(self, key: str, value: str) -> None:
        self.values[key] = value


async def _one(conn: DictConn, sql: str, params: Any = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return await cur.fetchone()


async def test_a_verified_chain_is_anchored_in_db_and_file(pg: DictConn, tmp_path: Path) -> None:
    redis = FakeRedis()
    path = tmp_path / "anchors" / "audit.jsonl"
    report = await anchor_chain(pg, NOW, anchor_file=path, redis=redis)
    assert report.ok and report.anchored and report.target == "db+file" and report.checked > 0
    row = await _one(pg, "SELECT * FROM audit.anchors WHERE anchored_at = %s", (NOW,))
    assert row is not None and row["chain_pos"] == report.checked and row["hash"] == report.head_hash
    line = json.loads(path.read_text(encoding="utf-8").strip())
    assert line == {"anchored_at": iso_ms(NOW), "chain_pos": report.checked, "hash": report.head_hash}
    assert redis.values[CHAIN_OK_KEY] == "1"
    verdict = await verify_db(pg, iso_ms(NOW))  # the next walk checks against the anchor
    assert verdict["ok"] and verdict["anchor"]["chain_pos"] == report.checked


async def test_verify_only_writes_nothing(pg: DictConn) -> None:
    report = await anchor_chain(pg, NOW, write=False)
    assert report.ok and not report.anchored
    assert await _one(pg, "SELECT 1 FROM audit.anchors WHERE anchored_at = %s", (NOW,)) is None


async def test_a_broken_chain_is_not_anchored_and_is_loud(
    pg: DictConn, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    import kaptan.audit.anchor as anchor

    async def broken(conn: Any, now_iso: str) -> dict[str, Any]:
        return {"ok": False, "first_bad_pos": 7, "kind": "hash_mismatch", "checked": 6, "head_hash": "ab" * 32}

    monkeypatch.setattr(anchor, "verify_db", broken)
    redis = FakeRedis()
    report = await anchor_chain(pg, NOW, redis=redis)
    assert not report.ok and not report.anchored and report.first_bad_pos == 7
    assert redis.values[CHAIN_OK_KEY] == "0"
    assert "AUDIT CHAIN BROKEN" in caplog.text
    row = await _one(pg, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert row is not None and row["action"] == "audit.verify_failed"
    assert row["payload"] == {"first_bad_pos": 7, "kind": "hash_mismatch", "checked": 6}
    assert await _one(pg, "SELECT 1 FROM audit.anchors WHERE anchored_at = %s", (NOW,)) is None
