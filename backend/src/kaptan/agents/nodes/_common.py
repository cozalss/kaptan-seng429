"""Shared helpers for the nodes: trace rows and the one way to call a model."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel

from kaptan.agents.context import RunContext
from kaptan.agents.state import Step
from kaptan.llm.provider import LLMRequest, LLMUsage, ProviderError
from kaptan.llm.replay import agent_inputs, prompt_version
from kaptan.llm.task_context import task_context

FANOUT_GROUP = "fanout-1"
log = logging.getLogger("kaptan.agents")


def step(
    ctx: RunContext,
    node: str,
    *,
    status: str = "done",
    note: str | None = None,
    group: str | None = None,
    usage: LLMUsage | None = None,
    prompt: str | None = None,
) -> Step:
    """One trace row. Deterministic nodes take their latency from the toolbox (replay) or 0."""
    if usage is None:
        latency = ctx.tools.node_latency_ms(ctx.disclosure.fingerprint, node) or 0
        return Step(
            node=node,
            status=status,
            latency_ms=None if status == "waiting" else latency,
            tokens_in=0,
            tokens_out=0,
            model_id=None,
            prompt_version=None,
            cached=False,
            parallel_group=group,
            note_tr=note,
        )
    return Step(
        node=node,
        status=status,
        latency_ms=usage.latency_ms,
        tokens_in=usage.tokens_in,
        tokens_out=usage.tokens_out,
        model_id=usage.model_id,
        prompt_version=prompt,
        cached=usage.cached,
        parallel_group=group,
        note_tr=note,
    )


async def ask(
    ctx: RunContext,
    agent: str,
    schema: type[BaseModel] | None,
    *,
    extra: Mapping[str, Any] | None = None,
    state: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any], LLMUsage, str]:
    """Call the provider for `agent` on this disclosure; returns (output, usage, prompt version).

    The text and the structured TASK_CONTEXT ride along for live providers (masked/fenced there); the
    replay key stays agent + prompt version + inputs."""
    d = ctx.disclosure
    inputs: dict[str, Any] = {**agent_inputs(d.ticker, d.text_tr), **(extra or {})}
    version = prompt_version(agent)
    request = LLMRequest(
        agent=agent,
        prompt_version=version,
        inputs=inputs,
        output_schema=schema,
        run_id=d.run_id,
        document=d.text_tr,
        context=task_context(agent, state or {}, ctx),
    )
    result = await ctx.provider.complete(request)
    return dict(result.output), result.usage, version


async def ask_or_fail(
    ctx: RunContext,
    agent: str,
    schema: type[BaseModel] | None,
    *,
    group: str | None = None,
    state: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, Step]:
    """Like `ask`, but an exhausted provider chain is a failed agent (05 §2.4 → HOLD), not a crash."""
    try:
        out, usage, version = await ask(ctx, agent, schema, state=state)
    except ProviderError as exc:
        log.warning("agent %s failed for %s: %s", agent, ctx.disclosure.run_id, exc)
        return None, step(ctx, agent, status="failed", group=group, note="Model yanıt vermedi: HOLD")
    return out, step(ctx, agent, usage=usage, prompt=version, group=group)
