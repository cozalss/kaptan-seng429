"""Which LangGraph checkpointer the graph uses: in-memory (default) or Postgres (`CHECKPOINTER=postgres`).

    async with open_saver(settings):          # API lifespan / agent worker
        ...                                   # compile_graph() now checkpoints into agent_ckpt.*

`memory` stays the default because it keeps M1 exactly as it was (unit tests compile the graph without
a database, replay runs are byte-identical). With `postgres` every thread (one per run, thread_id =
run_id for KAP runs) survives a restart: a run interrupted at `approval` can be resumed or expired by
another process, and a run that crashed mid-graph continues from its last super-step instead of paying
for its LLM calls again. The tables come from migration 0010 (owner role); at start-up we only check
that the saver's migration list is applied, and fall back to `setup()` if the library added one.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Final

import psycopg
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from kaptan.settings import Settings

log = logging.getLogger("kaptan.agents.checkpoint")

SCHEMA: Final = "agent_ckpt"
#: One in-process saver (M1: single API process); the default whenever no other saver is installed.
MEMORY_SAVER: Final = InMemorySaver()

_installed: list[BaseCheckpointSaver[Any]] = []


class CheckpointSchemaError(RuntimeError):
    """The agent_ckpt tables are missing or older than the installed langgraph-checkpoint-postgres."""


def current_saver() -> BaseCheckpointSaver[Any]:
    """The saver `compile_graph()` uses when none is passed: the innermost `open_saver()`, else memory."""
    return _installed[-1] if _installed else MEMORY_SAVER


def saver_pool(conninfo: str, *, max_size: int = 4) -> AsyncConnectionPool[Any]:
    """A closed pool in the shape AsyncPostgresSaver needs (autocommit, dict rows, no prepared statements)."""
    return AsyncConnectionPool(
        conninfo,
        min_size=1,
        max_size=max_size,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
            "options": f"-c search_path={SCHEMA}",
        },
        open=False,
        name="kaptan-ckpt",
    )


async def ensure_schema(saver: AsyncPostgresSaver, pool: AsyncConnectionPool[Any]) -> None:
    """Migration 0010 applied the saver's MIGRATIONS; run `setup()` only if the library has newer ones."""
    wanted = len(saver.MIGRATIONS) - 1
    try:
        async with pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("SELECT max(v) AS v FROM checkpoint_migrations")
            row = await cur.fetchone()
    except psycopg.Error as exc:
        raise CheckpointSchemaError("agent_ckpt tables missing: run `uv run alembic upgrade head` (0010)") from exc
    have = -1 if row is None or row["v"] is None else int(row["v"])
    if have >= wanted:
        return
    log.warning("checkpoint schema at v%d, library wants v%d: running setup()", have, wanted)
    try:
        await saver.setup()
    except psycopg.Error as exc:
        raise CheckpointSchemaError(
            "the checkpoint schema needs an upgrade the app role may not run; apply it as the owner"
        ) from exc


@asynccontextmanager
async def install(saver: BaseCheckpointSaver[Any]) -> AsyncIterator[BaseCheckpointSaver[Any]]:
    """Make `saver` the default of `compile_graph()` for the duration of the block."""
    _installed.append(saver)
    try:
        yield saver
    finally:
        _installed.remove(saver)


@asynccontextmanager
async def postgres_saver(conninfo: str) -> AsyncIterator[AsyncPostgresSaver]:
    """An AsyncPostgresSaver on its own small pool (checked schema), closed on exit."""
    pool = saver_pool(conninfo)
    await pool.open(wait=True)
    try:
        saver = AsyncPostgresSaver(pool)
        await ensure_schema(saver, pool)
        yield saver
    finally:
        await pool.close()


@asynccontextmanager
async def open_saver(settings: Settings) -> AsyncIterator[BaseCheckpointSaver[Any]]:
    """The configured saver, installed as the graph's default; memory needs nothing."""
    if settings.checkpointer != "postgres":
        yield MEMORY_SAVER
        return
    async with postgres_saver(settings.database_url.get_secret_value()) as saver, install(saver):
        log.info("LangGraph checkpointer: postgres (schema %s)", SCHEMA)
        yield saver
