"""`attach_similar()`: put "benzer geçmiş bildirimler" (and, for Uyum, the regulation in force) into a run's
context (LLM_MODE=live only).

The analysts then see them in TASK_CONTEXT (`similar_disclosures`: ref_id, disclosure index, ticker,
event type, KAP subject, date, citation "kap:<index> (<date>)", score). Point in time: the search runs
with `as_of` = the disclosure's `available_at` (the decision time) and `published_at < as_of`, and the
disclosure itself is excluded. Replay runs never call this, so replay stays byte-identical.

Never fails a run: no index, no key, a cap reached or a database error → the context is returned
unchanged (logged without any text).
"""

from __future__ import annotations

import logging
from dataclasses import replace

from kaptan.agents.context import RunContext
from kaptan.rag.bases import regulation_passages
from kaptan.rag.chunking import query_text
from kaptan.rag.config import default_rag_config
from kaptan.rag.embed import Embedder, get_embedder
from kaptan.rag.hybrid import similar_disclosures
from kaptan.rag.store import Conn
from kaptan.settings import Settings, get_settings

log = logging.getLogger("kaptan.rag")

LIVE_PROVIDER: str = "live"


def is_live(ctx: RunContext) -> bool:
    return getattr(ctx.provider, "name", "") == LIVE_PROVIDER


async def attach_similar(
    conn: Conn,
    ctx: RunContext,
    *,
    settings: Settings | None = None,
    embedder: Embedder | None = None,
    force: bool = False,
) -> RunContext:
    """A copy of `ctx` with `similar` and `regulation` filled (live provider only, unless `force`)."""
    settings = settings or get_settings()
    if not (force or is_live(ctx)):
        return ctx
    ctx = await attach_regulation(conn, ctx, settings=settings, embedder=embedder)
    k = settings.rag_context_k
    if k == 0:
        return ctx
    d = ctx.disclosure
    try:
        emb = embedder or get_embedder(settings)
        text = query_text(d.subject, d.summary, d.text_tr, default_rag_config().chunking.query_max_chars)
        found = await similar_disclosures(
            conn, emb, as_of=d.available_at, text=text, k=k, exclude_index=d.disclosure_index
        )
    except Exception as exc:  # retrieval is an aid: never the reason a run fails
        log.warning("rag context skipped for %s: %s", d.run_id, type(exc).__name__)
        return ctx
    return replace(ctx, similar=tuple(found))


async def attach_regulation(
    conn: Conn, ctx: RunContext, *, settings: Settings, embedder: Embedder | None = None
) -> RunContext:
    """`regulation` = the SPK paragraphs closest to this disclosure, in force at its `available_at`."""
    k = settings.rag_regulation_k
    if k == 0:
        return ctx
    d = ctx.disclosure
    try:
        emb = embedder or get_embedder(settings)
        text = query_text(d.subject, d.summary, d.text_tr, default_rag_config().chunking.query_max_chars)
        found = await regulation_passages(conn, emb, as_of=d.available_at, text=text, k=k)
    except Exception as exc:  # retrieval is an aid: never the reason a run fails
        log.warning("regulation context skipped for %s: %s", d.run_id, type(exc).__name__)
        return ctx
    return replace(ctx, regulation=tuple(found)) if found else ctx
