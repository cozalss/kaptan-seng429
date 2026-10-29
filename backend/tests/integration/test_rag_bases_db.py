"""The event-memory and regulation RAG bases (M3 B3, FR-12, 07 §11.2–11.3), offline (fake embedder)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest

from kaptan.db import DictConn
from kaptan.llm.task_context import task_context
from kaptan.rag.agent_context import attach_similar
from kaptan.rag.bases import (
    REGULATION_DIR,
    index_base,
    load_event_docs,
    load_regulation_docs,
    regulation_doc,
    regulation_passages,
)
from kaptan.rag.embed import CachedEmbedder, build_embedder
from kaptan.settings import Settings
from tests.integration.test_rag_db import _ctx

pytestmark = pytest.mark.integration

EVENT_AT = datetime(2025, 3, 3, 15, 0, tzinfo=UTC)
CAR20_AT = datetime(2025, 4, 1, 16, 0, tzinfo=UTC)


def fake() -> CachedEmbedder:
    return build_embedder(kind="fake")


async def _event(pg: DictConn) -> int:
    async with pg.cursor() as cur:
        await cur.execute(
            "INSERT INTO core.events (source_kind, ticker, event_code, subtype, direction, classifier, event_time,"
            " available_at) VALUES ('kap', 'KRGCL', 'E1', 'buyback', 1, 'test', %s, %s) RETURNING event_id",
            (EVENT_AT, EVENT_AT),
        )
        row = await cur.fetchone()
        assert row is not None
        for horizon, avail, car in ((5, datetime(2025, 3, 11, 16, tzinfo=UTC), 0.012), (20, CAR20_AT, 0.031)):
            await cur.execute(
                "INSERT INTO core.event_returns (event_id, horizon, model, t0, t_end, raw_ret, bench_ret, car,"
                " available_at) VALUES (%s, %s, 'market_adj', '2025-03-04', '2025-04-01', %s, 0.01, %s, %s)",
                (row["event_id"], horizon, car + 0.01, car, avail),
            )
    return int(row["event_id"])


async def test_event_memory_is_point_in_time(pg: DictConn) -> None:
    await pg.execute("DELETE FROM rag.rag_chunks")
    event_id = await _event(pg)
    docs = [d for d in await load_event_docs(pg) if d.event_id == event_id]
    assert [d.doc_ref for d in docs] == [f"ev:{event_id}:h5", f"ev:{event_id}:h20"]
    assert docs[1].available_at == CAR20_AT and "%+3,10" in docs[1].chunks[0]
    stats = await index_base(pg, fake(), docs)
    assert (stats.embedded, stats.unchanged) == (2, 0)
    again = await index_base(pg, fake(), docs)
    assert (again.embedded, again.unchanged) == (0, 2)
    async with pg.cursor() as cur:
        await cur.execute(
            "SELECT doc_ref FROM rag.rag_chunks WHERE base_type = 'event_memory' AND available_at <= %s",
            (datetime(2025, 3, 20, tzinfo=UTC),),
        )
        visible = [r["doc_ref"] for r in await cur.fetchall()]
    assert visible == [f"ev:{event_id}:h5"]  # the 20-day return is not known yet on 20 March


async def test_regulation_loader_and_validity(pg: DictConn, tmp_path: Path) -> None:
    await pg.execute("DELETE FROM rag.rag_chunks")
    shipped = load_regulation_docs()
    assert {d.doc_ref for d in shipped} == {"spk:II-15.1", "spk:II-22.1"}  # the official texts, no sample
    assert not any(d.metadata["sample"] for d in shipped)
    assert (REGULATION_DIR / "README.md").exists()
    old = tmp_path / "old.md"
    old.write_text(
        "---\ndoc_ref: test:repealed\ntitle: Eski tebliğ\nvalid_from: 2010-01-01\nvalid_to: 2014-01-03\n---\n\n"
        "Kendi paylarını geri alan ortaklık eski usule göre bildirim yapar.\n",
        encoding="utf-8",
    )
    repealed = regulation_doc(old)
    assert repealed.valid_to is not None
    await index_base(pg, fake(), [*shipped, repealed])
    now = datetime(2027, 1, 11, tzinfo=UTC)
    found = await regulation_passages(pg, fake(), as_of=now, text="pay geri alım bildirimi KAP", k=5)
    assert found and all(p["ref_id"].startswith("spk:II-") for p in found)
    assert found[0]["sample"] is False
    in_2012 = await regulation_passages(pg, fake(), as_of=datetime(2012, 1, 1, tzinfo=UTC), text="geri alım", k=5)
    assert [p["ref_id"] for p in in_2012] == ["test:repealed#0"]
    with pytest.raises(ValueError, match="front matter"):
        bad = tmp_path / "bad.md"
        bad.write_text("no front matter\n\ntext", encoding="utf-8")
        regulation_doc(bad)


async def test_compliance_sees_regulation_in_live_mode_only(pg: DictConn, migrated: Settings) -> None:
    await pg.execute("DELETE FROM rag.rag_chunks")
    await index_base(pg, fake(), load_regulation_docs())
    ctx = _ctx(datetime(2027, 1, 11, tzinfo=UTC), "Şirketimiz pay geri alım programı kapsamında işlem yaptı.")
    live = await attach_similar(pg, ctx, settings=migrated, embedder=fake())
    assert live.regulation and live.regulation[0]["ref_id"].startswith("spk:II-")
    state: dict[str, object] = {}
    assert task_context("compliance", state, live)["regulation"] == list(live.regulation)
    assert "regulation" not in task_context("skeptic", state, live)
    replay = replace(ctx, provider=type("P", (), {"name": "replay"})())
    untouched = await attach_similar(pg, replay, settings=migrated, embedder=fake())
    assert untouched.regulation == ()
    assert "regulation" not in task_context("compliance", state, untouched)
