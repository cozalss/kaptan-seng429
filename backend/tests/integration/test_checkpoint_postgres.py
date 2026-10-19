"""CHECKPOINTER=postgres: graph threads survive a process restart (a new saver on a new pool).

Each "process" is one `postgres_saver()` block (its own connection pool); leaving the block is the
restart. Nothing is shared in memory between the two blocks.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from typing import Any

import pytest
from langgraph.types import Command

from kaptan.agents import checkpoint
from kaptan.agents.checkpoint import (
    MEMORY_SAVER,
    CheckpointSchemaError,
    current_saver,
    ensure_schema,
    install,
    open_saver,
    postgres_saver,
    saver_pool,
)
from kaptan.agents.feed_run import run_or_resume
from kaptan.agents.graph import compile_graph
from kaptan.agents.tools import ReplayToolbox
from kaptan.evidence.toolbox import LiveToolbox
from kaptan.llm.provider import LLMRequest, LLMResult
from kaptan.settings import Settings
from tests.unit.agent_fixtures import context_for

pytestmark = pytest.mark.integration

APPROVE = {"decision": "approve", "approved_notional_try": None, "comment": ""}


class CrashError(Exception):
    """The process dies (not a provider error, which the graph would turn into HOLD)."""


class Recording:
    """Replay answers, counting calls per agent; optionally dies on the first call of one agent."""

    def __init__(self, die_on: str | None = None) -> None:
        self.inner = context_for("run-demo-e3-ornek").provider
        self.die_on = die_on
        self.calls: list[str] = []
        self.name = "recording"

    async def complete(self, request: LLMRequest) -> LLMResult:
        if request.agent == self.die_on:
            self.die_on = None
            raise CrashError(request.agent)
        self.calls.append(request.agent)
        return await self.inner.complete(request)


def _cfg(thread: str) -> Any:
    return {"configurable": {"thread_id": thread}}


async def test_interrupted_run_resumes_in_a_new_process(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    thread = f"ckpt-{uuid.uuid4().hex}"
    ctx = context_for("run-demo-e3-ornek")
    async with postgres_saver(url) as saver, install(saver):
        assert current_saver() is saver
        state = await run_or_resume(ctx, thread)
        assert state["status"] == "interrupted"
    assert current_saver() is MEMORY_SAVER

    async with postgres_saver(url) as saver:  # restart: nothing in memory
        graph = compile_graph(saver)
        snapshot = await graph.aget_state(_cfg(thread))
        assert snapshot.next == ("approval",)
        await graph.ainvoke(Command(resume=APPROVE), config=_cfg(thread), context=ctx)
        done = (await graph.aget_state(_cfg(thread))).values
    assert done["status"] == "completed"
    assert [s["node"] for s in done["steps"]][-3:] == ["approval", "execute", "record"]


async def test_a_run_that_died_mid_graph_continues_without_paying_again(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    thread = f"ckpt-{uuid.uuid4().hex}"
    dying = Recording(die_on="skeptic")
    async with postgres_saver(url) as saver, install(saver):
        with pytest.raises(CrashError):
            await run_or_resume(replace(context_for("run-demo-e3-ornek"), provider=dying), thread)
    before = list(dying.calls)
    assert "reader" in before and "skeptic" not in before

    fresh = Recording()
    async with postgres_saver(url) as saver, install(saver):
        state = await run_or_resume(replace(context_for("run-demo-e3-ornek"), provider=fresh), thread)
        again = await run_or_resume(replace(context_for("run-demo-e3-ornek"), provider=fresh), thread)
    assert state["status"] == "interrupted" and state["outcome"] == "PROPOSE"
    assert fresh.calls[0] == "skeptic"  # guard/reader/materiality/evidence came from the checkpoint
    assert not set(fresh.calls) & {"guard", "reader", "materiality"}
    assert again["status"] == "interrupted" and len(fresh.calls) == len(set(fresh.calls))  # parked: no rerun


async def test_open_saver_follows_the_setting(migrated: Settings) -> None:
    async with open_saver(migrated) as saver:
        assert saver is MEMORY_SAVER and current_saver() is MEMORY_SAVER
    pg = migrated.model_copy(update={"checkpointer": "postgres"})
    async with open_saver(pg) as saver:
        assert saver is not MEMORY_SAVER and current_saver() is saver
    assert current_saver() is MEMORY_SAVER


async def test_missing_schema_is_a_clear_error(migrated: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    monkeypatch.setattr(checkpoint, "SCHEMA", "no_such_schema")
    pool = saver_pool(migrated.database_url.get_secret_value())
    await pool.open(wait=True)
    try:
        saver = AsyncPostgresSaver(pool)
        with pytest.raises(CheckpointSchemaError, match="alembic"):
            await ensure_schema(saver, pool)
    finally:
        await pool.close()


async def test_newer_library_migrations_run_setup(migrated: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    pool = saver_pool(migrated.database_url.get_secret_value())
    await pool.open(wait=True)
    try:
        saver = AsyncPostgresSaver(pool)
        monkeypatch.setattr(saver, "MIGRATIONS", [*saver.MIGRATIONS, "SELECT 1;"])
        with pytest.raises(CheckpointSchemaError, match="owner"):
            await ensure_schema(saver, pool)  # the app role may not run DDL there: told to use the owner
    finally:
        await pool.close()


class PreparedTools(LiveToolbox):
    """A LiveToolbox whose SQL pass is recorded instead of run (answers come from the replay base)."""

    def __init__(self, ctx: Any) -> None:
        super().__init__(None, ctx.disclosure, ReplayToolbox())  # type: ignore[arg-type]
        self.prepared: list[str | None] = []

    async def prepare(self, event_type: str | None) -> None:
        self.prepared.append(event_type)

    def features(self, fp: str) -> Any:
        return self.base.features(fp)

    def evidence_store(self, fp: str) -> Any:
        return self.base.evidence_store(fp)

    def sizing(self, fp: str) -> Any:
        return self.base.sizing(fp)


async def test_resume_between_analysts_and_merge_prepares_the_fresh_toolbox(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    thread = f"ckpt-{uuid.uuid4().hex}"
    base = context_for("run-demo-e3-ornek")
    async with postgres_saver(url) as saver, install(saver):
        with pytest.raises(CrashError):  # reader dies; materiality/evidence finished in the same super-step
            await run_or_resume(replace(base, provider=Recording(die_on="reader")), thread)

    tools = PreparedTools(base)
    async with postgres_saver(url) as saver, install(saver):
        state = await run_or_resume(replace(base, provider=Recording(), tools=tools), thread)
    assert tools.prepared[:1] == [state["event_type"]] == ["E3"]  # before the graph continued
    assert state["evidence_card"] is not None and state["outcome"] == "PROPOSE"
