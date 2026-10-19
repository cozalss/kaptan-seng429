"""Offline retrieval eval of kaptan.rag on the committed KAP fixtures (recall@k, MRR per leg set).

    uv run alembic -x db=test upgrade head                       # once: the test database's schema
    uv run python scripts/rag_eval.py                            # fake embedder, with ~470 distractors
    uv run python scripts/rag_eval.py --embedder gemini --no-distractors   # live: ~2 embedding calls

Runs against TEST_DATABASE_URL (never the dev database unless --database-url is given), loads the
fixture days as origin='kap' rows, indexes them, prints the JSON report and removes what it wrote
(`--keep` leaves it). See kaptan/rag/eval.py for the corpus and the hand-labelled pairs.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from redis.asyncio import Redis

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.rag import eval as rag_eval
from kaptan.rag.embed import build_embedder
from kaptan.settings import get_settings


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="scripts/rag_eval.py", description="kaptan.rag retrieval eval")
    p.add_argument("--embedder", choices=("fake", "gemini"), default="fake")
    p.add_argument("--no-distractors", action="store_true", help="only the 11 texts (cheap with gemini)")
    p.add_argument("--keep", action="store_true", help="keep the fixture rows and chunks")
    p.add_argument("--database-url", default=None, help="default: TEST_DATABASE_URL")
    return p.parse_args(argv)


async def main_async(args: argparse.Namespace) -> str:
    settings = get_settings()
    url = args.database_url or (settings.test_database_url and settings.test_database_url.get_secret_value())
    if not url:
        raise SystemExit("TEST_DATABASE_URL is not set (or pass --database-url)")
    redis = Redis.from_url(settings.redis_url.get_secret_value()) if args.embedder == "gemini" else None
    embedder = build_embedder(settings, kind=args.embedder, redis=redis)  # live: vectors cached in Redis
    conn = await connect(url)
    try:
        indexes = await rag_eval.load_fixture_corpus(conn)
        stats = await rag_eval.index_fixture_corpus(conn, embedder, indexes, distractors=not args.no_distractors)
        report = await rag_eval.run_eval(conn, embedder)
        report["index"] = {"disclosures": stats.disclosures, "chunks": stats.chunks, "errors": stats.errors}
        report["embedding_calls"] = embedder.remote_calls
        if not args.keep:
            await rag_eval.clean_fixture_corpus(conn, indexes)
        return rag_eval.as_json(report)
    finally:
        await conn.close()
        if redis is not None:
            await redis.aclose()


def main(argv: Sequence[str] | None = None) -> int:
    sys.stdout.write(run(main_async(parse_args(argv))) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
