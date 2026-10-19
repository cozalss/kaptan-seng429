"""Index KAP disclosures into `rag.rag_chunks`: the backfill CLI and the ingest hook.

    uv run python -m kaptan.rag.index --since 2026-10-15
    uv run python -m kaptan.rag.index --since 2025-01-01 --until 2025-02-01 --summaries --embedder gemini
    uv run python -m kaptan.rag.index --since 2026-10-15 --dry-run          # chunk counts, no embedding

--since/--until  published_at window (Istanbul dates, `until` exclusive)
--origin         kap (default) | demo | all
--langs          tr (default) or tr,en
--summaries      also index disclosures without a fetched text (header + KAP summary, one chunk)
--embedder       gemini | fake (default: RAG_EMBEDDER)
Writes with DATABASE_URL (app role). Idempotent and resumable: unchanged chunks are not embedded again,
so a run stopped by the daily cap (exit 3) continues where it stopped on the next run.

Ingest hook: `await index_new_disclosures(conn, [disclosure_index, ...])` after the texts are stored;
it does nothing unless RAG_INDEX_ON_INGEST=true and never raises (errors are logged and counted).
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Final

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.rag.chunking import Chunk, DocMeta, chunk_text, summary_chunk
from kaptan.rag.config import ChunkingSpec, default_rag_config
from kaptan.rag.embed import Embedder, EmbeddingError, build_embedder, get_embedder
from kaptan.rag.store import (
    Conn,
    SourceDoc,
    chunk_params,
    content_sha256,
    delete_stale,
    existing_chunks,
    source_docs,
    touch_chunk,
    upsert_chunk,
)
from kaptan.settings import Settings, get_settings
from kaptan.text.turkish import IST

log = logging.getLogger("kaptan.rag.index")

#: Disclosures per write transaction (and per embedding round trip, batched by the embedder).
GROUP: Final = 40
EXIT_CAPPED: Final = 3


@dataclass(slots=True)
class IndexStats:
    disclosures: int = 0
    chunks: int = 0
    embedded: int = 0
    unchanged: int = 0
    removed: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def stopped(self) -> bool:
        return bool(self.errors)


def chunks_of(doc: SourceDoc, spec: ChunkingSpec) -> list[Chunk]:
    meta = DocMeta(doc.disclosure_index, doc.ticker, doc.published_at, doc.subject, doc.disclosure_class)
    if doc.body is None:
        one = summary_chunk(meta, f"{doc.subject}. {doc.summary}" if doc.summary else doc.subject)
        return [] if one is None else [one]
    return chunk_text(meta, doc.body, spec)


async def _index_group(conn: Conn, embedder: Embedder, docs: Sequence[SourceDoc], stats: IndexStats) -> None:
    spec = default_rag_config().chunking
    planned = [(doc, chunks_of(doc, spec)) for doc in docs]
    stored = await existing_chunks(conn, sorted({d.doc_ref for d in docs}), embedder.model)
    todo: list[tuple[SourceDoc, Chunk]] = []
    keep: list[tuple[SourceDoc, Chunk]] = []
    for doc, chunks in planned:
        for chunk in chunks:
            have = stored.get((doc.doc_ref, doc.lang, chunk.chunk_no))
            same = have is not None and have == (content_sha256(chunk.content), embedder.version)
            (keep if same else todo).append((doc, chunk))
    vectors = await embedder.embed_documents([c.content for _, c in todo]) if todo else []
    async with conn.transaction():
        for (doc, chunk), vector in zip(todo, vectors, strict=True):
            params = chunk_params(
                doc,
                chunk.chunk_no,
                chunk.content,
                chunk.token_count,
                vector,
                model=embedder.model,
                version=embedder.version,
            )
            await upsert_chunk(conn, params)
        for doc, chunk in keep:
            params = chunk_params(
                doc,
                chunk.chunk_no,
                chunk.content,
                chunk.token_count,
                None,
                model=embedder.model,
                version=embedder.version,
            )
            await touch_chunk(conn, params)
        for doc, chunks in planned:
            stats.removed += await delete_stale(conn, doc.doc_ref, doc.lang, embedder.model, len(chunks))
    stats.disclosures += len({d.disclosure_index for d in docs})
    stats.chunks += sum(len(c) for _, c in planned)
    stats.embedded += len(todo)
    stats.unchanged += len(keep)


async def index_disclosures(
    conn: Conn,
    embedder: Embedder,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    indexes: Sequence[int] | None = None,
    origin: str = "kap",
    langs: Sequence[str] = ("tr",),
    summaries: bool = False,
    limit: int = 100_000,
) -> IndexStats:
    """Chunk + embed + store the selected disclosures; stops (with `stats.errors`) when the embedder fails."""
    stats = IndexStats()
    docs = await source_docs(
        conn, since=since, until=until, indexes=indexes, origin=origin, langs=langs, summaries=summaries, limit=limit
    )
    await conn.commit()  # release the read snapshot before the (slow) embedding calls
    for start in range(0, len(docs), GROUP):
        try:
            await _index_group(conn, embedder, docs[start : start + GROUP], stats)
        except EmbeddingError as exc:
            stats.errors.append(str(exc))
            log.warning("rag index stopped after %d disclosures: %s", stats.disclosures, exc)
            break
        await conn.commit()
    return stats


async def index_new_disclosures(
    conn: Conn,
    disclosure_indexes: Sequence[int],
    *,
    settings: Settings | None = None,
    embedder: Embedder | None = None,
    summaries: bool = False,
) -> IndexStats:
    """The ingest hook: index these (newly stored) disclosures. Opt-in via RAG_INDEX_ON_INGEST; never raises.

    Call it after `core.disclosure_texts` is written (the detail fetcher); a disclosure without a text
    is skipped unless `summaries=True`. The caller's transaction is left as it was (savepoints)."""
    settings = settings or get_settings()
    stats = IndexStats()
    if not settings.rag_index_on_ingest or not disclosure_indexes:
        return stats
    try:
        embedder = embedder or get_embedder(settings)
        async with conn.transaction():  # a savepoint when the caller is inside a transaction
            docs = await source_docs(conn, indexes=list(disclosure_indexes), origin="all", summaries=summaries)
            for start in range(0, len(docs), GROUP):
                await _index_group(conn, embedder, docs[start : start + GROUP], stats)
    except Exception as exc:  # the ingest pipeline must never fail because of the index
        stats.errors.append(type(exc).__name__)
        log.warning("rag ingest hook failed for %d disclosures: %s", len(disclosure_indexes), type(exc).__name__)
    return stats


def _day(value: str) -> datetime:
    return datetime.combine(date.fromisoformat(value), time(0), tzinfo=IST)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.rag.index", description="Index KAP disclosures for RAG")
    p.add_argument("--since", required=True, type=_day, help="first day (YYYY-MM-DD, Istanbul)")
    p.add_argument("--until", type=_day, default=None, help="day after the last one (exclusive)")
    p.add_argument("--origin", choices=("kap", "demo", "all"), default="kap")
    p.add_argument("--langs", default="tr", help="tr or tr,en")
    p.add_argument("--summaries", action="store_true", help="index disclosures without a text by their summary")
    p.add_argument("--embedder", choices=("gemini", "fake"), default=None)
    p.add_argument("--limit", type=int, default=100_000)
    p.add_argument("--dry-run", action="store_true", help="count the chunks, embed nothing")
    args = p.parse_args(argv)
    langs = tuple(x.strip() for x in str(args.langs).split(",") if x.strip())
    if not langs or any(x not in ("tr", "en") for x in langs):
        p.error("--langs must be tr, en or tr,en")
    args.langs = langs
    return args


async def main_async(args: argparse.Namespace, settings: Settings) -> IndexStats:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        if args.dry_run:
            docs = await source_docs(
                conn,
                since=args.since,
                until=args.until,
                origin=args.origin,
                langs=args.langs,
                summaries=args.summaries,
                limit=args.limit,
            )
            spec = default_rag_config().chunking
            return IndexStats(disclosures=len(docs), chunks=sum(len(chunks_of(d, spec)) for d in docs))
        embedder = build_embedder(settings, kind=args.embedder)
        return await index_disclosures(
            conn,
            embedder,
            since=args.since,
            until=args.until,
            origin=args.origin,
            langs=args.langs,
            summaries=args.summaries,
            limit=args.limit,
        )
    finally:
        await conn.close()


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    try:
        stats = run(main_async(args, get_settings()))
    except EmbeddingError as exc:
        log.error("embedder unavailable: %s", exc)
        return 2
    log.info(
        "done: %d disclosures, %d chunks (%d embedded, %d unchanged, %d stale removed)%s",
        stats.disclosures,
        stats.chunks,
        stats.embedded,
        stats.unchanged,
        stats.removed,
        " (dry run)" if args.dry_run else "",
    )
    return EXIT_CAPPED if stats.stopped else 0


if __name__ == "__main__":
    sys.exit(main())
