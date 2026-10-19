"""kaptan.rag against the compose Postgres (pgvector, turkish FTS, pg_trgm), offline: the fake embedder only.

The recorded KAP days (tests/fixtures/kap_json) are loaded as origin='kap' backfill rows next to the
demo seed; the 11 recorded texts are indexed once per module. Point in time is tested to the second.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from kaptan.agents.context import DeskState, DisclosureInput, RunContext
from kaptan.agents.tools import ReplayToolbox
from kaptan.db import DictConn, connect
from kaptan.demo.seed import SeedResult
from kaptan.rag import eval as rag_eval
from kaptan.rag import index as cli
from kaptan.rag.agent_context import attach_similar
from kaptan.rag.embed import CachedEmbedder, build_embedder
from kaptan.rag.hybrid import similar_disclosures
from kaptan.rag.index import index_disclosures, index_new_disclosures
from kaptan.settings import Settings

pytestmark = pytest.mark.integration

LATER = datetime(2026, 10, 18, tzinfo=UTC)
#: 1682993 "Cam Siparişi Alınması Hk." was published 16.10.2026 11:22:11 Istanbul (08:22:11Z).
CAM_PUBLISHED = datetime(2026, 10, 16, 8, 22, 11, tzinfo=UTC)

CLEAN_SQL = """
DELETE FROM rag.rag_chunks;
DELETE FROM core.disclosure_texts t USING core.disclosures d
 WHERE d.disclosure_index = t.disclosure_index AND d.origin = 'kap';
DELETE FROM core.disclosures WHERE origin = 'kap';
DELETE FROM core.tickers;
DELETE FROM core.companies;
"""


async def _clean(settings: Settings) -> None:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        await conn.execute(CLEAN_SQL)
        await conn.commit()
    finally:
        await conn.close()


@pytest.fixture(scope="module")
async def corpus(seeded: SeedResult, migrated: Settings) -> AsyncIterator[list[int]]:
    await _clean(migrated)
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        indexes = await rag_eval.load_fixture_corpus(conn)
        stats = await rag_eval.index_fixture_corpus(conn, fake(), indexes, distractors=False)
        assert stats.disclosures == 11 and not stats.errors
    finally:
        await conn.close()
    yield indexes
    await _clean(migrated)


@pytest.fixture
async def conn(corpus: list[int], migrated: Settings) -> AsyncIterator[DictConn]:
    c = await connect(migrated.database_url.get_secret_value())
    try:
        yield c
    finally:
        await c.rollback()
        await c.close()


def fake() -> CachedEmbedder:
    return build_embedder(kind="fake")


async def scalar(conn: DictConn, sql: str, *args: Any) -> Any:
    async with conn.cursor() as cur:
        await cur.execute(sql, args)
        row = await cur.fetchone()
    assert row is not None
    return next(iter(row.values()))


async def test_index_stores_model_version_and_vectors_and_is_idempotent(conn: DictConn) -> None:
    row = await scalar(
        conn,
        "SELECT json_build_object('n', count(*), 'models', array_agg(DISTINCT embed_model || '@' || embed_version),"
        " 'dims', array_agg(DISTINCT vector_dims(embedding)), 'kinds', array_agg(DISTINCT doc_kind),"
        " 'bad_pit', count(*) FILTER (WHERE available_at < published_at)) FROM rag.rag_chunks",
    )
    assert row["models"] == ["fake-hash-f5@1"] and row["dims"] == [1024] and row["bad_pit"] == 0
    assert set(row["kinds"]) == {"disclosure", "fin_report"} and row["n"] > 11
    again = await rag_eval.index_fixture_corpus(conn, fake(), rag_eval.text_indexes(), distractors=False)
    assert again.embedded == 0 and again.unchanged == row["n"] and again.removed == 0
    tsv = await scalar(conn, "SELECT count(*) FROM rag.rag_chunks WHERE tsv @@ to_tsquery('turkish', 'ihale')")
    assert tsv >= 2  # the turkish configuration stems "İhale"/"ihalesi"


async def test_a_shorter_text_replaces_its_chunks(conn: DictConn) -> None:
    before = await scalar(conn, "SELECT count(*) FROM rag.rag_chunks WHERE doc_ref = 'kap:1683354'")
    old = await scalar(conn, "SELECT body FROM core.disclosure_texts WHERE disclosure_index = 1683354")
    try:
        await conn.execute(
            "UPDATE core.disclosure_texts SET body = 'Kısa rapor metni.' WHERE disclosure_index = 1683354"
        )
        stats = await index_disclosures(conn, fake(), indexes=[1683354])
        assert before > 1 and stats.embedded == 1 and stats.removed == before - 1
    finally:
        await conn.execute("UPDATE core.disclosure_texts SET body = %s WHERE disclosure_index = 1683354", (old,))
        await index_disclosures(conn, fake(), indexes=[1683354])
        await conn.commit()


async def test_no_look_ahead_to_the_second(conn: DictConn) -> None:
    query = "cam siparişi yeni iş ilişkisi"
    seen = []
    for as_of in (CAM_PUBLISHED, CAM_PUBLISHED + timedelta(seconds=1), CAM_PUBLISHED + timedelta(seconds=61)):
        hits = await similar_disclosures(conn, fake(), as_of=as_of, text=query, k=10)
        assert all(h.published_at < as_of for h in hits)
        seen.append(1682993 in [h.disclosure_index for h in hits])
    # published at as_of → no; one second later it is published but not yet available (backfill: +60 s) → no
    assert seen == [False, False, True]
    early = await similar_disclosures(conn, fake(), as_of=datetime(2026, 10, 1, tzinfo=UTC), text=query, k=10)
    assert early == []


async def test_query_by_disclosure_excludes_itself_and_applies_filters(conn: DictConn) -> None:
    hits = await similar_disclosures(conn, fake(), as_of=LATER, disclosure_index=1683376, k=5)
    assert hits[0].disclosure_index == 1683372 and 1683376 not in [h.disclosure_index for h in hits]
    assert hits[0].event_type == "E1" and hits[0].citation() == "kap:1683372 (2026-10-16)"
    assert set(hits[0].legs) >= {"dense", "fts"} and hits[0].snippet
    e1 = await similar_disclosures(conn, fake(), as_of=LATER, disclosure_index=1683376, k=5, event_type="E1")
    assert [h.event_type for h in e1] == ["E1"]
    ticker = hits[0].ticker
    assert ticker is not None
    only = await similar_disclosures(conn, fake(), as_of=LATER, text="pay geri alım", k=5, ticker=ticker)
    assert {h.ticker for h in only} == {ticker}
    lexical = await similar_disclosures(conn, None, as_of=LATER, text="ihale", k=3, model="fake-hash-f5")
    assert {h.disclosure_index for h in lexical} >= {1682623, 1683277} and all("dense" not in h.legs for h in lexical)
    other_model = await similar_disclosures(conn, None, as_of=LATER, text="ihale", k=3, model="gemini-embedding-001")
    assert other_model == []  # vectors and chunks of another embedder are never mixed in
    with pytest.raises(LookupError):
        await similar_disclosures(conn, fake(), as_of=LATER, disclosure_index=999, k=3)


async def test_offline_eval_recall_on_the_hand_labelled_pairs(conn: DictConn) -> None:
    report = await rag_eval.run_eval(conn, fake())
    hybrid = report["modes"]["hybrid"]
    assert report["queries"] == 13
    assert hybrid["recall@5"] >= 0.9 and hybrid["mrr"] >= 0.9
    assert report["modes"]["fts"]["recall@5"] >= 0.9


async def test_offline_eval_with_distractors(conn: DictConn, corpus: list[int]) -> None:
    try:
        stats = await index_disclosures(conn, fake(), indexes=corpus, summaries=True)
        assert stats.disclosures > 400
        report = await rag_eval.run_eval(conn, fake())
        assert report["modes"]["hybrid"]["same_event_precision@1"] >= 0.9
    finally:
        await conn.execute("DELETE FROM rag.rag_chunks WHERE doc_kind = 'summary'")
        await conn.commit()


async def test_ingest_hook_indexes_inside_the_callers_transaction(conn: DictConn, migrated: Settings) -> None:
    on = migrated.model_copy(update={"rag_index_on_ingest": True})
    try:
        await conn.execute("DELETE FROM rag.rag_chunks WHERE doc_ref = 'kap:1683372'")
        stats = await index_new_disclosures(conn, [1683372], settings=on, embedder=fake())
        assert stats.disclosures == 1 and stats.embedded == 1
        failed = await index_new_disclosures(conn, [1683372, 1683376], settings=on, embedder=object())  # type: ignore[arg-type]
        assert failed.stopped
        # the caller's transaction is intact (savepoint rolled back) and keeps the first insert
        assert await scalar(conn, "SELECT count(*) FROM rag.rag_chunks WHERE doc_ref = 'kap:1683372'") == 1
        await conn.commit()
    finally:
        await index_disclosures(conn, fake(), indexes=[1683372])
        await conn.commit()


def _ctx(as_of: datetime, text: str) -> RunContext:
    d = DisclosureInput(
        run_id="run-live-x",
        disclosure_index=1683376,
        ticker="CVKMD",
        company_name="CVK MADEN",
        subject="Payların Geri Alınmasına İlişkin Bildirim",
        summary="Pay Geri Alım İşlemleri",
        text_tr=text,
        published_at=as_of - timedelta(seconds=21),
        available_at=as_of,
        strategy_version="v1.1-fwd",
        is_fixture=False,
    )
    desk = DeskState(True, 1, 1, 0.5, 1)  # type: ignore[arg-type]

    class Live:
        name = "live"

    return RunContext(Live(), ReplayToolbox(), d, desk)  # type: ignore[arg-type]


async def test_live_context_gets_similar_disclosures_with_citations(conn: DictConn, migrated: Settings) -> None:
    from tests.ingest_support import detail_text

    ctx = _ctx(LATER, detail_text(1683376))
    filled = await attach_similar(conn, ctx, settings=migrated, embedder=fake())
    assert filled.similar and filled.similar[0].disclosure_index == 1683372
    assert all(s.published_at < LATER and s.disclosure_index != 1683376 for s in filled.similar)
    rows = filled.similar_context()
    assert rows[0]["citation"] == "kap:1683372 (2026-10-16)" and rows[0]["ref_id"] == "doc:1683372:0"
    before = await attach_similar(conn, _ctx(CAM_PUBLISHED, detail_text(1683376)), settings=migrated, embedder=fake())
    assert all(s.published_at < CAM_PUBLISHED for s in before.similar)
    assert 1683372 not in [s.disclosure_index for s in before.similar]


async def test_cli_dry_run_and_fake_index(conn: DictConn, migrated: Settings) -> None:
    dry = await cli.main_async(
        cli.parse_args(["--since", "2026-10-15", "--until", "2026-10-17", "--dry-run"]), migrated
    )
    assert dry.disclosures == 11 and dry.chunks > 11 and dry.embedded == 0
    real = await cli.main_async(cli.parse_args(["--since", "2026-10-15", "--embedder", "fake"]), migrated)
    assert real.disclosures == 11 and real.embedded == 0 and real.unchanged == real.chunks


def test_cli_exit_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    from kaptan.rag.embed import EmbeddingError

    outcomes: list[Any] = [EmbeddingError("no key", provider="x"), cli.IndexStats(errors=["cap"]), cli.IndexStats()]

    def fake_run(coro: Any) -> Any:
        coro.close()
        item = outcomes.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(cli, "get_settings", lambda: None)
    monkeypatch.setattr(cli, "run", fake_run)
    argv = ["--since", "2026-10-16"]
    assert [cli.main(argv), cli.main(argv), cli.main(argv)] == [2, 3, 0]
