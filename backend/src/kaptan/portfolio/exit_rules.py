"""Exit rules X1–X6 (06 §6), pure: one position's facts in, the rule that fires (if any) out.

Evaluated after each session's close (18:15+, EOD prices). Priority when several fire: X2 stop >
X3 negative news (N1) > X4 signal reversal > X1 time. X5 (kill switch) sells nothing: it hands the
positions to X1–X4. X6 (break-even) never sells; it raises the stop to the entry price once the
best close reached entry × (1 + 2 × stop_pct). No take-profit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

ExitRule = Literal["X1", "X2", "X3", "X4"]
PRIORITY: Final[tuple[ExitRule, ...]] = ("X2", "X3", "X4", "X1")
#: E2 reversal: insiders sold at least half of what the original purchase bought (06 §6 X4).
E2_REVERSAL_SHARE: Final = 0.5


@dataclass(frozen=True, slots=True)
class ExitFacts:
    event_type: str
    avg_cost: float
    stop_price: float | None
    stop_pct: float | None
    held_sessions: int  # sessions held, the entry session included
    hold_min: int
    hold_max: int
    last_close: float | None  # the evaluated session's raw close (None = no bar)
    max_close: float | None  # best raw close since entry
    same_type_event: bool  # a new E1/E2 of the same kind since entry → hold up to hold_max
    negative_news: str | None  # N1 trigger (restriction kind or avoid route), None = none
    reversal: str | None  # X4 trigger description, None = none


@dataclass(frozen=True, slots=True)
class ExitDecision:
    rule: ExitRule | None
    new_stop: float | None  # X6: the stop moved to break-even (None = unchanged)
    detail: str


def break_even_stop(f: ExitFacts) -> float | None:
    """X6: entry price as the new stop once max close ≥ entry × (1 + 2 × stop_pct); the stop only rises."""
    if f.stop_pct is None or f.max_close is None or f.stop_price is None:
        return None
    if f.stop_price >= f.avg_cost:
        return None
    if f.max_close >= f.avg_cost * (1 + 2 * f.stop_pct):
        return f.avg_cost
    return None


def hold_sessions(f: ExitFacts) -> int:
    """X1's N: the minimum hold, up to the maximum when a new same-type E1/E2 arrived."""
    if f.same_type_event and f.event_type in ("E1", "E2"):
        return max(f.hold_min, f.hold_max)
    return f.hold_min


def evaluate(f: ExitFacts) -> ExitDecision:
    """Which exit fires after this close. X1 fires the session before the N-th, so the SELL (approved
    during the N-th session) goes out in that session (SimBIST: its close)."""
    moved = break_even_stop(f)
    stop = moved if moved is not None else f.stop_price
    fired: dict[ExitRule, str] = {}
    if stop is not None and f.last_close is not None and f.last_close <= stop:
        fired["X2"] = f"close {f.last_close:.2f} <= stop {stop:.2f}"
    if f.negative_news is not None:
        fired["X3"] = f.negative_news
    if f.reversal is not None:
        fired["X4"] = f.reversal
    n = hold_sessions(f)
    if f.held_sessions >= n - 1:
        fired["X1"] = f"held {f.held_sessions} of {n} sessions"
    rule = next((r for r in PRIORITY if r in fired), None)
    return ExitDecision(rule=rule, new_stop=moved, detail=fired.get(rule, "") if rule else "")
