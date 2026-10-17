"""Run-time context of one graph run (LangGraph `context_schema`): providers, desk state, parameters.

Nothing here is checkpointed; the state (agents/state.py) holds only JSON-able documents.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from kaptan.agents.tools import Toolbox
from kaptan.llm.provider import LLMProvider
from kaptan.llm.replay import fingerprint
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


@dataclass(frozen=True, slots=True)
class RunContext:
    provider: LLMProvider
    tools: Toolbox
    disclosure: DisclosureInput
    desk: DeskState
    params: RuleParams = DEFAULT_PARAMS
    limits: GateLimits = field(default_factory=GateLimits)
    prompt_manifest_hash: str = ""
