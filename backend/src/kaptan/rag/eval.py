"""Offline retrieval eval on the committed KAP fixtures (tests/fixtures/kap_json + detail_text).

Corpus: the 11 recorded disclosure texts (buybacks, insider trades, new business, tenders, a financial
report, an ÖDA) and, as distractors, every other row of the two recorded `list/main` days as a header +
summary chunk (~470). Queries: 9 disclosure→disclosure pairs and 4 short Turkish text queries, labelled
by hand (same event, other company). Metrics: recall@k and MRR per leg set (hybrid, dense, fts).

    uv run python scripts/rag_eval.py                       # fake embedder, test database
    uv run python scripts/rag_eval.py --embedder gemini --no-distractors   # ~2 embedding calls

`as_of` is after the recorded days; the per-query look-ahead guard is tested separately.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.normalize import normalize_rows
from kaptan.rag.config import default_rag_config
from kaptan.rag.embed import Embedder
from kaptan.rag.hybrid import ALL_LEGS, query_doc_text, similar_disclosures
from kaptan.rag.index import IndexStats, index_disclosures
from kaptan.rag.store import Conn
from kaptan.settings import BACKEND_DIR
from kaptan.text import norm_key

FIXTURES: Final = BACKEND_DIR / "tests" / "fixtures"
LIST_DAYS: Final = ("2026-10-15", "2026-10-16")
EVAL_AS_OF: Final = datetime(2026, 10, 18, tzinfo=UTC)
KS: Final = (1, 3, 5)
MODES: Final[dict[str, frozenset[str]]] = {
    "hybrid": ALL_LEGS,
    "dense": frozenset({"dense"}),
    "fts": frozenset({"fts"}),
}


@dataclass(frozen=True, slots=True)
class EvalQuery:
    name: str
    relevant: frozenset[int]
    disclosure_index: int | None = None
    text: str | None = None


#: Hand-labelled: same KAP event type, another filer.
QUERIES: Final = (
    EvalQuery("buyback CVK→AZTEK", frozenset({1683372}), disclosure_index=1683376),
    EvalQuery("buyback AZTEK→CVK", frozenset({1683376}), disclosure_index=1683372),
    EvalQuery("insider BAHKM", frozenset({1682800, 1683334}), disclosure_index=1683269),
    EvalQuery("insider AHSGY", frozenset({1682800, 1683269}), disclosure_index=1683334),
    EvalQuery("insider BİG MEDYA", frozenset({1683269, 1683334}), disclosure_index=1682800),
    EvalQuery("new business ÇAĞDAŞ CAM", frozenset({1682657}), disclosure_index=1682993),
    EvalQuery("new business ETİLER", frozenset({1682993}), disclosure_index=1682657),
    EvalQuery("tender TÜMOSAN", frozenset({1682623}), disclosure_index=1683277),
    EvalQuery("tender GİRİŞİM", frozenset({1683277}), disclosure_index=1682623),
    EvalQuery("text: pay geri alım", frozenset({1683372, 1683376}), text="pay geri alım işlemleri"),
    EvalQuery("text: ihale sonucu", frozenset({1682623, 1683277}), text="ihale sonucu hakkında"),
    EvalQuery("text: yeni sipariş", frozenset({1682993, 1682657}), text="yeni iş ilişkisi sipariş sözleşme"),
    EvalQuery(
        "text: içeriden pay alım", frozenset({1682800, 1683269, 1683334}), text="yönetim kurulu üyesi pay alım satım"
    ),
)


def text_indexes(fixtures: Path = FIXTURES) -> list[int]:
    return sorted(int(p.stem) for p in (fixtures / "detail_text").glob("*.txt"))


def _json(path: Path) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    return data


async def load_fixture_corpus(conn: Conn, fixtures: Path = FIXTURES) -> list[int]:
    """Store the recorded days (origin 'kap', invisible backfill rows) and the 11 texts; returns all indexes."""
    kap = fixtures / "kap_json"
    await repo.upsert_companies(conn, _json(kap / "company_items_IGS_A.json"), date(2026, 10, 16))
    companies = await repo.load_company_index(conn)
    rows = [r for day in LIST_DAYS for r in _json(kap / f"list_main_{day}.json")]
    docs, _errors = normalize_rows(rows, source="backfill", seen_at=None)
    for d in docs:
        await repo.upsert_disclosure(conn, d, companies, visible=False)
    for idx in text_indexes(fixtures):
        body = (fixtures / "detail_text" / f"{idx}.txt").read_text(encoding="utf-8")
        await conn.execute(
            """
            INSERT INTO core.disclosure_texts (disclosure_index, lang, body, body_norm, source, extractor_version)
            VALUES (%s, 'tr', %s, %s, 'manual', 'fixture')
            ON CONFLICT (disclosure_index, lang) DO UPDATE SET body = EXCLUDED.body, body_norm = EXCLUDED.body_norm
            """,
            (idx, body, norm_key(body)),
        )
    await conn.commit()
    return [d.disclosure_index for d in docs]


async def index_fixture_corpus(
    conn: Conn, embedder: Embedder, indexes: Sequence[int], *, distractors: bool = True
) -> IndexStats:
    chosen = list(indexes) if distractors else text_indexes()
    return await index_disclosures(conn, embedder, indexes=chosen, origin="kap", summaries=distractors)


def _recall(found: Sequence[int], relevant: frozenset[int], k: int) -> float:
    return len(set(found[:k]) & relevant) / len(relevant)


def _rr(found: Sequence[int], relevant: frozenset[int]) -> float:
    return next((1.0 / (i + 1) for i, idx in enumerate(found) if idx in relevant), 0.0)


async def _subjects(conn: Conn, indexes: frozenset[int]) -> frozenset[str]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT subject FROM core.disclosures WHERE disclosure_index = ANY(%s)", (list(indexes),))
        return frozenset(str(r["subject"]) for r in await cur.fetchall())


async def _score_mode(
    conn: Conn,
    embedder: Embedder,
    legs: frozenset[str],
    rows: Sequence[tuple[EvalQuery, str, list[float]]],
    subjects: Sequence[frozenset[str]],
    as_of: datetime,
) -> dict[str, Any]:
    recalls = dict.fromkeys(KS, 0.0)
    same_event = dict.fromkeys(KS, 0.0)
    rr = 0.0
    misses: list[str] = []
    for (q, text, vector), subj in zip(rows, subjects, strict=True):
        hits = await similar_disclosures(
            conn,
            embedder,
            as_of=as_of,
            text=text,
            k=max(KS),
            query_vector=vector,
            exclude_index=q.disclosure_index,
            legs=legs,
        )
        found = [h.disclosure_index for h in hits]
        for k in KS:
            recalls[k] += _recall(found, q.relevant, k)
            same_event[k] += sum(1 for h in hits[:k] if h.subject in subj or h.disclosure_index in q.relevant) / k
        rr += _rr(found, q.relevant)
        if not set(found[:3]) & q.relevant:
            misses.append(q.name)
    n = len(rows)
    return {
        **{f"recall@{k}": round(recalls[k] / n, 3) for k in KS},
        "mrr": round(rr / n, 3),
        **{f"same_event_precision@{k}": round(same_event[k] / n, 3) for k in KS},
        "misses@3": misses,
    }


async def run_eval(
    conn: Conn,
    embedder: Embedder,
    *,
    queries: Sequence[EvalQuery] = QUERIES,
    as_of: datetime = EVAL_AS_OF,
    modes: dict[str, frozenset[str]] = MODES,
) -> dict[str, Any]:
    """Per leg set: recall@{1,3,5} and MRR on the hand-labelled pairs, and same-event precision@k (a hit
    shares the KAP subject of a labelled disclosure: the unlabelled distractors of the same event count).
    Query vectors are embedded once, in one batch."""
    max_chars = default_rag_config().chunking.query_max_chars
    texts = [
        q.text if q.text is not None else await query_doc_text(conn, int(q.disclosure_index or 0), max_chars)
        for q in queries
    ]
    vectors = await embedder.embed_queries(texts)
    subjects = [await _subjects(conn, q.relevant) for q in queries]
    rows = list(zip(queries, texts, vectors, strict=True))
    report: dict[str, Any] = {"model": embedder.model, "queries": len(queries), "modes": {}}
    for mode, legs in modes.items():
        report["modes"][mode] = await _score_mode(conn, embedder, legs, rows, subjects, as_of)
    return report


async def clean_fixture_corpus(conn: Conn, indexes: Sequence[int]) -> None:
    """Remove what `load_fixture_corpus` + indexing wrote (test databases only)."""
    refs = [f"kap:{i}" for i in indexes]
    await conn.execute("DELETE FROM rag.rag_chunks WHERE doc_ref = ANY(%s)", (refs,))
    await conn.execute(
        "DELETE FROM core.disclosure_texts WHERE disclosure_index = ANY(%s) AND extractor_version = 'fixture'"
        " AND disclosure_index IN (SELECT disclosure_index FROM core.disclosures WHERE origin = 'kap')",
        (list(indexes),),
    )
    await conn.execute(
        "DELETE FROM core.disclosures WHERE disclosure_index = ANY(%s) AND origin = 'kap'", (list(indexes),)
    )
    await conn.commit()


def as_json(report: dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2, default=str)


__all__ = [
    "QUERIES",
    "EvalQuery",
    "as_json",
    "clean_fixture_corpus",
    "index_fixture_corpus",
    "load_fixture_corpus",
    "run_eval",
    "text_indexes",
]
