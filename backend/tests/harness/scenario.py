"""`run_scenario()`: a recorded disclosure goes through the real graph (replay LLM) and lands in Postgres.

Called outside any transaction; this module commits its own. Steps: load the recorded row + desk state → run the
graph (interrupts at `approval` for a proposal) → one transaction: disclosure visible and re-timed to now,
agent_runs.explain, proposal + pending card, LLM usage counters (first injection only), the audit outcome.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.pq import TransactionStatus

from kaptan.agents import db as q
from kaptan.agents.context import DeskState, DisclosureInput, Restriction, RunContext, with_active_limits
from kaptan.agents.explain import assemble
from kaptan.agents.run_rows import write_run_rows
from kaptan.agents.runner import AUDIT_STRATEGY_VERSION, audit_outcome, resume_graph, run_graph
from kaptan.agents.tools import Toolbox
from kaptan.audit.writer import append
from kaptan.clock import Clock, istanbul_date
from kaptan.eval.manifest import graph_version
from kaptan.llm.provider import LLMProvider
from kaptan.llm.usage import sync_usage
from kaptan.risk.cooldown import cooldown_active
from tests.harness.fixtures import DemoFixtures
from tests.harness.replay import ReplayProvider, ReplayToolbox

RUN_SCENARIOS: Final = frozenset({"e3_contract", "redteam_injection", "restricted_r04"})
#: KAP → our poller: a disclosure is seen 21 s after it is published (the mock's first_seen_at).
SEEN_AFTER: Final = timedelta(seconds=21)
RECORDED_RUN_SQL: Final = """
SELECT run_id, disclosure_index, ticker, company_name, strategy_version, is_fixture, injected_at
  FROM trading.agent_runs WHERE scenario = %s AND run_set = 'demo' ORDER BY run_id LIMIT 1
"""


@dataclass(frozen=True, slots=True)
class ScenarioResult:
    scenario: str
    run_id: str
    disclosure_index: int
    explain: dict[str, Any]
    first_injection: bool


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
        in_cooldown=await cooldown_active(conn, d.ticker, now),
    )
    ctx = RunContext(
        provider=provider,
        tools=tools,
        disclosure=d,
        desk=desk,
        # the recorded runs carry meta.json's value; a live chain is stamped with the real graph version
        prompt_manifest_hash=graph_version()
        if getattr(provider, "name", "") == "live"
        else str(meta["prompt_manifest_hash"]),
    )
    ctx = await with_active_limits(conn, ctx)  # FR-33: v1 = the canonical defaults; a signed change applies here
    if getattr(provider, "name", "") == "live":  # kaptan.rag: "benzer geçmiş bildirimler", never in replay
        from kaptan.rag.agent_context import attach_similar

        ctx = await attach_similar(conn, ctx)
    return ctx, q.list_item(disc), texts


async def persist(
    conn: AsyncConnection[Any], explain: dict[str, Any], now: datetime, first: bool, *, manifest_hash: str = ""
) -> None:
    run, disc, card = explain["run"], explain["disclosure"], explain["approval"]
    async with conn.transaction():
        await q.show_disclosure(conn, disc)
        await q.update_run(conn, run, explain, now)
        if card is not None and explain["proposal"] is not None:
            await q.upsert_proposal(conn, explain["proposal"], card)
        if first:
            await q.add_usage(conn, istanbul_date(now), run["llm_calls"], run["tokens_in"] + run["tokens_out"])
        draft = audit_outcome(explain, now)
        if draft is not None:
            await append(conn, [draft], now=now)
        await write_run_rows(conn, explain, manifest_hash)  # FR-19: per-node outputs + gate checks


async def recorded_run(conn: AsyncConnection[Any], scenario: str) -> dict[str, Any]:
    """The recorded run row of one scenario."""
    async with conn.cursor() as cur:
        await cur.execute(RECORDED_RUN_SQL, (scenario,))
        row = await cur.fetchone()
    if row is None:
        raise LookupError(f"no recorded run for scenario {scenario}")
    return dict(row)


async def run_scenario(
    conn: AsyncConnection[Any],
    scenario: str,
    clock: Clock,
    *,
    provider: LLMProvider | None = None,
    tools: Toolbox | None = None,
) -> ScenarioResult:
    """Run one recorded scenario (e3_contract | redteam_injection | restricted_r04) through the pipeline."""
    if scenario not in RUN_SCENARIOS:
        raise ValueError(f"not a pipeline scenario: {scenario}")
    if conn.info.transaction_status != TransactionStatus.IDLE:  # never run inside someone's transaction
        await conn.commit()
    run = await recorded_run(conn, scenario)
    first = run["injected_at"] is None
    now = _ms(clock.now())
    llm = provider or ReplayProvider()
    ctx, disc_doc, texts = await build_context(conn, run, now, provider=llm, tools=tools or ReplayToolbox())
    await conn.commit()  # release the read snapshot before the graph runs
    state = await run_graph(ctx, thread_id=f"{run['run_id']}@{now.isoformat()}")
    explain = assemble(state, ctx, disc_doc, texts)
    await persist(conn, explain, now, first, manifest_hash=ctx.prompt_manifest_hash)
    await sync_usage(conn, llm)  # live mode: per-call usage rows + real quota counters (no-op in replay)
    return ScenarioResult(scenario, run["run_id"], int(run["disclosure_index"]), explain, first)


__all__ = ["AUDIT_STRATEGY_VERSION", "ScenarioResult", "build_context", "resume_graph", "run_graph", "run_scenario"]
