"""SQL of the disclosure archive in `rag.rag_chunks` (migration 0012). Parametrised SQL only.

Idempotent: a chunk whose content hash and embedder (model + version) are unchanged is never embedded
again (07 §5 "aynı içerik tekrar embed edilmez"); chunks past the new chunk count are deleted.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.text import norm_key

Conn = AsyncConnection[dict[str, Any]]

BASE_DISCLOSURES: Final = "disclosure_archive"
EVENT_TYPES: Final = frozenset({"E1", "E2", "E3", "E4"})

DOCS_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.subject, d.summary, d.disclosure_class,
       d.disclosure_type, d.reason, d.subject_route, d.classification ->> 'event_type' AS cls_event,
       d.published_at, d.available_at, d.has_multilang, d.origin, t.lang, t.body
  FROM core.disclosures d
  LEFT JOIN core.disclosure_texts t
    ON t.disclosure_index = d.disclosure_index AND t.lang = ANY(%(langs)s)
 WHERE NOT d.is_noise
   AND (%(since)s::timestamptz IS NULL OR d.published_at >= %(since)s)
   AND (%(until)s::timestamptz IS NULL OR d.published_at < %(until)s)
   AND (%(origin)s::text = 'all' OR d.origin = %(origin)s)
   AND (%(indexes)s::bigint[] IS NULL OR d.disclosure_index = ANY(%(indexes)s))
   AND (t.body IS NOT NULL OR %(summaries)s)
 ORDER BY d.published_at, d.disclosure_index, t.lang
 LIMIT %(limit)s
"""

EXISTING_SQL: Final = """
SELECT doc_ref, lang, chunk_no, content_sha256, embed_version
  FROM rag.rag_chunks
 WHERE doc_ref = ANY(%(refs)s) AND embed_model = %(model)s
"""

UPSERT_SQL: Final = """
INSERT INTO rag.rag_chunks
  (base_type, doc_kind, doc_ref, chunk_no, lang, ticker, event_code, disclosure_index, published_at,
   available_at, content, content_norm, content_sha256, token_count, embedding, embed_model, embed_version,
   metadata)
VALUES
  (%(base_type)s, %(doc_kind)s, %(doc_ref)s, %(chunk_no)s, %(lang)s, %(ticker)s, %(event_code)s,
   %(disclosure_index)s, %(published_at)s, %(available_at)s, %(content)s, %(content_norm)s,
   %(content_sha256)s, %(token_count)s, %(embedding)s::vector, %(embed_model)s, %(embed_version)s, %(metadata)s)
ON CONFLICT (doc_ref, chunk_no, lang, embed_model) DO UPDATE SET
  doc_kind = EXCLUDED.doc_kind, ticker = EXCLUDED.ticker, event_code = EXCLUDED.event_code,
  published_at = EXCLUDED.published_at, available_at = EXCLUDED.available_at, content = EXCLUDED.content,
  content_norm = EXCLUDED.content_norm, content_sha256 = EXCLUDED.content_sha256,
  token_count = EXCLUDED.token_count, embedding = EXCLUDED.embedding, embed_version = EXCLUDED.embed_version,
  metadata = EXCLUDED.metadata
"""

TOUCH_SQL: Final = """
UPDATE rag.rag_chunks SET ticker = %(ticker)s, event_code = %(event_code)s, published_at = %(published_at)s,
       available_at = %(available_at)s, metadata = %(metadata)s
 WHERE doc_ref = %(doc_ref)s AND chunk_no = %(chunk_no)s AND lang = %(lang)s AND embed_model = %(embed_model)s
"""

DELETE_STALE_SQL: Final = """
DELETE FROM rag.rag_chunks
 WHERE doc_ref = %s AND lang = %s AND embed_model = %s AND chunk_no >= %s
"""


@dataclass(frozen=True, slots=True)
class SourceDoc:
    """One disclosure text (or its KAP summary when no text was fetched) to be chunked."""

    disclosure_index: int
    ticker: str | None
    subject: str
    summary: str
    disclosure_class: str
    event_type: str | None
    published_at: datetime
    available_at: datetime
    lang: str
    body: str | None
    metadata: dict[str, Any]

    @property
    def doc_ref(self) -> str:
        return f"kap:{self.disclosure_index}"

    @property
    def doc_kind(self) -> str:
        if self.body is None:
            return "summary"
        return "fin_report" if self.disclosure_class == "FR" else "disclosure"


def event_type_of(route: str | None, classified: str | None) -> str | None:
    if route in EVENT_TYPES:
        return route
    return classified if classified in EVENT_TYPES else None


def _doc(row: dict[str, Any]) -> SourceDoc:
    return SourceDoc(
        disclosure_index=int(row["disclosure_index"]),
        ticker=row["ticker"],
        subject=str(row["subject"]),
        summary=str(row["summary"] or ""),
        disclosure_class=str(row["disclosure_class"]),
        event_type=event_type_of(row["subject_route"], row["cls_event"]),
        published_at=row["published_at"],
        available_at=row["available_at"],
        lang=str(row["lang"] or "tr"),
        body=row["body"],
        metadata={
            "subject": row["subject"],
            "disclosure_class": row["disclosure_class"],
            "disclosure_type": row["disclosure_type"],
            "reason": row["reason"],
            "has_multilang": bool(row["has_multilang"]),
            "origin": row["origin"],
        },
    )


async def source_docs(
    conn: Conn,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    indexes: Sequence[int] | None = None,
    origin: str = "kap",
    langs: Sequence[str] = ("tr",),
    summaries: bool = False,
    limit: int = 100_000,
) -> list[SourceDoc]:
    params = {
        "since": since,
        "until": until,
        "indexes": None if indexes is None else list(indexes),
        "origin": origin,
        "langs": list(langs),
        "summaries": summaries,
        "limit": limit,
    }
    async with conn.cursor() as cur:
        await cur.execute(DOCS_SQL, params)
        rows = await cur.fetchall()
    return [_doc(r) for r in rows]


async def existing_chunks(conn: Conn, refs: Sequence[str], model: str) -> dict[tuple[str, str, int], tuple[bytes, str]]:
    """(doc_ref, lang, chunk_no) → (content sha256, embed_version) of what is stored for this model."""
    async with conn.cursor() as cur:
        await cur.execute(EXISTING_SQL, {"refs": list(refs), "model": model})
        rows = await cur.fetchall()
    return {
        (r["doc_ref"], r["lang"], int(r["chunk_no"])): (bytes(r["content_sha256"]), r["embed_version"]) for r in rows
    }


def content_sha256(content: str) -> bytes:
    return hashlib.sha256(content.encode("utf-8")).digest()


def vector_literal(values: Sequence[float]) -> str:
    """pgvector's text input ('[0.1,0.2,…]'), bound as a parameter and cast with ::vector."""
    return "[" + ",".join(f"{v:.7g}" for v in values) + "]"


def chunk_params(
    doc: SourceDoc,
    chunk_no: int,
    content: str,
    token_count: int,
    embedding: Sequence[float] | None,
    *,
    model: str,
    version: str,
) -> dict[str, Any]:
    return {
        "base_type": BASE_DISCLOSURES,
        "doc_kind": doc.doc_kind,
        "doc_ref": doc.doc_ref,
        "chunk_no": chunk_no,
        "lang": doc.lang,
        "ticker": doc.ticker,
        "event_code": doc.event_type,
        "disclosure_index": doc.disclosure_index,
        "published_at": doc.published_at,
        "available_at": doc.available_at,
        "content": content,
        "content_norm": norm_key(content),
        "content_sha256": content_sha256(content),
        "token_count": token_count,
        "embedding": None if embedding is None else vector_literal(embedding),
        "embed_model": model,
        "embed_version": version,
        "metadata": Jsonb(doc.metadata),
    }


async def upsert_chunk(conn: Conn, params: dict[str, Any]) -> None:
    await conn.execute(UPSERT_SQL, params)


async def touch_chunk(conn: Conn, params: dict[str, Any]) -> None:
    """Unchanged content: refresh the metadata columns only (no new embedding)."""
    await conn.execute(TOUCH_SQL, params)


async def delete_stale(conn: Conn, doc_ref: str, lang: str, model: str, keep: int) -> int:
    cur = await conn.execute(DELETE_STALE_SQL, (doc_ref, lang, model, keep))
    return cur.rowcount
