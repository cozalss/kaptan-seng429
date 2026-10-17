"""KAP ingestion against the compose Postgres (+ Redis for SSE), offline from recorded fixtures.

The demo day is seeded in the same database: these tests also prove that ingestion never touches
`origin = 'demo'` rows and that DEMO_MODE stays undisturbed (KAP rows invisible, nothing published).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import redis.asyncio as aioredis
from psycopg_pool import AsyncConnectionPool

from kaptan.db import DictConn, create_pool
from kaptan.demo.seed import SeedResult
from kaptan.events import bus
from kaptan.ingest import repo
from kaptan.ingest.detail_fetcher import fetch_one
from kaptan.ingest.kap_backfill import backfill, refresh_members
from kaptan.ingest.kap_client import KapBlockedError, KapError
from kaptan.ingest.kap_poller import KapPoller, PollConfig
from kaptan.settings import Settings
from tests.ingest_support import DAY_15, DAY_16, FakeKap, list_main

pytestmark = pytest.mark.integration

#: 23:30 Istanbul on 16.10.2026 — after every row of the recorded day.
NOW = datetime(2026, 10, 16, 20, 30, tzinfo=UTC)
#: Detail-queue tests: queue rows default to the wall clock, so "now" must be later than that.
FUTURE = datetime.now(UTC).replace(microsecond=0) + timedelta(days=1)

CLEAN_SQL = """
DELETE FROM ops.detail_fetch_queue;
DELETE FROM core.disclosure_texts t USING core.disclosures d
 WHERE d.disclosure_index = t.disclosure_index AND d.origin = 'kap';
DELETE FROM core.disclosures WHERE origin = 'kap';
DELETE FROM core.tickers;
DELETE FROM core.companies;
DELETE FROM ops.ingest_raw;
DELETE FROM ops.ingestion_runs WHERE job = 'kap_backfill';
"""


@pytest.fixture
async def ipool(seeded: SeedResult, migrated: Settings) -> AsyncIterator[AsyncConnectionPool[DictConn]]:
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)
    async with pool.connection() as conn:
        await conn.execute(CLEAN_SQL)
    try:
        yield pool
    finally:
        async with pool.connection() as conn:
            await conn.execute(CLEAN_SQL)
        await pool.close()


@pytest.fixture
async def redis(migrated: Settings) -> AsyncIterator[aioredis.Redis]:
    client = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await client.ping()
    except Exception as exc:
        pytest.skip(f"redis unreachable: {exc}")
    yield client
    await client.aclose()


async def one(pool: AsyncConnectionPool[DictConn], sql: str, *args: Any) -> dict[str, Any]:
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(sql, args or None)
        row = await cur.fetchone()
    assert row is not None
    return dict(row)


async def feed_events(redis: aioredis.Redis, after: str) -> list[tuple[str, dict[str, Any]]]:
    entries = await redis.xrange(bus.stream_key("feed"), min=f"({after}" if after != "0" else "-")
    return [(fields["event"], json.loads(fields["data"])) for _id, fields in entries]


async def last_id(redis: aioredis.Redis) -> str:
    entries = await redis.xrevrange(bus.stream_key("feed"), count=1)
    return str(entries[0][0]) if entries else "0"


def poller(pool: Any, kap: FakeKap, redis: Any, *, demo: bool = False, now: datetime = NOW) -> KapPoller:
    clock = {"now": now}
    p = KapPoller(pool=pool, client=kap, cfg=PollConfig(demo_mode=demo), redis=redis, now=lambda: clock["now"])  # type: ignore[arg-type]
    p.clock = clock  # type: ignore[attr-defined]
    return p


async def test_migration_keeps_m1_rows_as_demo(ipool: AsyncConnectionPool[DictConn]) -> None:
    row = await one(
        ipool, "SELECT count(*) AS n, count(*) FILTER (WHERE origin = 'demo') AS demo FROM core.disclosures"
    )
    assert row["n"] == row["demo"] > 300
    texts = await one(ipool, "SELECT count(*) AS n FROM core.disclosure_texts WHERE source = 'manual'")
    assert texts["n"] > 0


async def test_live_poll_stores_links_queues_and_publishes(
    ipool: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    kap = FakeKap(lists={DAY_16: list_main(DAY_16)})
    before = await last_id(redis)
    p = poller(ipool, kap, redis)
    result = await p.poll_once()
    assert (result.fetched, result.inserted, result.skipped, result.errors) == (481, 481, 0, [])
    assert result.published == 481 and result.reconciled

    stats = await one(
        ipool,
        "SELECT count(*) AS n, count(*) FILTER (WHERE visible) AS visible, count(company_id) AS linked,"
        " count(*) FILTER (WHERE ingest_source = 'live' AND first_seen_at IS NOT NULL) AS live"
        " FROM core.disclosures WHERE origin = 'kap'",
    )
    assert stats["n"] == stats["visible"] == stats["live"] == 481
    assert stats["linked"] == 476  # BIST/Takasbank/SPK notices and non-listed subjects stay unlinked

    cvk = await one(
        ipool,
        "SELECT d.company_name, d.reason, d.classification, d.available_at, t.ticker FROM core.disclosures d "
        "JOIN core.tickers t ON t.company_id = d.company_id WHERE d.disclosure_index = 1683376",
    )
    assert cvk["ticker"] == "CVKMD" and cvk["company_name"].startswith("CVK MADEN")
    assert cvk["reason"] == "UPD" and cvk["classification"]["event_type"] == "E1"
    notice = await one(
        ipool, "SELECT company_name, primary_ticker FROM core.disclosures WHERE disclosure_index = 1683269"
    )
    assert notice["primary_ticker"] == "BAHKM" and notice["company_name"] != "KAMUYU AYDINLATMA PLATFORMU"

    queued = await one(ipool, "SELECT count(*) AS n, min(priority) AS p FROM ops.detail_fetch_queue")
    assert queued["n"] == 60 + 28 + 3 + 1 + 43 and queued["p"] == 0  # E1 + E2 + E3 + E4 + llm
    raw = await one(ipool, "SELECT count(*) AS n FROM ops.ingest_raw WHERE source = 'kap.list_main'")
    assert raw["n"] == 481

    events = await feed_events(redis, before)
    kinds = [e for e, _ in events]
    assert kinds.count("disclosure") == 481 and kinds[-1] == "counters"
    first = next(d for e, d in events if e == "disclosure")
    assert first["ingest_source"] == "live" and first["disclosure_oid"]
    assert [c for c in kap.calls if c[0] == "company_items"] == [("company_items", "IGS")]


async def test_repeat_polls_dedup_and_reconcile(ipool: AsyncConnectionPool[DictConn], redis: aioredis.Redis) -> None:
    kap = FakeKap(lists={DAY_16: list_main(DAY_16)})
    p = poller(ipool, kap, redis)
    await p.poll_once()
    first = await one(
        ipool, "SELECT first_seen_at, available_at FROM core.disclosures WHERE disclosure_index = 1683376"
    )

    p.clock["now"] = NOW + timedelta(minutes=1)  # type: ignore[attr-defined]
    again = await p.poll_once()
    assert (again.inserted, again.updated, again.published, again.reconciled) == (0, 0, 0, False)

    # a late row with a lower index appears: only the 10-minute reconciliation picks it up
    late = {
        "disclosureBasic": {**list_main(DAY_16)[0]["disclosureBasic"], "disclosureIndex": 1600001, "disclosureId": "x1"}
    }
    kap.lists[DAY_16] = [*list_main(DAY_16), late]
    p.clock["now"] = NOW + timedelta(minutes=2)  # type: ignore[attr-defined]
    assert (await p.poll_once()).inserted == 0
    p.clock["now"] = NOW + timedelta(minutes=12)  # type: ignore[attr-defined]
    rec = await p.poll_once()
    assert rec.reconciled and rec.inserted == 1 and rec.updated == 481
    row = await one(ipool, "SELECT ingest_source FROM core.disclosures WHERE disclosure_index = 1600001")
    assert row["ingest_source"] == "reconcile"
    after = await one(
        ipool, "SELECT first_seen_at, available_at FROM core.disclosures WHERE disclosure_index = 1683376"
    )
    assert after == first  # first_seen_at / available_at are never moved


async def test_next_day_hides_yesterday_and_reads_both_days(
    ipool: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    kap = FakeKap(lists={DAY_15: list_main(DAY_15)})
    p = poller(ipool, kap, redis, now=datetime(2026, 10, 15, 20, 0, tzinfo=UTC))
    assert (await p.poll_once()).inserted == 247
    kap.lists[DAY_16] = list_main(DAY_16)
    p.clock["now"] = NOW  # type: ignore[attr-defined]
    res = await p.poll_once()
    assert [c[1] for c in kap.calls if c[0] == "list_main"] == [DAY_15, DAY_15, DAY_16]
    assert res.inserted == 481
    vis = await one(
        ipool,
        "SELECT count(*) FILTER (WHERE visible) AS today, count(*) FILTER (WHERE NOT visible) AS old"
        " FROM core.disclosures WHERE origin = 'kap'",
    )
    assert (vis["today"], vis["old"]) == (481, 247)


async def test_demo_mode_stores_invisible_and_publishes_nothing(
    ipool: AsyncConnectionPool[DictConn], redis: aioredis.Redis
) -> None:
    before = await last_id(redis)
    visible_demo = await one(ipool, "SELECT count(*) AS n FROM core.disclosures WHERE origin = 'demo' AND visible")
    res = await poller(ipool, FakeKap(lists={DAY_16: list_main(DAY_16)}), redis, demo=True).poll_once()
    assert res.inserted == 481 and res.published == 0
    row = await one(ipool, "SELECT count(*) FILTER (WHERE visible) AS v FROM core.disclosures WHERE origin = 'kap'")
    assert row["v"] == 0
    assert (
        await one(ipool, "SELECT count(*) AS n FROM core.disclosures WHERE origin = 'demo' AND visible") == visible_demo
    )
    assert await feed_events(redis, before) == []


async def test_a_real_index_colliding_with_a_demo_row_is_skipped(ipool: AsyncConnectionPool[DictConn]) -> None:
    demo = await one(
        ipool, "SELECT disclosure_index, subject, company_name FROM core.disclosures WHERE origin = 'demo' LIMIT 1"
    )
    row = list_main(DAY_16)[0]
    clash = {"disclosureBasic": {**row["disclosureBasic"], "disclosureIndex": demo["disclosure_index"]}}
    res = await poller(ipool, FakeKap(lists={DAY_16: [clash]}), None).poll_once()
    assert (res.inserted, res.skipped) == (0, 1)
    same = await one(
        ipool,
        "SELECT subject, company_name, origin FROM core.disclosures WHERE disclosure_index = %s",
        demo["disclosure_index"],
    )
    assert same == {**{k: demo[k] for k in ("subject", "company_name")}, "origin": "demo"}


async def two_days(pool: AsyncConnectionPool[DictConn]) -> FakeKap:
    """Both recorded days stored; every queued detail marked done (tests re-queue what they need)."""
    await poller(
        pool, FakeKap(lists={DAY_15: list_main(DAY_15)}), None, now=datetime(2026, 10, 15, 20, tzinfo=UTC)
    ).poll_once()
    kap = FakeKap(lists={DAY_16: list_main(DAY_16)})
    await poller(pool, kap, None).poll_once()
    async with pool.connection() as conn:
        await conn.execute("UPDATE ops.detail_fetch_queue SET status = 'done'")
    return kap


async def requeue(pool: AsyncConnectionPool[DictConn], *indices: int, attempts: int = 0) -> None:
    async with pool.connection() as conn:
        await conn.execute(
            "UPDATE ops.detail_fetch_queue SET status = 'queued', attempts = %s WHERE disclosure_index = ANY(%s)",
            (attempts, list(indices)),
        )


async def test_detail_queue_stores_texts_parsed_documents_and_reasons(ipool: AsyncConnectionPool[DictConn]) -> None:
    kap = await two_days(ipool)
    await requeue(ipool, 1683372, 1682993, 1683355, 1683376)
    done = [await fetch_one(ipool, kap, now=lambda: FUTURE) for _ in range(5)]
    assert sorted(i for i in done if i) == [1682993, 1683355, 1683372, 1683376] and done[-1] is None

    aztek = await one(
        ipool,
        "SELECT d.reason, d.parsed, t.source, t.body_norm, t.extractor_version, length(t.payload_sha256) AS sha "
        "FROM core.disclosures d JOIN core.disclosure_texts t USING (disclosure_index) "
        "WHERE disclosure_index = 1683372 AND t.lang = 'tr'",
    )
    assert aztek["source"] == "bildirim_pdf" and aztek["sha"] == 32 and aztek["extractor_version"] == "kap-detail.v1"
    assert aztek["parsed"]["kind"] == "buyback" and aztek["parsed"]["transactions"][0]["nominal_try"] == "491234"
    assert aztek["reason"] == "UPD" and aztek["body_norm"].startswith("aztek teknoloji")
    order = await one(
        ipool, "SELECT reason, parsed->>'amount_try' AS amount FROM core.disclosures WHERE disclosure_index = 1682993"
    )
    assert order == {"reason": "NEW", "amount": "63576313"}
    langs = await one(
        ipool,
        "SELECT array_agg(lang ORDER BY lang) AS l, min(source) AS s FROM core.disclosure_texts "
        "WHERE disclosure_index = 1683355",
    )
    assert langs == {"l": ["en", "tr"], "s": "rsc_payload"}
    retry = await one(
        ipool,
        "SELECT status, attempts, last_error, next_attempt_at FROM ops.detail_fetch_queue "
        "WHERE disclosure_index = 1683376",
    )
    assert retry["status"] == "queued" and retry["attempts"] == 1 and "fixture" in retry["last_error"]
    assert retry["next_attempt_at"] == FUTURE + timedelta(minutes=5)


async def test_detail_failures_give_up_and_waf_requeues(ipool: AsyncConnectionPool[DictConn]) -> None:
    kap = await two_days(ipool)
    await requeue(ipool, 1683376, attempts=4)
    assert await fetch_one(ipool, kap, now=lambda: FUTURE) == 1683376
    final = await one(ipool, "SELECT status, attempts FROM ops.detail_fetch_queue WHERE disclosure_index = 1683376")
    assert final == {"status": "failed", "attempts": 5}

    await requeue(ipool, 1683372)
    kap.errors["bildirim_pdf"] = [KapBlockedError("666")]
    with pytest.raises(KapBlockedError):
        await fetch_one(ipool, kap, now=lambda: FUTURE)
    waf = await one(
        ipool, "SELECT status, next_attempt_at FROM ops.detail_fetch_queue WHERE disclosure_index = 1683372"
    )
    assert waf == {"status": "queued", "next_attempt_at": FUTURE + timedelta(minutes=10)}

    async with ipool.connection() as conn:
        await conn.execute("UPDATE ops.detail_fetch_queue SET status = 'running' WHERE disclosure_index = 1683376")
        assert await repo.release_running(conn) == 1
        await conn.commit()


async def test_backfill_is_resumable_and_keeps_point_in_time(ipool: AsyncConnectionPool[DictConn]) -> None:
    kap = FakeKap()
    companies = await refresh_members(ipool, kap, DAY_16)  # type: ignore[arg-type]
    report = await backfill(ipool, kap, DAY_15, DAY_16, companies=companies, queue_details=True)  # type: ignore[arg-type]
    assert (report.days, report.rows, report.inserted, report.errors) == (2, 476, 476, [])
    assert report.queued_details == 60 + 28 + 3 + 1 + 43
    row = await one(
        ipool,
        "SELECT ingest_source, first_seen_at, available_at - published_at AS lag, visible, disclosure_oid, company_id, "
        "(SELECT priority FROM ops.detail_fetch_queue q WHERE q.disclosure_index = d.disclosure_index) AS prio "
        "FROM core.disclosures d WHERE disclosure_index = 1683376",
    )
    assert row["ingest_source"] == "backfill" and row["first_seen_at"] is None and row["lag"] == timedelta(seconds=60)
    assert row["visible"] is False and row["disclosure_oid"] is None and row["company_id"] is not None
    assert row["prio"] == 1
    runs = await one(
        ipool,
        "SELECT count(*) FILTER (WHERE status = 'done') AS done FROM ops.ingestion_runs WHERE job = 'kap_backfill'",
    )
    assert runs["done"] == 2

    again = await backfill(ipool, kap, DAY_15, DAY_16)  # type: ignore[arg-type]
    assert again.skipped_days == 2 and again.days == 0

    # the live poller later sees the same row: first_seen fills, availability (P1) stays as backfilled
    await poller(ipool, FakeKap(lists={DAY_16: list_main(DAY_16)}), None).poll_once()
    seen = await one(
        ipool,
        "SELECT first_seen_at, available_at - published_at AS lag, disclosure_oid FROM core.disclosures "
        "WHERE disclosure_index = 1683376",
    )
    assert seen["first_seen_at"] == NOW and seen["lag"] == timedelta(seconds=60) and seen["disclosure_oid"]


async def test_backfill_failures_are_recorded(ipool: AsyncConnectionPool[DictConn]) -> None:
    kap = FakeKap()
    kap.errors["by_criteria"] = [KapError("HTTP 400"), KapBlockedError("666")]
    with pytest.raises(KapBlockedError):
        await backfill(ipool, kap, DAY_15, DAY_16)  # type: ignore[arg-type]
    runs = await one(
        ipool,
        "SELECT array_agg(key || ':' || status ORDER BY key) AS r FROM ops.ingestion_runs WHERE job = 'kap_backfill'",
    )
    assert runs["r"] == ["2026-10-15:failed", "2026-10-16:failed"]
    resumed = await backfill(ipool, kap, DAY_15, DAY_16)  # type: ignore[arg-type]
    assert resumed.days == 2 and resumed.rows == 476
    with pytest.raises(ValueError):
        await backfill(ipool, kap, DAY_16, DAY_15)  # type: ignore[arg-type]


async def test_ticker_moves_close_the_old_row(ipool: AsyncConnectionPool[DictConn]) -> None:
    async with ipool.connection() as conn:
        async with conn.transaction():
            await repo.upsert_companies(
                conn,
                [{"kapMemberOid": "A1", "mkkMemberOid": "M1", "kapMemberTitle": "ESKİ A.Ş.", "stockCode": "KOZAL"}],
                DAY_15,
            )
            await repo.upsert_companies(
                conn,
                [
                    {"kapMemberOid": "B1", "kapMemberTitle": "YENİ A.Ş.", "stockCode": "KOZAL, TRALT"},
                    {"kapMemberOid": None},
                ],
                DAY_16,
            )
        index = await repo.load_company_index(conn)
    assert index.by_ticker["KOZAL"][1] == "YENİ A.Ş." and index.by_member["M1"][1] == "ESKİ A.Ş."
    rows = await one(ipool, "SELECT count(*) AS n, count(valid_to) AS closed FROM core.tickers WHERE ticker = 'KOZAL'")
    assert rows == {"n": 2, "closed": 1}


class _ClientFactory:
    def __init__(self, kap: FakeKap) -> None:
        self.kap = kap

    def from_settings(self, settings: Settings, **kwargs: Any) -> FakeKap:
        return self.kap


async def test_worker_runs_both_loops_until_stopped(
    ipool: AsyncConnectionPool[DictConn], migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio

    from kaptan.workers import ingest_worker

    kap = FakeKap(lists={})
    monkeypatch.setattr(ingest_worker, "KapClient", _ClientFactory(kap))
    settings = migrated.model_copy(update={"kap_live": True, "demo_mode": False})
    stop = asyncio.Event()
    task = asyncio.create_task(ingest_worker.run_worker(settings, stop))
    for _ in range(100):
        if any(c[0] == "list_main" for c in kap.calls):
            break
        await asyncio.sleep(0.05)
    stop.set()
    assert await asyncio.wait_for(task, timeout=10) == 0
    assert [c[0] for c in kap.calls][:2] == ["list_main", "company_items"]


async def test_backfill_cli_end_to_end(
    ipool: AsyncConnectionPool[DictConn], migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from kaptan.ingest import backfill as cli

    kap = FakeKap()
    monkeypatch.setattr(cli, "KapClient", _ClientFactory(kap))
    args = cli.parse_args(["--from", "2026-10-16", "--to", "2026-10-16", "--details", "--drain", "2"])
    report = await cli.main_async(args, migrated)
    assert (report.days, report.inserted) == (1, 476)
    assert [c[0] for c in kap.calls].count("bildirim_pdf") == 2  # drained two queued texts


def test_backfill_cli_exit_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    from kaptan.ingest import backfill as cli
    from kaptan.ingest.kap_backfill import BackfillReport

    def close(coro: Any) -> None:
        coro.close()

    monkeypatch.setattr(cli, "get_settings", lambda: None)
    outcomes: list[Any] = [KapBlockedError("666"), BackfillReport(failed_days=["2026-10-16"]), BackfillReport(days=1)]

    def fake_run(coro: Any) -> Any:
        close(coro)
        item = outcomes.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(cli, "run", fake_run)
    argv = ["--from", "2026-10-16", "--to", "2026-10-16"]
    assert [cli.main(argv), cli.main(argv), cli.main(argv)] == [2, 1, 0]
