"""kaptan.rag pure helpers: query terms, citations, TASK_CONTEXT wiring, store params, CLI parsing."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from kaptan.llm.task_context import task_context
from kaptan.rag.agent_context import attach_similar, is_live
from kaptan.rag.config import default_rag_config
from kaptan.rag.hybrid import fts_terms, similar_disclosures, snippet
from kaptan.rag.index import IndexStats, chunks_of, index_new_disclosures, parse_args
from kaptan.rag.store import SourceDoc, chunk_params, event_type_of, vector_literal
from kaptan.rag.types import SimilarDisclosure
from kaptan.settings import get_settings

HIT = SimilarDisclosure(
    disclosure_index=1683372,
    chunk_no=0,
    ticker="AZTEK",
    event_type="E1",
    subject="Payların Geri Alınmasına İlişkin Bildirim — çok uzun bir konu başlığı olabilir, kırpılır mı bakalım",
    published_at=datetime(2026, 10, 16, 18, 53, 13, tzinfo=UTC),
    score=0.0327868852,
    legs=("dense", "fts"),
    snippet="…",
)


def test_fts_terms_are_safe_ranked_and_bounded() -> None:
    terms = fts_terms("Pay geri alım: PAY'ların geri alınması; 2026 & 'DROP TABLE' ve için")
    assert terms is not None
    parts = terms.split(" | ")
    assert parts[:2] == ["pay", "geri"]  # most frequent first
    assert all(p.isalnum() for p in parts) and "2026" not in parts and "için" not in parts
    assert fts_terms("ve ile 12") is None
    assert len(fts_terms(" ".join(f"kelime{i}" for i in range(100)), limit=5).split(" | ")) == 5  # type: ignore[union-attr]


def test_snippet_drops_the_header_and_shortens() -> None:
    content = "[X | 2026-10-16 | S | ODA | kap:1]\n" + "kelime " * 100
    out = snippet(content, limit=40)
    assert out.startswith("kelime") and out.endswith("…") and len(out) <= 42
    assert snippet("tek satır") == "tek satır"


def test_citation_and_context_row_carry_index_and_date_only() -> None:
    assert HIT.ref_id == "doc:1683372:0"
    assert HIT.citation() == "kap:1683372 (2026-10-16)"
    row = HIT.as_context()
    assert row["published_date"] == "2026-10-16" and row["citation"] == "kap:1683372 (2026-10-16)"
    assert len(row["kap_subject"]) <= 64 and "snippet" not in row
    assert row["score"] == 0.032787


def _ctx(similar: tuple[SimilarDisclosure, ...] = (), provider: str = "replay") -> Any:
    from kaptan.agents.context import DeskState, DisclosureInput, RunContext
    from kaptan.agents.tools import ReplayToolbox

    d = DisclosureInput(
        run_id="run-x",
        disclosure_index=99,
        ticker="AZTEK",
        company_name="AZTEK",
        subject="Payların Geri Alınmasına İlişkin Bildirim",
        summary="Pay geri alım",
        text_tr="Pay geri alım işlemleri yapılmıştır.",
        published_at=datetime(2026, 10, 17, 7, 0, tzinfo=UTC),
        available_at=datetime(2026, 10, 17, 7, 0, 21, tzinfo=UTC),
        strategy_version="v1.1-fwd",
        is_fixture=False,
    )
    desk = DeskState(True, 1, 1, 0.5, 1)  # type: ignore[arg-type]
    return RunContext(SimpleNamespace(name=provider), ReplayToolbox(), d, desk, similar=similar)  # type: ignore[arg-type]


def test_task_context_shows_similar_disclosures_to_the_analysts_only_when_present() -> None:
    state: dict[str, Any] = {"event_type": "E1", "route": {}}
    plain = _ctx()
    assert "similar_disclosures" not in task_context("evidence", state, plain)  # replay: unchanged
    with_hits = _ctx((HIT,))
    for agent in ("reader", "materiality", "evidence", "skeptic"):
        assert task_context(agent, state, with_hits)["similar_disclosures"] == [HIT.as_context()]
    assert "similar_disclosures" not in task_context("compliance", state, with_hits)
    assert "similar_disclosures" not in task_context(
        "evidence", state, SimpleNamespace(**{k: getattr(plain, k) for k in ("disclosure", "desk", "tools")})
    )


async def test_attach_similar_is_a_no_op_outside_live_mode() -> None:
    ctx = _ctx()
    assert not is_live(ctx)
    assert await attach_similar(None, ctx) is ctx  # type: ignore[arg-type]
    live = _ctx(provider="live")
    assert is_live(live)
    off = get_settings().model_copy(update={"rag_context_k": 0})
    assert await attach_similar(None, live, settings=off) is live  # type: ignore[arg-type]


async def test_attach_similar_never_fails_the_run() -> None:
    live = _ctx(provider="live")

    class Broken:
        model = version = "x"
        dim = 1024

        async def embed_queries(self, texts: Any) -> Any:
            raise RuntimeError("down")

    assert await attach_similar(None, live, embedder=Broken()) is live  # type: ignore[arg-type]
    assert replace(live, similar=(HIT,)).similar_context() == [HIT.as_context()]


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"as_of": datetime(2026, 1, 1), "text": "x"}, "timezone"),
        ({"as_of": datetime(2026, 1, 1, tzinfo=UTC), "text": "x", "k": 0}, "k must"),
        ({"as_of": datetime(2026, 1, 1, tzinfo=UTC)}, "exactly one"),
        ({"as_of": datetime(2026, 1, 1, tzinfo=UTC), "text": "x", "disclosure_index": 1}, "exactly one"),
        ({"as_of": datetime(2026, 1, 1, tzinfo=UTC), "text": "x", "legs": frozenset({"bm25"})}, "legs"),
        ({"as_of": datetime(2026, 1, 1, tzinfo=UTC), "text": "x"}, "embedder or a model"),
    ],
)
async def test_similar_disclosures_validates_before_touching_the_database(kwargs: Any, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        await similar_disclosures(None, None, **kwargs)  # type: ignore[arg-type]


def _doc(body: str | None, klass: str = "ODA") -> SourceDoc:
    t = datetime(2026, 10, 16, 18, 0, tzinfo=UTC)
    return SourceDoc(7, "AZTEK", "Konu", "Özet", klass, "E1", t, t, "tr", body, {"subject": "Konu"})


def test_source_doc_kinds_params_and_summary_chunks() -> None:
    assert _doc(None).doc_kind == "summary" and _doc("x", "FR").doc_kind == "fin_report"
    assert _doc("x").doc_ref == "kap:7" and _doc("x").doc_kind == "disclosure"
    p = chunk_params(_doc("x"), 0, "[h]\nİçerik", 3, [0.5, -0.25], model="m", version="v")
    assert p["embedding"] == "[0.5,-0.25]" and p["content_norm"] == "h içerik" and len(p["content_sha256"]) == 32
    assert chunk_params(_doc("x"), 0, "c", 1, None, model="m", version="v")["embedding"] is None
    only = chunks_of(_doc(None), default_rag_config().chunking)
    assert len(only) == 1 and only[0].content.endswith("Konu. Özet")
    assert vector_literal([1e-9, 1.0]) == "[1e-09,1]"
    assert event_type_of("E3", None) == "E3" and event_type_of("llm", "E2") == "E2"
    assert event_type_of("noise", "X") is None


def test_cli_arguments() -> None:
    args = parse_args(["--since", "2026-10-15", "--langs", "tr,en", "--summaries", "--embedder", "fake"])
    assert args.since.isoformat() == "2026-10-15T00:00:00+03:00" and args.langs == ("tr", "en")
    assert args.summaries and args.embedder == "fake" and args.until is None
    with pytest.raises(SystemExit):
        parse_args(["--since", "2026-10-15", "--langs", "de"])


async def test_ingest_hook_is_off_by_default_and_never_raises() -> None:
    assert (await index_new_disclosures(None, [1])).disclosures == 0  # type: ignore[arg-type]
    on = get_settings().model_copy(update={"rag_index_on_ingest": True})
    assert (await index_new_disclosures(None, [], settings=on)).errors == []  # type: ignore[arg-type]
    broken = await index_new_disclosures(None, [1], settings=on, embedder=object())  # type: ignore[arg-type]
    assert broken.stopped and broken.errors == ["AttributeError"]
    assert not IndexStats().stopped
