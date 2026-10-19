"""`similar_disclosures()`: hybrid search over the disclosure archive (07 §12), point in time.

Three legs over `rag.rag_chunks`, fused per *disclosure* with Reciprocal Rank Fusion (k = 60):
- **dense**: cosine distance on the embedding (HNSW, pgvector iterative scan for filtered queries);
- **fts**: Postgres `turkish` full text on `content_norm` (OR of the query's distinct terms, ranked by
  `ts_rank_cd`; a whole disclosure as the query would never match an AND query);
- **trgm**: `pg_trgm` word similarity, only for short queries (≤ `trigram_max_words`: names, codes).

**No look-ahead (FR-13, 04 Q4):** every leg applies the same `PIT_FILTER`: `published_at < as_of`
*and* `available_at <= as_of` (and `valid_to` for regulation chunks); `as_of` is required and the
final join re-checks `core.disclosures.published_at < as_of`. Only vectors of the running embedder
(model) are compared. The query disclosure itself is excluded.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final

from kaptan.rag.chunking import query_text
from kaptan.rag.config import HybridSpec, default_rag_config
from kaptan.rag.embed import Embedder
from kaptan.rag.store import BASE_DISCLOSURES, Conn, vector_literal
from kaptan.rag.types import SimilarDisclosure
from kaptan.text import norm_key

MAX_K: Final = 20
ALL_LEGS: Final = frozenset({"dense", "fts", "trgm"})
MAX_TERMS: Final = 32
SNIPPET_CHARS: Final = 280
TRIGRAM_THRESHOLD: Final = "0.4"
_TERM: Final = re.compile(r"[^\W_]{3,}")
_STOP_TEXT: Final = (
    "ile bir için olan olarak ilgili hakkında üzere gibi kadar daha veya ise ait göre olup olması "
    "tarafından şirketimiz şirketimizin şirket bildirim açıklama kap the and"
)
_STOP: Final = frozenset(_STOP_TEXT.split())

#: The one point-in-time filter every leg uses (alias c = rag.rag_chunks).
PIT_FILTER: Final = """
      c.base_type = %(base)s AND c.embed_model = %(model)s
  AND c.published_at < %(as_of)s AND c.available_at <= %(as_of)s
  AND (c.valid_to IS NULL OR c.valid_to > %(as_of)s)
  AND (%(ticker)s::text IS NULL OR c.ticker = %(ticker)s)
  AND (%(event)s::text IS NULL OR c.event_code = %(event)s)
  AND (%(exclude)s::bigint IS NULL OR c.disclosure_index <> %(exclude)s)
"""

#: Built once from constants (PIT_FILTER); every value is a bound parameter.
HYBRID_SQL: Final = f"""
WITH
dense AS (
  SELECT id, row_number() OVER (ORDER BY dist, didx DESC, cno) AS rnk FROM (
    SELECT c.id, c.embedding <=> %(qvec)s::vector AS dist, c.disclosure_index AS didx, c.chunk_no AS cno
      FROM rag.rag_chunks c
     WHERE %(qvec)s::text IS NOT NULL AND {PIT_FILTER}
     ORDER BY c.embedding <=> %(qvec)s::vector
     LIMIT %(leg)s) x
),
fts AS (
  SELECT id, row_number() OVER (ORDER BY rank DESC, didx DESC, cno) AS rnk FROM (
    SELECT c.id, ts_rank_cd(c.tsv, q) AS rank, c.disclosure_index AS didx, c.chunk_no AS cno
      FROM rag.rag_chunks c, to_tsquery('turkish', %(terms)s) AS q
     WHERE %(terms)s::text IS NOT NULL AND c.tsv @@ q AND {PIT_FILTER}
     ORDER BY rank DESC, c.disclosure_index DESC, c.chunk_no
     LIMIT %(leg)s) x
),
trgm AS (
  SELECT id, row_number() OVER (ORDER BY sim DESC, didx DESC, cno) AS rnk FROM (
    SELECT c.id, word_similarity(%(qnorm)s, c.content_norm) AS sim, c.disclosure_index AS didx, c.chunk_no AS cno
      FROM rag.rag_chunks c
     WHERE %(qnorm)s::text IS NOT NULL AND %(qnorm)s <%% c.content_norm AND {PIT_FILTER}
     ORDER BY sim DESC, c.disclosure_index DESC, c.chunk_no
     LIMIT %(leg)s) x
),
legs AS (
  SELECT id, rnk, 'dense' AS src FROM dense
  UNION ALL SELECT id, rnk, 'fts' FROM fts
  UNION ALL SELECT id, rnk, 'trgm' FROM trgm
),
hits AS (
  SELECT l.src, l.rnk, c.disclosure_index, c.chunk_no, c.content, c.event_code
    FROM legs l JOIN rag.rag_chunks c USING (id)
),
per_doc AS (
  SELECT disclosure_index, src, row_number() OVER (PARTITION BY src ORDER BY min(rnk), disclosure_index) AS drnk
    FROM hits GROUP BY disclosure_index, src
),
fused AS (
  SELECT disclosure_index, sum(1.0 / (%(rrf_k)s + drnk)) AS rrf, array_agg(src ORDER BY src) AS legs
    FROM per_doc GROUP BY disclosure_index
),
best AS (
  SELECT DISTINCT ON (disclosure_index) disclosure_index, chunk_no, content, event_code
    FROM hits ORDER BY disclosure_index, rnk, chunk_no
)
SELECT f.disclosure_index, f.rrf, f.legs, b.chunk_no, b.content, b.event_code,
       d.primary_ticker AS ticker, d.subject, d.published_at
  FROM fused f
  JOIN best b USING (disclosure_index)
  JOIN core.disclosures d USING (disclosure_index)
 WHERE d.published_at < %(as_of)s
 ORDER BY f.rrf DESC, d.published_at DESC, f.disclosure_index DESC
 LIMIT %(k)s
"""  # noqa: S608

QUERY_DOC_SQL: Final = """
SELECT d.subject, d.summary, coalesce(t.body, '') AS body
  FROM core.disclosures d
  LEFT JOIN core.disclosure_texts t ON t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
 WHERE d.disclosure_index = %s
"""


def fts_terms(text: str, limit: int = MAX_TERMS) -> str | None:
    """`a | b | c` of the query's most frequent distinct terms (letters/digits only: safe for to_tsquery)."""
    words = [w for w in _TERM.findall(norm_key(text)) if w not in _STOP and not w.isdigit()]
    if not words:
        return None
    ranked = sorted(Counter(words).items(), key=lambda kv: (-kv[1], words.index(kv[0])))
    return " | ".join(w for w, _ in ranked[:limit])


def snippet(content: str, limit: int = SNIPPET_CHARS) -> str:
    body = content.split("\n", 1)[1] if "\n" in content else content
    flat = " ".join(body.split())
    return flat if len(flat) <= limit else flat[: flat.rfind(" ", 0, limit)] + " …"


async def query_doc_text(conn: Conn, disclosure_index: int, max_chars: int) -> str:
    async with conn.cursor() as cur:
        await cur.execute(QUERY_DOC_SQL, (disclosure_index,))
        row = await cur.fetchone()
    if row is None:
        raise LookupError(f"unknown disclosure {disclosure_index}")
    return query_text(str(row["subject"]), str(row["summary"] or ""), str(row["body"]), max_chars)


def _params(
    *,
    text: str,
    qvec: Sequence[float] | None,
    model: str,
    as_of: datetime,
    k: int,
    ticker: str | None,
    event_type: str | None,
    exclude: int | None,
    spec: HybridSpec,
    legs: frozenset[str] = ALL_LEGS,
) -> dict[str, Any]:
    short = len(text.split()) <= spec.trigram_max_words and "trgm" in legs
    return {
        "base": BASE_DISCLOSURES,
        "model": model,
        "as_of": as_of,
        "ticker": ticker,
        "event": event_type,
        "exclude": exclude,
        "qvec": None if qvec is None or "dense" not in legs else vector_literal(qvec),
        "terms": fts_terms(text) if "fts" in legs else None,
        "qnorm": norm_key(text) if short and norm_key(text) else None,
        "leg": spec.leg_limit,
        "rrf_k": spec.rrf_k,
        "k": k,
    }


async def similar_disclosures(
    conn: Conn,
    embedder: Embedder | None,
    *,
    as_of: datetime,
    text: str | None = None,
    disclosure_index: int | None = None,
    k: int = 5,
    ticker: str | None = None,
    event_type: str | None = None,
    query_vector: Sequence[float] | None = None,
    model: str | None = None,
    exclude_index: int | None = None,
    legs: frozenset[str] = ALL_LEGS,
) -> list[SimilarDisclosure]:
    """Earlier disclosures like `text` (or like disclosure `disclosure_index`, which is excluded).

    `as_of` is the decision time (tz-aware); nothing published at or after it can come back.
    `embedder=None` with no `query_vector` = lexical legs only (`model` still selects the chunks);
    `exclude_index` drops one disclosure from a text query (the run's own disclosure); `legs` picks a
    subset of dense / fts / trgm (ablations in the eval)."""
    if not legs or not legs <= ALL_LEGS:
        raise ValueError(f"legs must be a non-empty subset of {sorted(ALL_LEGS)}")
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware")
    if not 1 <= k <= MAX_K:
        raise ValueError(f"k must be 1..{MAX_K}")
    if (text is None) == (disclosure_index is None):
        raise ValueError("give exactly one of text / disclosure_index")
    cfg = default_rag_config()
    query = (
        text
        if text is not None
        else await query_doc_text(conn, int(disclosure_index or 0), cfg.chunking.query_max_chars)
    )
    query = query[: cfg.chunking.query_max_chars]
    model_name = model or (embedder.model if embedder is not None else None)
    if model_name is None:
        raise ValueError("an embedder or a model name is needed")
    qvec = query_vector
    if qvec is None and embedder is not None and "dense" in legs:
        qvec = (await embedder.embed_queries([query]))[0]
    params = _params(
        text=query,
        qvec=qvec,
        model=model_name,
        as_of=as_of,
        k=k,
        ticker=ticker,
        event_type=event_type,
        exclude=disclosure_index if disclosure_index is not None else exclude_index,
        spec=cfg.hybrid,
        legs=legs,
    )
    async with conn.transaction(), conn.cursor() as cur:
        await cur.execute(
            "SELECT set_config('hnsw.ef_search', %s, true), set_config('hnsw.iterative_scan', 'relaxed_order', true),"
            " set_config('pg_trgm.word_similarity_threshold', %s, true)",
            (str(cfg.hybrid.ef_search), TRIGRAM_THRESHOLD),
        )
        await cur.execute(HYBRID_SQL, params)
        rows = await cur.fetchall()
    return [
        SimilarDisclosure(
            disclosure_index=int(r["disclosure_index"]),
            chunk_no=int(r["chunk_no"]),
            ticker=r["ticker"],
            event_type=r["event_code"],
            subject=str(r["subject"]),
            published_at=r["published_at"],
            score=float(r["rrf"]),
            legs=tuple(r["legs"]),
            snippet=snippet(str(r["content"])),
        )
        for r in rows
    ]
