"""One real KAP disclosure through the agent graph: the live twin of `scenario.run_scenario()`.

    result = await run_disclosure(conn, 1683376, now, deps)      # called by kaptan.agents.feed

The disclosure is read as stored (real published/available times, no re-timing), the run gets
`run_id = run-live-<index>` and the same thread_id, so a checkpointed run (CHECKPOINTER=postgres) that
crashed mid-graph continues where it stopped. One transaction writes trading.agent_runs (run_set
'live', mode 'paper'), the disclosure's run link and classification, proposal + pending card, today's
LLM counters, the audit outcome and the ops.agent_feed row; after commit the run's SSE events go out at
once (a real run already took its time, so there is no demo animation). The panel shows it through the
same /runs, /approvals and /stream endpoints as an injected demo run.

`settle_waiting()` closes runs parked at `approval`: decided cards resume the graph with the decision,
cards past `expires_at` resume it with `expire` (and the card is marked expired). With the in-memory
checkpointer a restart loses the thread; the run is then closed without a resume.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Final, cast

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.agents import db as q
from kaptan.agents.context import DeskState, DisclosureInput, Restriction, RunContext, with_active_limits
from kaptan.agents.explain import assemble
from kaptan.agents.graph import compile_graph
from kaptan.agents.scenario import AUDIT_STRATEGY_VERSION, _audit_outcome
from kaptan.agents.state import KaptanState
from kaptan.agents.timeline import plan
from kaptan.agents.tools import Toolbox
from kaptan.audit.writer import append
from kaptan.clock import istanbul_date
from kaptan.demo.fixtures import DemoFixtures
from kaptan.disclosures.counters import day_counters
from kaptan.domain.schemas._base import iso_ms
from kaptan.events.publish import publish
from kaptan.evidence.toolbox import live_tools
from kaptan.llm.provider import LLMProvider
from kaptan.llm.usage import sync_usage
from kaptan.settings import get_settings

log = logging.getLogger("kaptan.agents.feed_run")

RUN_PREFIX: Final = "run-live-"
KIND_OF: Final[dict[str | None, str]] = {
    "PROPOSE": "propose",
    "NO_TRADE": "no_trade",
    "HOLD": "hold",
    "QUARANTINED": "quarantine",
    "PREGATE_VETO": "pregate_veto",
}

INSERT_RUN_SQL: Final = """
INSERT INTO trading.agent_runs (run_id, disclosure_index, ticker, company_name, event_type, kind, status, outcome,
  mode, run_set, visible, strategy_version, is_fixture, started_at, finished_at, llm_calls, tokens_in, tokens_out,
  latency_ms, explain)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'paper', 'live', true, %s, false, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (run_id) DO UPDATE SET event_type = EXCLUDED.event_type, kind = EXCLUDED.kind, status = EXCLUDED.status,
  outcome = EXCLUDED.outcome, started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at,
  llm_calls = EXCLUDED.llm_calls, tokens_in = EXCLUDED.tokens_in, tokens_out = EXCLUDED.tokens_out,
  latency_ms = EXCLUDED.latency_ms, explain = EXCLUDED.explain
"""
LINK_DISCLOSURE_SQL: Final = """
UPDATE core.disclosures SET run_id = %s, classification = coalesce(%s, classification), updated_at = now()
 WHERE disclosure_index = %s
"""
FEED_DONE_SQL: Final = """
UPDATE ops.agent_feed SET status = %s, run_id = %s, llm_calls = %s, reason = %s, finished_at = %s, updated_at = %s
 WHERE disclosure_index = %s
"""
WAITING_SQL: Final = """
SELECT f.disclosure_index, f.run_id, a.status, a.expires_at, a.approved_notional_try, a.decision_comment
  FROM ops.agent_feed f JOIN trading.approvals a ON a.run_id = f.run_id
 WHERE f.status = 'waiting_approval' ORDER BY f.disclosure_index
"""
EXPIRE_CARD_SQL: Final = (
    "UPDATE trading.approvals SET status = 'expired' WHERE run_id = %s AND status IN ('pending', 'claimed')"
)
CLOSE_RUN_SQL: Final = "UPDATE trading.agent_runs SET status = 'completed', finished_at = %s WHERE run_id = %s"


@dataclass(frozen=True, slots=True)
class LiveDeps:
    provider: LLMProvider
    tools: Toolbox
    redis: Any = None  # SSE after commit; None = no events (tests, scripts)
    #: The gate reads the real desk (kaptan.risk.desk: marked equity, cash, R04/R09/R11/P7/P3/P4 inputs).
    #: None = only on the live LLM chain; replay runs keep the demo desk.
    live_desk: bool | None = None


@dataclass(frozen=True, slots=True)
class LiveResult:
    run_id: str
    feed_status: str  # done | waiting_approval
    outcome: str | None
    llm_calls: int
    explain: dict[str, Any]


def run_id_for(index: int) -> str:
    return f"{RUN_PREFIX}{index}"


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}


async def desk_for(
    conn: AsyncConnection[Any],
    ticker: str,
    *,
    live: bool = False,
    disclosure: DisclosureInput | None = None,
    now: datetime | None = None,
) -> DeskState:
    """Desk state as the demo builds it; a ticker outside core.issuers is outside the universe (pre-gate veto).
    `live`: equity, cash, P&L and the gate's freshness/exposure inputs from the real book (kaptan.risk.desk)."""
    try:
        issuer = await q.issuer(conn, ticker)
    except LookupError:
        issuer = {"in_universe": False, "price": 1, "adv20_try": 0, "free_float": 0}
    risk = await q.risk_state(conn)
    book = await q.book(conn, ticker)
    desk = DeskState(
        in_universe=bool(issuer["in_universe"]),
        last_price=Decimal(str(issuer["price"])),
        adv20_try=Decimal(str(issuer["adv20_try"])),
        free_float=float(issuer["free_float"]),
        equity_try=Decimal(str(DemoFixtures().meta["paper_equity_try"])),
        restrictions=tuple(Restriction(r["kind"], r["source_ref"]) for r in await q.restrictions(conn, ticker)),
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
    if not live:
        return desk
    from kaptan.risk.desk import live_desk

    at = now or datetime.now(UTC)
    d = disclosure
    real = await live_desk(
        conn,
        ticker,
        at,
        published_at=d.published_at if d else at,
        available_at=d.available_at if d else at,
        capital=get_settings().paper_capital_try,
    )
    return replace(
        desk,
        live=True,
        equity_try=real.equity_try,
        cash_free_try=real.cash_free_try,
        daily_pnl_pct=real.daily_pnl_pct,
        drawdown_pct=real.drawdown_pct,
        n_open_positions=real.n_open_positions,
        holds_ticker=real.holds_ticker,
        last_price=real.last_price or desk.last_price,
        price_age_s=real.price_age_s,
        restrictions_age_h=real.restrictions_age_h,
        kap_delay_s=real.kap_delay_s,
        daily_entries=real.daily_entries,
        sector_exposure_pct=real.sector_exposure_pct,
        group_exposure_pct=real.group_exposure_pct,
    )


async def build_live_context(
    conn: AsyncConnection[Any], index: int, deps: LiveDeps, now: datetime | None = None
) -> tuple[RunContext, dict[str, Any], list[dict[str, str]]]:
    disc = await q.disclosure(conn, index)
    texts = await q.texts(conn, index)
    text_tr = next((t["body"] for t in texts if t["lang"] == "tr"), None)
    ticker = disc["primary_ticker"]
    if text_tr is None or not ticker:
        raise LookupError(f"disclosure {index} has no TR text or ticker")
    run_id = run_id_for(index)
    d = DisclosureInput(
        run_id=run_id,
        disclosure_index=index,
        ticker=ticker,
        company_name=disc["company_name"],
        subject=disc["subject"],
        summary=disc["summary"],
        text_tr=text_tr,
        published_at=disc["published_at"],
        available_at=disc["available_at"],
        strategy_version=AUDIT_STRATEGY_VERSION,
        is_fixture=False,
        stored_classification=disc["classification"],
    )
    live = getattr(deps.provider, "name", "") == "live"
    tools = deps.tools
    if live:  # real prices + event study (kaptan.evidence); replay keeps the recorded tool answers
        from kaptan.evidence import toolbox_for

        tools = toolbox_for(conn, d, "live", base=deps.tools)
    ctx = RunContext(
        provider=deps.provider,
        tools=tools,
        disclosure=d,
        desk=await desk_for(
            conn, ticker, live=live if deps.live_desk is None else deps.live_desk, disclosure=d, now=now
        ),
        prompt_manifest_hash=str(DemoFixtures().meta["prompt_manifest_hash"]),
    )
    ctx = await with_active_limits(conn, ctx)  # FR-33: the limit version active now
    if live:  # "benzer geçmiş bildirimler" (kaptan.rag), as scenario.build_context does
        from kaptan.rag.agent_context import attach_similar

        ctx = await attach_similar(conn, ctx)
    # Reconcile/backfill rows may lack the list OID or a live first-seen time; the panel needs both.
    doc = q.list_item(
        {
            **disc,
            "run_id": run_id,
            "disclosure_oid": disc["disclosure_oid"] or "",
            "first_seen_at": disc["first_seen_at"] or disc["available_at"],
        }
    )
    return ctx, doc, texts


def _waiting_on_human(snapshot: Any) -> bool:
    return any(task.interrupts for task in snapshot.tasks)


async def prepare_tools(ctx: RunContext, values: dict[str, Any]) -> None:
    """A resumed run gets a fresh LiveToolbox: load its SQL results for the checkpointed event type
    first, or the nodes after the analysts (merge, rules, card) would read empty tools."""
    live = live_tools(ctx.tools)
    event_type = values.get("event_type")
    if live is not None and event_type:
        await live.prepare(str(event_type))


async def run_or_resume(ctx: RunContext, thread_id: str) -> KaptanState:
    """Fresh run, or continue a checkpointed one: mid-graph → from its last super-step, parked → as is."""
    graph = compile_graph()
    cfg = _config(thread_id)
    snapshot = await graph.aget_state(cfg)
    if not snapshot.values:
        await graph.ainvoke({"steps": [], "llm_calls": 0}, config=cfg, context=ctx)
    elif snapshot.next and not _waiting_on_human(snapshot):
        log.info("resuming %s from its checkpoint (next: %s)", thread_id, ", ".join(snapshot.next))
        await prepare_tools(ctx, dict(snapshot.values))
        await graph.ainvoke(None, config=cfg, context=ctx)
    snapshot = await graph.aget_state(cfg)
    return cast(KaptanState, dict(snapshot.values))


async def persist_live(
    conn: AsyncConnection[Any], explain: dict[str, Any], now: datetime, *, limits_version: int | None = None
) -> str:
    """Run, link, card, counters, audit outcome and the feed row in one transaction; returns the feed status."""
    run, disc, card = explain["run"], explain["disclosure"], explain["approval"]
    feed_status = "waiting_approval" if card is not None else "done"
    run_params = (
        run["run_id"],
        run["disclosure_index"],
        run["ticker"],
        run["company_name"],
        run["event_type"],
        KIND_OF.get(run["outcome"], "hold"),
        run["status"],
        run["outcome"],
        run["strategy_version"],
        q._ts(run["started_at"]),
        q._ts(run["finished_at"]),
        run["llm_calls"],
        run["tokens_in"],
        run["tokens_out"],
        run["latency_ms"],
        Jsonb(explain),
    )
    cls = disc["classification"]
    async with conn.transaction():
        await conn.execute(INSERT_RUN_SQL, run_params)
        await conn.execute(
            LINK_DISCLOSURE_SQL, (run["run_id"], None if cls is None else Jsonb(cls), run["disclosure_index"])
        )
        if card is not None and explain["proposal"] is not None:
            await q.upsert_proposal(conn, explain["proposal"], card)
        if run["llm_calls"]:
            tokens = run["tokens_in"] + run["tokens_out"]
            await conn.execute(q.ADD_CALLS_SQL, (istanbul_date(now), run["llm_calls"], tokens))
        draft = _audit_outcome(explain, now)
        if draft is not None:
            if limits_version is not None:  # which four-eyes limit version the gate used (FR-33)
                draft = replace(draft, payload={**draft.payload, "limits_version": limits_version})
            await append(conn, [draft], now=now)
        await conn.execute(
            FEED_DONE_SQL,
            (feed_status, run["run_id"], run["llm_calls"], run["outcome"], now, now, run["disclosure_index"]),
        )
    return feed_status


async def announce(redis: Any, conn: AsyncConnection[Any], explain: dict[str, Any], now: datetime) -> int:
    """The run's SSE events (node/crew/classification/card/done/counters) at once, after commit."""
    sent = 0
    for ev in plan(explain):
        data = ev.data
        if ev.event == "counters" and data is None:
            data = await day_counters(conn, now)
        elif ev.stamp:
            data = {**(data or {}), "at": iso_ms(now)}
        if await publish(redis, ev.stream, ev.event, data) is not None:
            sent += 1
    return sent


async def run_disclosure(conn: AsyncConnection[Any], index: int, now: datetime, deps: LiveDeps) -> LiveResult:
    """Build → run (or resume) → persist → usage → SSE. Raises on a missing text/ticker or a DB error."""
    ctx, doc, texts = await build_live_context(conn, index, deps, now)
    await conn.commit()  # no read snapshot held while the models answer
    state = await run_or_resume(ctx, ctx.disclosure.run_id)
    explain = assemble(state, ctx, doc, texts)
    feed_status = await persist_live(conn, explain, now, limits_version=ctx.limits_version)
    await sync_usage(conn, deps.provider)
    if deps.redis is not None:
        await announce(deps.redis, conn, explain, now)
        await conn.commit()
    run = explain["run"]
    return LiveResult(run["run_id"], feed_status, run["outcome"], int(run["llm_calls"]), explain)


def decision_for(row: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    """The resume value for a parked run, or None while the card is still open."""
    status = row["status"]
    if status == "approved":
        return {
            "decision": "approve",
            "approved_notional_try": row["approved_notional_try"],
            "comment": row["decision_comment"] or "",
        }
    if status == "rejected":
        return {"decision": "reject", "approved_notional_try": None, "comment": row["decision_comment"] or ""}
    if status in ("expired", "cancelled") or row["expires_at"] <= now:
        return {"decision": "expire"}
    return None


async def settle_one(conn: AsyncConnection[Any], row: dict[str, Any], decision: dict[str, Any], deps: LiveDeps,
                     now: datetime) -> bool:  # fmt: skip
    """Resume (or, without a checkpoint, just close) one parked run. Returns True if the graph resumed."""
    index, run_id = int(row["disclosure_index"]), str(row["run_id"])
    ctx, _doc, _texts = await build_live_context(conn, index, deps, now)
    await conn.commit()
    graph = compile_graph()
    snapshot = await graph.aget_state(_config(run_id))
    resumed = bool(snapshot.values) and _waiting_on_human(snapshot)
    if resumed:
        await prepare_tools(ctx, dict(snapshot.values))
        await graph.ainvoke(Command(resume=decision), config=_config(run_id), context=ctx)
    else:
        log.warning("run %s: no checkpoint to resume (in-memory saver restarted?); closing it", run_id)
    async with conn.transaction():
        if decision["decision"] == "expire":
            await conn.execute(EXPIRE_CARD_SQL, (run_id,))
        await conn.execute(CLOSE_RUN_SQL, (now, run_id))
        await conn.execute(
            "UPDATE ops.agent_feed SET status = 'done', reason = %s, finished_at = %s, updated_at = %s"
            " WHERE disclosure_index = %s",
            (decision["decision"] if resumed else f"{decision['decision']}:no_checkpoint", now, now, index),
        )
    return resumed


async def settle_waiting(pool: Any, deps: LiveDeps, now: datetime) -> int:
    """Close every parked run whose card was decided or has expired; returns how many were closed."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(WAITING_SQL)
            rows = [dict(r) for r in await cur.fetchall()]
        await conn.commit()
        closed = 0
        for row in rows:
            decision = decision_for(row, now)
            if decision is None:
                continue
            try:
                await settle_one(conn, row, decision, deps, now)
            except Exception:  # one broken run must not block the others
                log.exception("could not settle run %s", row["run_id"])
                await conn.rollback()
                continue
            closed += 1
    return closed
