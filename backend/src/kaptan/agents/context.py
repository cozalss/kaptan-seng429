"""Run-time context of one graph run (LangGraph `context_schema`): providers, desk state, parameters.

Nothing here is checkpointed; the state (agents/state.py) holds only JSON-able documents.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import Decimal
from typing import Any

from kaptan.agents.tools import Toolbox
from kaptan.llm.provider import LLMProvider
from kaptan.llm.replay import fingerprint
from kaptan.rag.types import SimilarDisclosure
from kaptan.risk.gate import GateLimits
from kaptan.rules.params import DEFAULT_PARAMS, RuleParams


@dataclass(frozen=True, slots=True)
class DisclosureInput:
    """The disclosure as stored in core.disclosures (+ its TR text), re-timed for this run."""

    run_id: str
    disclosure_index: int
    ticker: str
    company_name: str
    subject: str
    summary: str
    text_tr: str
    published_at: datetime
    available_at: datetime
    strategy_version: str
    is_fixture: bool
    stored_classification: dict[str, Any] | None = None

    @property
    def fingerprint(self) -> str:
        return fingerprint(self.ticker, self.text_tr)


@dataclass(frozen=True, slots=True)
class Restriction:
    kind: str
    source_ref: str | None


@dataclass(frozen=True, slots=True)
class DeskState:
    """What the pre-gate and the risk gate read (06 §10): issuer, lists, risk state, book."""

    in_universe: bool
    last_price: Decimal
    adv20_try: Decimal
    free_float: float
    equity_try: Decimal
    restrictions: tuple[Restriction, ...] = ()
    kill_switch_on: bool = False
    halted_today: bool = False
    daily_pnl_pct: Decimal = Decimal(0)
    drawdown_pct: Decimal = Decimal(0)
    regime: str = "normal"
    n_open_positions: int = 0
    holds_ticker: bool = False
    quota_ok: bool = True
    mode: str = "paper"
    live_armed: bool = False
    #: Live desk inputs (kaptan.risk.desk; set only for real runs, the demo keeps these defaults).
    live: bool = False
    cash_free_try: Decimal | None = None  # None: the equity (the demo's M1 behaviour)
    restrictions_age_h: float = 0.0
    kap_delay_s: float = 0.0
    price_age_s: float = 0.0
    daily_entries: int = 0
    sector_exposure_pct: Decimal = Decimal(0)
    group_exposure_pct: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class RunContext:
    provider: LLMProvider
    tools: Toolbox
    disclosure: DisclosureInput
    desk: DeskState
    params: RuleParams = DEFAULT_PARAMS
    limits: GateLimits = field(default_factory=GateLimits)
    #: The trading.limit_versions version `limits` came from (None: canonical defaults).
    limits_version: int | None = None
    prompt_manifest_hash: str = ""
    #: "Benzer geçmiş bildirimler" (kaptan.rag, LLM_MODE=live only; empty in replay so replay stays
    #: byte-identical): earlier disclosures by hybrid search, `published_at < as_of`, with citations.
    similar: tuple[SimilarDisclosure, ...] = ()
    #: Regulation paragraphs in force at the decision time for the compliance agent (kaptan.rag.bases,
    #: LLM_MODE=live only; empty in replay). Trusted text from backend/data/regulation (M3 B3).
    regulation: tuple[dict[str, Any], ...] = ()

    def similar_context(self) -> list[dict[str, Any]]:
        """The TASK_CONTEXT rows of `similar` (ids, dates, codes; never the untrusted snippet text)."""
        return [s.as_context() for s in self.similar]


async def with_active_limits(conn: Any, ctx: RunContext) -> RunContext:
    """`ctx` with the limit version that is active now (FR-33: an approved change applies to the next run)."""
    from kaptan.risk.active_limits import active_limits

    active = await active_limits(conn)
    return replace(ctx, limits=active.limits, limits_version=active.version)
