"""The universe rules U1–U8 (06 §2) as one pure function, using the BIST price-tick table of
`kaptan.market.ticks` (U6, the one source of truth for ticks).

    verdict = evaluate(UniverseInputs(...), UNIVERSE_PARAMS)
    verdict.eligible, verdict.reasons            # ('U2', 'U4') = the rules that failed
    verdict.checks                               # every rule's inputs and result (stored as JSONB)

A rule whose input is unknown fails, except U1 (market): BIST's market list is not in our sources
yet, so an unknown market passes and is reported as `unknown` (Alt Pazar / YİP / GİP shares rarely
pass U2 and U4 anyway, and every market change BIST announces on KAP is tracked).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Final

from kaptan.market.ticks import tick_size as tick_size  # re-exported: U6 uses the one tick table

RULE_VERSION: Final = "universe.v1"

#: Markets U1 excludes (06 §2): Alt Pazar, Yakın İzleme Pazarı, GİP, Nitelikli Yatırımcı, PÖİP.
EXCLUDED_MARKETS: Final = frozenset({"alt", "yip", "gip", "nitelikli", "poip"})
KNOWN_MARKETS: Final = frozenset({"yildiz", "ana"}) | EXCLUDED_MARKETS


@dataclass(frozen=True, slots=True)
class UniverseParams:
    """06 §2 thresholds ([K] = canonical)."""

    adv20_min_try: Decimal = Decimal(50_000_000)  # U2: median TL turnover of the last 20 sessions
    free_float_min: Decimal = Decimal("0.25")  # U3
    ff_mcap_min_try: Decimal = Decimal(1_500_000_000)  # U4
    history_min_sessions: int = 250  # U5
    tick_ratio_max: Decimal = Decimal("0.0025")  # U6
    restriction_lookback_sessions: int = 20  # U7
    adv_window: int = 20


UNIVERSE_PARAMS: Final = UniverseParams()


@dataclass(frozen=True, slots=True)
class UniverseInputs:
    """What the rules read for one ticker on one day (all known before that day's 08:30)."""

    ticker: str
    price_try: Decimal | None
    adv20_median_try: Decimal | None
    mcap_try: Decimal | None
    ff_mcap_try: Decimal | None
    history_sessions: int
    market: str | None
    is_share: bool
    restricted_recently: tuple[str, ...] = ()  # kinds of measures active in the look-back window

    @property
    def free_float(self) -> Decimal | None:
        if self.mcap_try is None or self.ff_mcap_try is None or self.mcap_try <= 0:
            return None
        return self.ff_mcap_try / self.mcap_try


@dataclass(frozen=True, slots=True)
class Verdict:
    eligible: bool
    reasons: tuple[str, ...]
    checks: dict[str, Any] = field(default_factory=dict)
    tick: Decimal | None = None


def _num(x: Decimal | None) -> float | None:
    return None if x is None else float(x)


def _at_least(value: Decimal | None, floor: Decimal) -> bool:
    return value is not None and value >= floor


def evaluate(x: UniverseInputs, p: UniverseParams = UNIVERSE_PARAMS) -> Verdict:
    tick = None if x.price_try is None or x.price_try <= 0 else tick_size(x.price_try)
    tick_ratio = None if tick is None or x.price_try is None else tick / x.price_try
    market_ok = x.market is None or x.market not in EXCLUDED_MARKETS
    results: dict[str, tuple[bool, dict[str, Any]]] = {
        "U1": (market_ok, {"market": x.market or "unknown"}),
        "U2": (_at_least(x.adv20_median_try, p.adv20_min_try), {"adv20_median_try": _num(x.adv20_median_try)}),
        "U3": (_at_least(x.free_float, p.free_float_min), {"free_float": _num(x.free_float)}),
        "U4": (_at_least(x.ff_mcap_try, p.ff_mcap_min_try), {"ff_mcap_try": _num(x.ff_mcap_try)}),
        "U5": (x.history_sessions >= p.history_min_sessions, {"history_sessions": x.history_sessions}),
        "U6": (
            tick_ratio is not None and tick_ratio <= p.tick_ratio_max,
            {"tick": _num(tick), "tick_ratio": _num(tick_ratio)},
        ),
        "U7": (not x.restricted_recently, {"measures": sorted(set(x.restricted_recently))}),
        "U8": (x.is_share, {"is_share": x.is_share}),
    }
    reasons = tuple(code for code, (ok, _) in results.items() if not ok)
    checks = {code: {"pass": ok, **inputs} for code, (ok, inputs) in results.items()}
    return Verdict(eligible=not reasons, reasons=reasons, checks=checks, tick=tick)
