"""`LiveToolbox`: the agents' `Toolbox` on real prices and real past KAP events (LLM_MODE=live).

The graph's nodes are async but the `Toolbox` protocol is synchronous (merge and task_context read it
inline), so the Materiality and Evidence nodes first `await prepare(event_type)`: one locked pass of
point-in-time SQL whose results the sync accessors then serve. The merge node awaits
`prepare_merge` (E1/E2/E4 history, TCMB rate) and the rule engine `prepare_sizing` (kaptan.sizing:
entry, ATR stop, costs, shrunk edge); once tried, `sizing()` answers from the live sizer only (None →
HOLD), never from a fixture. What the tools do not compute (labels, recorded latencies) comes from
the base toolbox.

Replay mode never builds one (`toolbox_for` returns the base), so replay output stays byte-identical.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg.pq import TransactionStatus

from kaptan.agents.context import DisclosureInput
from kaptan.agents.tools import ReplayToolbox, Toolbox
from kaptan.evidence import card
from kaptan.evidence.market import MaterialityInputs, PriceContext
from kaptan.evidence.params import DEFAULT_HORIZONS
from kaptan.evidence.repo import Conn
from kaptan.evidence.service import ScopedStudy, load_price_context, scoped_study
from kaptan.market.features import MergeInputs, load_merge_inputs
from kaptan.sizing.load import load_sizing_inputs
from kaptan.sizing.plan import SizingPlan, Unknown, plan_sizing

log = logging.getLogger("kaptan.evidence")
EVENT_TYPES: Final = frozenset({"E1", "E2", "E3", "E4"})


class LiveToolbox:
    def __init__(self, conn: Conn, disclosure: DisclosureInput, base: Toolbox | None = None) -> None:
        self.conn = conn
        self.disclosure = disclosure
        self.base: Toolbox = base or ReplayToolbox()
        self._lock = asyncio.Lock()
        self._price_loaded = False
        self.price: tuple[PriceContext, MaterialityInputs] | None = None
        self.studies: dict[str, ScopedStudy | None] = {}
        self.event_type: str | None = None
        self.merge_inputs: MergeInputs | None = None
        self.sizing_plan: SizingPlan | Unknown | None = None
        self._sizing_tried = False

    @property
    def fp(self) -> str:
        return self.disclosure.fingerprint

    @asynccontextmanager
    async def _reads(self) -> AsyncIterator[None]:
        """Reads on the run's connection without leaving a transaction (or a broken one) behind."""
        if self.conn.info.transaction_status == TransactionStatus.IDLE:
            try:
                yield
            finally:
                await self.conn.rollback()  # read-only: release the snapshot
        else:
            async with self.conn.transaction():  # a savepoint inside the caller's transaction
                yield

    async def prepare(self, event_type: str | None) -> None:
        """Load the price context once and the event study of `event_type` once (idempotent)."""
        async with self._lock:
            d = self.disclosure
            if not self._price_loaded:
                self._price_loaded = True
                try:
                    async with self._reads():
                        self.price = await load_price_context(self.conn, d.ticker, d.published_at, d.published_at)
                except Exception:  # a tool failure is "unknown", never a crash (the rules then HOLD)
                    log.exception("price context failed for %s", d.run_id)
            if event_type in EVENT_TYPES:
                self.event_type = event_type
                if event_type not in self.studies:
                    self.studies[event_type] = None
                    try:
                        async with self._reads():
                            self.studies[event_type] = await scoped_study(
                                self.conn, event_type, d.ticker, d.published_at, d.disclosure_index, DEFAULT_HORIZONS
                            )
                    except Exception:
                        log.exception("event study failed for %s", d.run_id)

    async def prepare_merge(self, event_type: str, reader: Mapping[str, Any] | None) -> MergeInputs:
        """E1/E2 notices, E4 fundamentals and the E3 TCMB rate, known before `available_at` (once)."""
        if self.merge_inputs is None:
            d = self.disclosure
            inputs = MergeInputs()
            try:
                async with self._reads():
                    inputs = await load_merge_inputs(
                        self.conn,
                        ticker=d.ticker,
                        disclosure_index=d.disclosure_index,
                        published_at=d.published_at,
                        available_at=d.available_at,
                        event_type=event_type,
                        reader=reader,
                    )
            except Exception:  # unknown, never a crash: the rules then see no value
                log.exception("merge inputs failed for %s", d.run_id)
            self.merge_inputs = inputs
        return self.merge_inputs

    async def prepare_sizing(
        self, event_type: str, *, equity_try: Decimal, upper_limit: Decimal | None, t_dec: datetime, personal: bool
    ) -> SizingPlan | Unknown | None:
        """Run the live sizer once for this decision; afterwards `sizing()` serves its answer."""
        if not self._sizing_tried:
            self._sizing_tried = True
            d = self.disclosure
            try:
                async with self._reads():
                    inputs = await load_sizing_inputs(
                        self.conn,
                        ticker=d.ticker,
                        event_type=event_type,
                        t_pub=d.published_at,
                        t_dec=t_dec,
                        self_index=d.disclosure_index,
                    )
                self.sizing_plan = plan_sizing(
                    inputs, equity_try=equity_try, upper_limit=upper_limit, personal=personal
                )
            except Exception:
                log.exception("live sizing failed for %s", d.run_id)
            if isinstance(self.sizing_plan, Unknown):
                log.info("no live size for %s: %s", d.run_id, self.sizing_plan.reason)
        return self.sizing_plan

    # ── computed by the tools ────────────────────────────────────────────
    @property
    def study(self) -> ScopedStudy | None:
        return None if self.event_type is None else self.studies.get(self.event_type)

    def market_facts(self) -> dict[str, float]:
        pc, mi = self.price or (None, None)
        return card.market_facts(pc, mi)

    def features(self, fp: str) -> Mapping[str, Any] | None:
        if fp != self.fp:
            return self.base.features(fp)
        return card.merge_features(None if self.price is None else self.price[0])

    def evidence_store(self, fp: str) -> Mapping[str, Any] | None:
        if fp != self.fp:
            return self.base.evidence_store(fp)
        scoped = self.study
        return None if scoped is None else card.evidence_store(scoped)

    def prompt_view(self) -> Toolbox:
        """The same toolbox, but `features` answers with every market fact (for the Materiality prompt)."""
        return _FactsView(self)

    def sizing(self, fp: str) -> Mapping[str, Any] | None:
        """The live sizer's answer once `prepare_sizing` ran (None = unknown → HOLD)."""
        if fp != self.fp or not self._sizing_tried:
            return self.base.sizing(fp)
        plan = self.sizing_plan
        return plan.tool_doc() if isinstance(plan, SizingPlan) else None

    # ── not computed live: the base toolbox answers ──────────────────────

    def sub_type_label(self, fp: str) -> str | None:
        return self.base.sub_type_label(fp)

    def source_phrases(self, fp: str) -> list[Mapping[str, str]]:
        return self.base.source_phrases(fp)

    def node_latency_ms(self, fp: str, node: str) -> int | None:
        return self.base.node_latency_ms(fp, node)

    def run_usage(self, fp: str) -> Mapping[str, int] | None:
        return self.base.run_usage(fp)


class _FactsView:
    def __init__(self, live: LiveToolbox) -> None:
        self.live = live

    def features(self, fp: str) -> Mapping[str, Any] | None:
        return self.live.market_facts() if fp == self.live.fp else self.live.features(fp)

    def evidence_store(self, fp: str) -> Mapping[str, Any] | None:
        return self.live.evidence_store(fp)

    def sizing(self, fp: str) -> Mapping[str, Any] | None:
        return self.live.sizing(fp)

    def sub_type_label(self, fp: str) -> str | None:
        return self.live.sub_type_label(fp)

    def source_phrases(self, fp: str) -> list[Mapping[str, str]]:
        return self.live.source_phrases(fp)

    def node_latency_ms(self, fp: str, node: str) -> int | None:
        return self.live.node_latency_ms(fp, node)

    def run_usage(self, fp: str) -> Mapping[str, int] | None:
        return self.live.run_usage(fp)


def toolbox_for(conn: Conn, disclosure: DisclosureInput, llm_mode: str, base: Toolbox | None = None) -> Toolbox:
    """The toolbox of one run: live tools for a real disclosure in LLM_MODE=live, else `base` (replay).

    Demo fixtures keep their recorded tool answers even in live mode: their prices do not exist."""
    fallback = base or ReplayToolbox()
    if llm_mode != "live" or disclosure.is_fixture:
        return fallback
    return LiveToolbox(conn, disclosure, fallback)


def live_tools(tools: Toolbox) -> LiveToolbox | None:
    return tools if isinstance(tools, LiveToolbox) else None
