"""The ingest side of the agent feed without Postgres/Redis: the detail loop's `text` stage hook."""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from typing import Any

import pytest

from kaptan.ingest.publish import AGENT_STREAM
from kaptan.workers import ingest_worker


class FakeRedis:
    def __init__(self) -> None:
        self.keys: set[str] = set()
        self.entries: list[dict[str, str]] = []

    async def set(self, key: str, value: str, *, nx: bool, ex: int) -> bool:
        if key in self.keys:
            return False
        self.keys.add(key)
        return True

    async def xadd(self, stream: str, fields: dict[str, str], **_kw: Any) -> str:
        assert stream == AGENT_STREAM
        self.entries.append(fields)
        return "1-0"


async def test_detail_loop_publishes_the_text_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()

    async def fake_fetch(pool: Any, client: Any, on_stored: Any = None) -> int:
        await on_stored(42)
        stop.set()
        return 42

    monkeypatch.setattr(ingest_worker, "fetch_one", fake_fetch)
    redis = FakeRedis()
    await ingest_worker.detail_loop(None, None, stop, redis=redis)  # type: ignore[arg-type]
    assert redis.entries == [{"disclosure_index": "42", "stage": "text"}]


async def test_detail_loop_without_redis_has_no_hook(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()
    seen: list[Any] = []

    async def fake_fetch(pool: Any, client: Any, on_stored: Any = None) -> int:
        seen.append(on_stored)
        stop.set()
        return 1

    monkeypatch.setattr(ingest_worker, "fetch_one", fake_fetch)
    await ingest_worker.detail_loop(None, None, stop)  # type: ignore[arg-type]
    assert seen == [None]


class FakePool:
    """pool.connection() as an async context manager that hands out one sentinel connection."""

    def __init__(self) -> None:
        self.conn = object()

    @contextlib.asynccontextmanager
    async def connection(self) -> AsyncIterator[Any]:
        yield self.conn


async def test_detail_loop_indexes_the_text_for_rag_then_publishes(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()
    calls: list[tuple[Any, list[int]]] = []

    async def fake_fetch(pool: Any, client: Any, on_stored: Any = None) -> int:
        await on_stored(42)
        stop.set()
        return 42

    async def fake_index(conn: Any, indexes: list[int]) -> None:
        calls.append((conn, list(indexes)))

    monkeypatch.setattr(ingest_worker, "fetch_one", fake_fetch)
    monkeypatch.setattr(ingest_worker, "index_new_disclosures", fake_index)
    pool, redis = FakePool(), FakeRedis()
    await ingest_worker.detail_loop(pool, None, stop, redis=redis, rag_index=True)  # type: ignore[arg-type]
    assert calls == [(pool.conn, [42])]
    assert redis.entries == [{"disclosure_index": "42", "stage": "text"}]


async def test_detail_loop_indexes_for_rag_even_without_the_agent_feed(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()
    calls: list[list[int]] = []

    async def fake_fetch(pool: Any, client: Any, on_stored: Any = None) -> int:
        await on_stored(7)
        stop.set()
        return 7

    async def fake_index(conn: Any, indexes: list[int]) -> None:
        calls.append(list(indexes))

    monkeypatch.setattr(ingest_worker, "fetch_one", fake_fetch)
    monkeypatch.setattr(ingest_worker, "index_new_disclosures", fake_index)
    await ingest_worker.detail_loop(FakePool(), None, stop, rag_index=True)  # type: ignore[arg-type]
    assert calls == [[7]]


class DownRedis(FakeRedis):
    def __init__(self, *, delete_fails: bool = False) -> None:
        super().__init__()
        self.deleted: list[str] = []
        self.delete_fails = delete_fails

    async def xadd(self, stream: str, fields: dict[str, str], **_kw: Any) -> str:
        raise ConnectionError("redis down")

    async def delete(self, key: str) -> int:
        if self.delete_fails:
            raise ConnectionError("still down")
        self.deleted.append(key)
        self.keys.discard(key)
        return 1


@pytest.mark.parametrize("delete_fails", [False, True])
async def test_a_redis_outage_never_stops_ingestion(delete_fails: bool) -> None:
    from kaptan.ingest.publish import publish_to_agents, sent_key

    redis = DownRedis(delete_fails=delete_fails)
    assert await publish_to_agents(redis, [7, 8]) == 0
    if not delete_fails:
        assert redis.deleted == [sent_key(7, "listed"), sent_key(8, "listed")]  # the next poll retries
