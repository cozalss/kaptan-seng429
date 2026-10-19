"""Execution configuration: `config/trading.yaml` (K1 + cost model + hard cap) and the process's settings.

`install(settings)` is called once by the API's lifespan; until then `current()` is the DEMO_MODE
configuration, so code that runs without the app (tests, scripts) keeps the M1 demo behaviour.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from decimal import Decimal
from functools import cache
from pathlib import Path
from typing import Any, Final, Literal

import yaml

from kaptan.settings import BACKEND_DIR, Settings

TRADING_FILE: Final = BACKEND_DIR / "config" / "trading.yaml"
#: The personal account the tickets size for (12 §4); KAPTAN_PERSONAL_ACCOUNT_TRY overrides it.
DEFAULT_PERSONAL_ACCOUNT_TRY: Final = Decimal(350_000)


@dataclass(frozen=True, slots=True)
class Costs:
    """06 §8.1 per-side cost model (base scenario)."""

    c_broker: Decimal = Decimal("0.0005")
    bsmv: Decimal = Decimal("0.05")
    fees_side: Decimal = Decimal("0.0000254")
    slip_floor_bps: Decimal = Decimal(5)
    impact_y: Decimal = Decimal("0.7")
    default_half_spread: Decimal = Decimal("0.001")
    window: int = 20
    price_limit_pct: Decimal = Decimal("0.10")


@dataclass(frozen=True, slots=True)
class TradingConfig:
    mode: Literal["paper", "live"] = "paper"
    costs: Costs = field(default_factory=Costs)
    hard_cap_try: Decimal | None = None


@dataclass(frozen=True, slots=True)
class ExecConfig:
    """What the order path needs to know about this process."""

    demo_mode: bool = True
    trading: TradingConfig = field(default_factory=TradingConfig)
    #: K2: KAPTAN_LIVE_ENABLED=true on the production host only.
    live_env_enabled: bool = False
    #: KAPTAN_MODE=live also asks for live (besides trading.yaml `mode: live`).
    mode_live: bool = False
    personal_account_try: Decimal = DEFAULT_PERSONAL_ACCOUNT_TRY
    #: Paper capital when there is no P&L series yet (risk.book uses the same setting).
    paper_capital_try: Decimal = Decimal(1_000_000)

    @property
    def live_requested(self) -> bool:
        return self.trading.mode == "live" or self.mode_live


def _dec(value: Any, default: Decimal) -> Decimal:
    return default if value is None else Decimal(str(value))


def parse_trading(raw: dict[str, Any]) -> TradingConfig:
    """trading.yaml → TradingConfig; unknown keys are ignored, a bad mode is an error."""
    mode = raw.get("mode", "paper")
    if mode not in ("paper", "live"):
        raise ValueError(f"trading.yaml: mode must be paper or live, not {mode!r}")
    c = raw.get("costs") or {}
    base = Costs()
    costs = Costs(
        c_broker=_dec(c.get("c_broker"), base.c_broker),
        bsmv=_dec(c.get("bsmv"), base.bsmv),
        fees_side=_dec(c.get("fees_side"), base.fees_side),
        slip_floor_bps=_dec(c.get("slip_floor_bps"), base.slip_floor_bps),
        impact_y=_dec(c.get("impact_y"), base.impact_y),
        default_half_spread=_dec(c.get("default_half_spread"), base.default_half_spread),
        window=int(c.get("window", base.window)),
        price_limit_pct=_dec(c.get("price_limit_pct"), base.price_limit_pct),
    )
    cap = raw.get("hard_cap_try")
    return TradingConfig(mode=mode, costs=costs, hard_cap_try=None if cap is None else Decimal(str(cap)))


@cache
def load_trading(path: Path = TRADING_FILE) -> TradingConfig:
    if not path.exists():
        return TradingConfig()
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return parse_trading(raw)


def from_settings(settings: Settings) -> ExecConfig:
    return ExecConfig(
        demo_mode=settings.demo_mode,
        trading=load_trading(),
        live_env_enabled=settings.kaptan_live_enabled,
        mode_live=getattr(settings, "kaptan_mode", "paper") == "live",
        personal_account_try=Decimal(str(settings.personal_account_try)),
        paper_capital_try=Decimal(str(getattr(settings, "paper_capital_try", 1_000_000))),
    )


_STATE: dict[str, ExecConfig] = {}


def install(config: ExecConfig | Settings) -> ExecConfig:
    """Set this process's execution config (the API lifespan does it at startup)."""
    cfg = config if isinstance(config, ExecConfig) else from_settings(config)
    _STATE["current"] = cfg
    return cfg


def reset() -> None:
    _STATE.pop("current", None)


def current() -> ExecConfig:
    return _STATE.get("current") or ExecConfig()


def with_overrides(**changes: Any) -> ExecConfig:
    """Tests: the current config with some fields replaced (not installed)."""
    return replace(current(), **changes)
