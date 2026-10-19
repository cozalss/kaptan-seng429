"""The two other RAG bases of `rag.rag_chunks` (07 §11.2–11.3, FR-12): event memory and regulation.

- **event_memory**: one chunk per (event, horizon) from core.events + core.event_returns (wave A): the
  event's summary with the CAR known at that horizon. `available_at` = the later of the event's and the
  return's `available_at`, so a 20-day return is never visible before it was computed (no look-ahead).
- **regulation**: SPK II-15.1 / II-22.1 (and any other text) from `backend/data/regulation/*.md`, one chunk
  per paragraph, with `valid_from` → `published_at`/`available_at` and `valid_to` (a repealed text drops out
  of retrieval after `valid_to`). Front matter: `doc_ref`, `title`, `valid_from`, `valid_to` (empty = in
  force), `lang`, `sample` (true = written by us as a placeholder, never the official text).

`index_base()` embeds only changed chunks (content hash + embedder version, like the disclosure archive)
and removes chunks past the new count. `regulation_passages()` is the compliance agent's retriever.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Final

from psycopg.types.json import Jsonb

from kaptan.rag.chunking import est_tokens
from kaptan.rag.embed import Embedder
from kaptan.rag.store import Conn, content_sha256, delete_stale, existing_chunks, vector_literal
from kaptan.settings import BACKEND_DIR
from kaptan.text import norm_key
from kaptan.text.turkish import IST

log = logging.getLogger("kaptan.rag.bases")

BASE_EVENTS: Final = "event_memory"
BASE_REGULATION: Final = "regulation"
REGULATION_DIR: Final = BACKEND_DIR / "data" / "regulation"
MAX_PARAGRAPH_CHARS: Final = 2400

EVENTS_SQL: Final = """
SELECT e.event_id, e.ticker, e.event_code, e.subtype, e.direction, e.materiality, e.event_time,
       e.available_at AS e_avail, e.disclosure_index, d.subject,
       r.horizon, r.model, r.car, r.raw_ret, r.bench_ret, r.available_at AS r_avail
  FROM core.events e
  JOIN core.event_returns r USING (event_id)
  LEFT JOIN core.disclosures d ON d.disclosure_index = e.disclosure_index
 WHERE e.event_code IN ('E1', 'E2', 'E3', 'E4')
   AND (%(since)s::timestamptz IS NULL OR e.event_time >= %(since)s)
 ORDER BY e.event_id, r.horizon, r.model DESC
 LIMIT %(limit)s
"""

UPSERT_SQL: Final = """
INSERT INTO rag.rag_chunks
  (base_type, doc_kind, doc_ref, chunk_no, lang, ticker, event_code, disclosure_index, event_id, published_at,
   available_at, valid_to, content, content_norm, content_sha256, token_count, embedding, embed_model,
   embed_version, metadata)
VALUES
  (%(base_type)s, %(doc_kind)s, %(doc_ref)s, %(chunk_no)s, %(lang)s, %(ticker)s, %(event_code)s,
   %(disclosure_index)s, %(event_id)s, %(published_at)s, %(available_at)s, %(valid_to)s, %(content)s,
   %(content_norm)s, %(content_sha256)s, %(token_count)s, %(embedding)s::vector, %(embed_model)s,
   %(embed_version)s, %(metadata)s)
ON CONFLICT (doc_ref, chunk_no, lang, embed_model) DO UPDATE SET
  base_type = EXCLUDED.base_type, doc_kind = EXCLUDED.doc_kind, ticker = EXCLUDED.ticker,
  event_code = EXCLUDED.event_code, event_id = EXCLUDED.event_id, published_at = EXCLUDED.published_at,
  available_at = EXCLUDED.available_at, valid_to = EXCLUDED.valid_to, content = EXCLUDED.content,
  content_norm = EXCLUDED.content_norm, content_sha256 = EXCLUDED.content_sha256,
  token_count = EXCLUDED.token_count, embedding = EXCLUDED.embedding, embed_version = EXCLUDED.embed_version,
  metadata = EXCLUDED.metadata
"""

TOUCH_SQL: Final = """
UPDATE rag.rag_chunks SET published_at = %(published_at)s, available_at = %(available_at)s,
       valid_to = %(valid_to)s, metadata = %(metadata)s
 WHERE doc_ref = %(doc_ref)s AND chunk_no = %(chunk_no)s AND lang = %(lang)s AND embed_model = %(embed_model)s
"""

REGULATION_SQL: Final = """
SELECT c.doc_ref, c.chunk_no, c.content, c.valid_to, c.metadata, 1 - (c.embedding <=> %(qvec)s::vector) AS score
  FROM rag.rag_chunks c
 WHERE c.base_type = 'regulation' AND c.embed_model = %(model)s
   AND c.published_at < %(as_of)s AND c.available_at <= %(as_of)s
   AND (c.valid_to IS NULL OR c.valid_to > %(as_of)s)
 ORDER BY c.embedding <=> %(qvec)s::vector, c.doc_ref, c.chunk_no
 LIMIT %(k)s
"""


@dataclass(frozen=True, slots=True)
class BaseDoc:
    """One document of the event-memory or regulation base, already split into chunk texts."""

    base_type: str
    doc_kind: str
    doc_ref: str
    chunks: tuple[str, ...]
    published_at: datetime
    available_at: datetime
    lang: str = "tr"
    ticker: str | None = None
    event_code: str | None = None
    disclosure_index: int | None = None
    event_id: int | None = None
    valid_to: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BaseStats:
    docs: int = 0
    chunks: int = 0
    embedded: int = 0
    unchanged: int = 0
    removed: int = 0


# ── event memory ──────────────────────────────────────────────────────────────────────────────


def _pct(x: Any) -> str:
    return "?" if x is None else f"%{float(x) * 100:+.2f}".replace(".", ",")


def event_text(row: dict[str, Any]) -> str:
    day = row["event_time"].astimezone(IST).date().isoformat()
    head = f"[{row['ticker'] or '-'} | {day} | {row['event_code']} | ev:{row['event_id']}]"
    direction = {1: "olumlu", -1: "olumsuz", 0: "nötr"}.get(row["direction"], "belirsiz")
    subject = row["subject"] or row["subtype"] or row["event_code"]
    return (
        f"{head} Olay: {subject} ({row['subtype'] or 'alt tür yok'}), yön {direction}. "
        f"{row['horizon']} seanslık birikimli anormal getiri {_pct(row['car'])} "
        f"(hisse {_pct(row['raw_ret'])}, endeks {_pct(row['bench_ret'])}, model {row['model']})."
    )


def event_docs(rows: Sequence[dict[str, Any]]) -> list[BaseDoc]:
    """One doc per (event, horizon); the first model per horizon wins (market_model before market_adj)."""
    seen: set[tuple[int, int]] = set()
    out: list[BaseDoc] = []
    for r in rows:
        key = (int(r["event_id"]), int(r["horizon"]))
        if key in seen:
            continue
        seen.add(key)
        available = max(r["e_avail"], r["r_avail"])
        out.append(
            BaseDoc(
                base_type=BASE_EVENTS,
                doc_kind="event",
                doc_ref=f"ev:{key[0]}:h{key[1]}",
                chunks=(event_text(r),),
                published_at=min(r["event_time"], available),
                available_at=available,
                ticker=r["ticker"],
                event_code=r["event_code"],
                disclosure_index=None,  # keeps these rows out of the disclosure archive's joins
                event_id=key[0],
                metadata={"horizon": key[1], "model": r["model"], "source_disclosure": r["disclosure_index"]},
            )
        )
    return out


async def load_event_docs(conn: Conn, *, since: datetime | None = None, limit: int = 100_000) -> list[BaseDoc]:
    async with conn.cursor() as cur:
        await cur.execute(EVENTS_SQL, {"since": since, "limit": limit})
        rows = await cur.fetchall()
    return event_docs(rows)


# ── regulation ────────────────────────────────────────────────────────────────────────────────


def _front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    head, _, body = text[3:].partition("\n---")
    meta: dict[str, str] = {}
    for line in head.strip().splitlines():
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip()
    return meta, body.lstrip("\n")


def _day_start(value: str) -> datetime:
    return datetime.combine(date.fromisoformat(value), time(0), IST)


def paragraphs(body: str) -> tuple[str, ...]:
    parts = [" ".join(p.split()) for p in body.split("\n\n")]
    return tuple(p[:MAX_PARAGRAPH_CHARS] for p in parts if p and not p.startswith("#"))


def regulation_doc(path: Path) -> BaseDoc:
    meta, body = _front_matter(path.read_text(encoding="utf-8"))
    for key in ("doc_ref", "title", "valid_from"):
        if not meta.get(key):
            raise ValueError(f"{path.name}: front matter needs {key!r}")
    start = _day_start(meta["valid_from"])
    title = meta["title"]
    chunks = tuple(f"[{meta['doc_ref']} | {title}] {p}" for p in paragraphs(body))
    if not chunks:
        raise ValueError(f"{path.name}: no paragraphs")
    return BaseDoc(
        base_type=BASE_REGULATION,
        doc_kind="regulation",
        doc_ref=meta["doc_ref"],
        chunks=chunks,
        published_at=start,
        available_at=start,
        lang=meta.get("lang") or "tr",
        valid_to=_day_start(meta["valid_to"]) if meta.get("valid_to") else None,
        metadata={"title": title, "sample": meta.get("sample", "false").lower() == "true", "file": path.name},
    )


def load_regulation_docs(directory: Path = REGULATION_DIR) -> list[BaseDoc]:
    return [regulation_doc(p) for p in sorted(directory.glob("*.md")) if p.name.lower() != "readme.md"]


# ── indexing and retrieval ────────────────────────────────────────────────────────────────────


def _params(doc: BaseDoc, no: int, content: str, vector: Sequence[float] | None, emb: Embedder) -> dict[str, Any]:
    return {
        "base_type": doc.base_type,
        "doc_kind": doc.doc_kind,
        "doc_ref": doc.doc_ref,
        "chunk_no": no,
        "lang": doc.lang,
        "ticker": doc.ticker,
        "event_code": doc.event_code,
        "disclosure_index": doc.disclosure_index,
        "event_id": doc.event_id,
        "published_at": doc.published_at,
        "available_at": doc.available_at,
        "valid_to": doc.valid_to,
        "content": content,
        "content_norm": norm_key(content),
        "content_sha256": content_sha256(content),
        "token_count": est_tokens(content),
        "embedding": None if vector is None else vector_literal(vector),
        "embed_model": emb.model,
        "embed_version": emb.version,
        "metadata": Jsonb(doc.metadata),
    }


async def index_base(conn: Conn, embedder: Embedder, docs: Sequence[BaseDoc]) -> BaseStats:
    stats = BaseStats(docs=len(docs))
    if not docs:
        return stats
    stored = await existing_chunks(conn, sorted({d.doc_ref for d in docs}), embedder.model)
    todo: list[tuple[BaseDoc, int, str]] = []
    keep: list[tuple[BaseDoc, int, str]] = []
    for doc in docs:
        for no, content in enumerate(doc.chunks):
            same = stored.get((doc.doc_ref, doc.lang, no)) == (content_sha256(content), embedder.version)
            (keep if same else todo).append((doc, no, content))
    vectors = await embedder.embed_documents([c for _, _, c in todo]) if todo else []
    async with conn.transaction():
        for (doc, no, content), vector in zip(todo, vectors, strict=True):
            await conn.execute(UPSERT_SQL, _params(doc, no, content, vector, embedder))
        for doc, no, content in keep:
            await conn.execute(TOUCH_SQL, _params(doc, no, content, None, embedder))
        for doc in docs:
            stats.removed += await delete_stale(conn, doc.doc_ref, doc.lang, embedder.model, len(doc.chunks))
    stats.chunks = len(todo) + len(keep)
    stats.embedded, stats.unchanged = len(todo), len(keep)
    return stats


async def regulation_passages(
    conn: Conn, embedder: Embedder, *, as_of: datetime, text: str, k: int = 3
) -> list[dict[str, Any]]:
    """The k closest regulation paragraphs in force at `as_of` (trusted text: our own files)."""
    if k <= 0 or not text.strip():
        return []
    (qvec,) = await embedder.embed_queries([text])
    params = {"qvec": vector_literal(qvec), "model": embedder.model, "as_of": as_of, "k": k}
    async with conn.cursor() as cur:
        await cur.execute(REGULATION_SQL, params)
        rows = await cur.fetchall()
    return [
        {
            "ref_id": f"{r['doc_ref']}#{r['chunk_no']}",
            "title": (r["metadata"] or {}).get("title"),
            "sample": bool((r["metadata"] or {}).get("sample")),
            "text": r["content"],
            "score": round(float(r["score"]), 4),
        }
        for r in rows
    ]


# ── CLI: uv run python -m kaptan.rag.bases --regulation --events [--embedder fake] ─────────────


async def main_async(regulation: bool, events: bool, embedder_kind: str | None) -> list[BaseStats]:
    from kaptan.db import connect
    from kaptan.rag.embed import build_embedder
    from kaptan.settings import get_settings

    settings = get_settings()
    embedder = build_embedder(settings, kind=embedder_kind)  # type: ignore[arg-type]
    conn = await connect(settings.database_url.get_secret_value())
    try:
        out: list[BaseStats] = []
        if regulation:
            out.append(await index_base(conn, embedder, load_regulation_docs()))
        if events:
            out.append(await index_base(conn, embedder, await load_event_docs(conn)))
        return out
    finally:
        await conn.close()


def main(argv: Sequence[str] | None = None) -> int:
    import argparse

    from kaptan.api.loop import run

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="kaptan.rag.bases", description="Index the regulation / event-memory bases.")
    p.add_argument("--regulation", action="store_true")
    p.add_argument("--events", action="store_true")
    p.add_argument("--embedder", choices=["gemini", "fake"], default=None)
    args = p.parse_args(argv)
    for stats in run(main_async(args.regulation, args.events, args.embedder)):
        log.info(
            "indexed %d docs, %d chunks (%d embedded, %d unchanged)",
            stats.docs,
            stats.chunks,
            stats.embedded,
            stats.unchanged,
        )
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
