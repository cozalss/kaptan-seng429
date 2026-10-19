"""Parameters of the live sizer, one place, each with its 06 section (06 §13 `config/rules-v1.0.yaml`).

Frozen: a change is a new strategy version (06 §13 "değişiklik = yeni sürüm + 4 göz onayı").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time, timedelta
from decimal import Decimal
from typing import Final


@dataclass(frozen=True, slots=True)
class StopRule:
    """06 §6.1: stop_pct = clamp(k × ATR20 / entry, lo, hi)."""

    k: Decimal
    lo: Decimal
    hi: Decimal


def _stops() -> dict[str, StopRule]:
    return {
        "E1": StopRule(Decimal("2.5"), Decimal("0.05"), Decimal("0.12")),
        "E2": StopRule(Decimal("2.5"), Decimal("0.05"), Decimal("0.12")),
        "E3": StopRule(Decimal("2.0"), Decimal("0.04"), Decimal("0.06")),
        "E4": StopRule(Decimal("2.0"), Decimal("0.04"), Decimal("0.08")),
    }


@dataclass(frozen=True, slots=True)
class SizingParams:
    # §6.1 stops (close-based ATR, 20 sessions)
    stops: dict[str, StopRule] = field(default_factory=_stops)
    atr_window: int = 20
    min_window_obs: int = 15  # fewer bars than this in a 20-session window → unknown
    # §7.1 sizing; §7.2 P2 (position), P10 (volume)
    risk_per_trade: Decimal = Decimal("0.005")
    max_pos: Decimal = Decimal("0.10")
    max_adv: Decimal = Decimal("0.01")
    m_evidence: dict[str, Decimal] = field(
        default_factory=lambda: {"E1": Decimal(1), "E2": Decimal(1), "E3": Decimal("0.5"), "E4": Decimal("0.7")}
    )
    precedent_min_n: int = 5  # §3.3 precedent_ok: fewer firm precedents → m_evidence × 0.5 (E3)
    precedent_fallback_mult: Decimal = Decimal("0.5")
    # §8.1 costs (per side) — base SimBIST scenario (Revizyon 3)
    c_broker: Decimal = Decimal("0.0005")
    bsmv: Decimal = Decimal("0.05")
    exchange_fee: Decimal = Decimal("0.000025")
    clearing_fee: Decimal = Decimal("0.0000004")
    impact_y: Decimal = Decimal("0.7")
    manual_slippage: Decimal = Decimal("0.0005")  # personal mode only
    floor_round_trip: Decimal = Decimal("0.003")
    # §8.2 expected edge
    shrink_k: int = 20
    haircut: Decimal = Decimal("0.5")
    horizon: dict[str, int] = field(default_factory=lambda: {"E1": 20, "E2": 20, "E3": 5, "E4": 5})
    # §3.1–§3.4 holding periods [min, max] (sessions)
    holding: dict[str, tuple[int, int]] = field(
        default_factory=lambda: {"E1": (20, 40), "E2": (20, 60), "E3": (5, 5), "E4": (5, 10)}
    )
    # §5 entry
    limit_markup: Decimal = Decimal("1.02")
    intraday_min_delay: timedelta = timedelta(minutes=15)
    intraday_max_move: Decimal = Decimal("0.04")
    near_limit: Decimal = Decimal("0.01")  # R09 near_limit: an intraday buy this close to the ceiling waits


DEFAULT_SIZING: Final = SizingParams()

#: §5 windows (Istanbul): pre-open ≤ 09:30; 09:30–09:55 the open is still reachable; continuous
#: trading 10:00–17:30 (E3 may enter intraday); 17:30–18:10 → next open; later → next session.
PRE_OPEN_END: Final = time(9, 30)
AUCTION_END: Final = time(9, 55)  # opening auction order collection 09:40–09:55 (06 §13)
CONTINUOUS_START: Final = time(10, 0)
LATE_START: Final = time(17, 30)
SESSION_END: Final = time(18, 10)
