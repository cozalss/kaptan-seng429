"""`run_scenario()`: an injected demo disclosure goes through the real graph (replay LLM) and lands in
Postgres exactly as the panel mock shows it (scenarios.ts runDemoScenario + auditOutcome).

Called by /demo/inject (package C) outside any transaction; this module commits its own. Steps:
load the demo row + desk state → run the graph (interrupts at `approval` for a proposal) → one
transaction: disclosure visible and re-timed to now, agent_runs.explain, proposal + pending card,
LLM usage counters (first injection only), the audit outcome → after commit, the run animation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Final, cast

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from psycopg import AsyncConnection
from psycopg.pq import TransactionStatus

from kaptan.agents import db as q
from kaptan.agents.context import DeskState, DisclosureInput, Restriction, RunContext
from kaptan.agents.explain import assemble
from kaptan.agents.graph import compile_graph
from kaptan.agents.state import KaptanState
from kaptan.agents.tools import ReplayToolbox, Toolbox
from kaptan.audit.writer import AuditDraft, append
from kaptan.clock import Clock, istanbul_date
from kaptan.demo.fixtures import DemoFixtures
from kaptan.llm import get_provider
from kaptan.llm.provider import LLMProvider
from kaptan.llm.usage import sync_usage

log = logging.getLogger("kaptan.agents")

RUN_SCENARIOS: Final = frozenset({"e3_contract", "redteam_injection", "restricted_r04"})
#: KAP → our poller: a disclosure is seen 21 s after it is published (the mock's first_seen_at).
SEEN_AFTER: Final = timedelta(seconds=21)
AUDIT_STRATEGY_VERSION: Final = "v1.1-fwd"


@dataclass(frozen=True, slots=True)
class ScenarioResult:
    scenario: str
    run_id: str
    disclosure_index: int
    explain: dict[str, Any]
    first_injection: bool
    scheduled_events: int = 0


def _ms(dt: datetime) -> datetime:
    return dt.replace(microsecond=(dt.microsecond // 1000) * 1000)


async def build_context(
    conn: AsyncConnection[Any],
    run: dict[str, Any],
    now: datetime,
    *,
    provider: LLMProvider,
    tools: Toolbox,
) -> tuple[RunContext, dict[str, Any], list[dict[str, str]]]:
    """The run's context from Postgres: disclosure (re-timed to `now`), texts and desk state."""
    meta = DemoFixtures().meta
    disc = await q.disclosure(conn, int(run["disclosure_index"]))
    texts = await q.texts(conn, int(run["disclosure_index"]))
    text_tr = next(t["body"] for t in texts if t["lang"] == "tr")
    published = _ms(now)
    d = DisclosureInput(
        run_id=run["run_id"],
        disclosure_index=int(run["disclosure_index"]),
        ticker=run["ticker"],
        company_name=run["company_name"],
        subject=disc["subject"],
        summary=disc["summary"],
        text_tr=text_tr,
        published_at=published,
        available_at=published + SEEN_AFTER,
        strategy_version=run["strategy_version"],
        is_fixture=bool(run["is_fixture"]),
        stored_classification=disc["classification"],
    )
    issuer = await q.issuer(conn, d.ticker)
    risk = await q.risk_state(conn)
    book = await q.book(conn, d.ticker)
    desk = DeskState(
        in_universe=bool(issuer["in_universe"]),
        last_price=Decimal(str(issuer["price"])),
        adv20_try=Decimal(str(issuer["adv20_try"])),
        free_float=float(issuer["free_float"]),
        equity_try=Decimal(str(meta["paper_equity_try"])),
        restrictions=tuple(Restriction(r["kind"], r["source_ref"]) for r in await q.restrictions(conn, d.ticker)),
        kill_switch_on=risk["kill_switch"] == "on",
        halted_today=bool(risk["halted_today"]),
        daily_pnl_pct=Decimal(str(risk["daily_pnl_pct"])),
        drawdown_pct=Decimal(str(risk["drawdown_pct"])),
        regime=str(risk["regime"]),
        n_open_positions=int(book["n_open"]),
        holds_ticker=bool(book["holds_ticker"]),
        quota_ok=await q.quota_ok(conn),
        live_armed=await q.live_armed(conn),
    )
    ctx = RunContext(
        provider=provider,
        tools=tools,
        disclosure=d,
        desk=desk,
        prompt_manifest_hash=str(meta["prompt_manifest_hash"]),
    )
    if getattr(provider, "name", "") == "live":  # kaptan.rag: "benzer geçmiş bildirimler", never in replay
        from kaptan.rag.agent_context import attach_similar

        ctx = await attach_similar(conn, ctx)
    return ctx, q.list_item(disc), texts


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}


async def run_graph(ctx: RunContext, thread_id: str) -> KaptanState:
    """Run until END or the approval interrupt; returns the state values."""
    graph = compile_graph()
    await graph.ainvoke({"steps": [], "llm_calls": 0}, config=_config(thread_id), context=ctx)
    snapshot = await graph.aget_state(_config(thread_id))
    return cast(KaptanState, dict(snapshot.values))


async def resume_graph(ctx: RunContext, thread_id: str, decision: dict[str, Any]) -> KaptanState:
    """Continue an interrupted run with the human decision (Command(resume=…), same thread_id)."""
    graph = compile_graph()
    command: Command[Any] = Command(resume=decision)
    await graph.ainvoke(command, config=_config(thread_id), context=ctx)
    snapshot = await graph.aget_state(_config(thread_id))
    return cast(KaptanState, dict(snapshot.values))


def _audit_outcome(explain: dict[str, Any], now: datetime) -> AuditDraft | None:
    """scenarios.ts auditOutcome(): a proposal, a caught hidden instruction or a hard veto."""
    run = explain["run"]
    base = {"ticker": run["ticker"], "company": run["company_name"]}
    common = {"run_id": run["run_id"], "strategy_version": AUDIT_STRATEGY_VERSION, "occurred_at": now}
    if explain["approval"] is not None:
        card = explain["approval"]
        return AuditDraft(
            actor="agent:request_approval",
            action="proposal.created",
            entity_type="trade_proposal",
            entity_id=card["proposal_id"],
            payload={**base, "qty": card["qty"]},
            **common,
        )
    if run["outcome"] == "PREGATE_VETO":
        return AuditDraft(
            actor="agent:pre_gate",
            action="risk.rejected",
            entity_type="disclosure",
            entity_id=str(run["disclosure_index"]),
            payload={**base, "reasons": explain["pre_gate"]["reasons"], "llm_calls": 0},
            **common,
        )
    if run["outcome"] == "QUARANTINED":
        return AuditDraft(
            actor="agent:compliance",
            action="compliance.rejected",
            entity_type="disclosure",
            entity_id=str(run["disclosure_index"]),
            payload={**base, "reason": "prompt_injection"},
            **common,
        )
    return None


async def persist(conn: AsyncConnection[Any], explain: dict[str, Any], now: datetime, first: bool) -> None:
    run, disc, card = explain["run"], explain["disclosure"], explain["approval"]
    async with conn.transaction():
        await q.show_disclosure(conn, disc)
        await q.update_run(conn, run, explain, now)
        if card is not None and explain["proposal"] is not None:
            await q.upsert_proposal(conn, explain["proposal"], card)
        if first:
            await q.add_usage(conn, istanbul_date(now), run["llm_calls"], run["tokens_in"] + run["tokens_out"])
        draft = _audit_outcome(explain, now)
        if draft is not None:
            await append(conn, [draft], now=now)


async def run_scenario(
    conn: AsyncConnection[Any],
    scenario: str,
    clock: Clock,
    *,
    app: Any = None,
    provider: LLMProvider | None = None,
    tools: Toolbox | None = None,
) -> ScenarioResult:
    """Inject one demo scenario (e3_contract | redteam_injection | restricted_r04) through the pipeline."""
    if scenario not in RUN_SCENARIOS:
        raise ValueError(f"not a pipeline scenario: {scenario}")
    if conn.info.transaction_status != TransactionStatus.IDLE:  # never run inside someone's transaction
        await conn.commit()
    run = await q.demo_run(conn, scenario)
    first = run["injected_at"] is None
    now = _ms(clock.now())
    app_state = getattr(app, "state", None)
    mode = getattr(app_state, "settings", None)
    llm = provider or get_provider(
        getattr(mode, "llm_mode", "replay"), settings=mode, redis=getattr(app_state, "redis", None)
    )
    ctx, disc_doc, texts = await build_context(conn, run, now, provider=llm, tools=tools or ReplayToolbox())
    await conn.commit()  # release the read snapshot before the graph runs
    state = await run_graph(ctx, thread_id=f"{run['run_id']}@{now.isoformat()}")
    explain = assemble(state, ctx, disc_doc, texts)
    await persist(conn, explain, now, first)
    await sync_usage(conn, llm)  # live mode: per-call usage rows + real quota counters (no-op in replay)
    scheduled = 0
    if app is not None:
        from kaptan.agents.timeline import schedule

        try:
            scheduled = schedule(app, explain)
        except Exception:  # the run is committed; a missing timer must not fail the inject
            log.exception("run animation not scheduled for %s", run["run_id"])
    return ScenarioResult(scenario, run["run_id"], int(run["disclosure_index"]), explain, first, scheduled)
