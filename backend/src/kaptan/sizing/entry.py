"""Entry timing (06 §5): which session's order, auction or continuous trading. Pure.

t_pub (Istanbul, trading day d)   E1 / E2 / E4                       E3
d−1 18:10 → d 09:30               d opening auction                  same
d 09:30 → 09:55                   d auction if decided before 09:55, else d continuous trading (same)
d 09:55 → 17:30                   d+1 opening auction                d continuous if P_now/P_pre − 1 < 4 %
                                                                     (order from t_pub + 15 min), else d+1 auction
d 17:30 → 18:10                   d+1 opening auction                same
holiday / weekend / after 18:10   next session's opening auction     same

A decision that comes after its window (the auction collected at 09:55, continuous trading over at
18:00) is "missed" (None): orders are never chased (06 §5 "fiyat kovalamak yok"). An E3 entered at the
next auction keeps the gap rule (`Open/Close − 1 < 4 %` or a limit-up close), checked at send time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from kaptan.prices.calendar import IST, is_trading_day, next_session
from kaptan.sizing.params import (
    AUCTION_END,
    DEFAULT_SIZING,
    LATE_START,
    PRE_OPEN_END,
    SESSION_END,
    SizingParams,
)

Entry = Literal["next_open_auction", "intraday_limit"]
CONTINUOUS_END = time(18, 0)


@dataclass(frozen=True, slots=True)
class EntryPlan:
    entry: Entry
    session: date  # the session the order is for
    rule: str  # which §5 row applied (trace / tests)
    not_before: datetime | None = None  # intraday: earliest order time (t_pub + 15 min)


def _local(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    return ts.astimezone(IST)


def intraday_move(p_pre: Decimal | None, p_now: Decimal | None) -> Decimal | None:
    if p_pre is None or p_now is None or p_pre <= 0:
        return None
    return p_now / p_pre - 1


def _choose(
    event_type: str,
    t_pub: datetime,
    t_dec: datetime,
    move: Decimal | None,
    near_upper: bool,
    p: SizingParams,
) -> EntryPlan:
    pub, dec = _local(t_pub), _local(t_dec)
    d, t = pub.date(), pub.time()
    if not is_trading_day(d) or t > SESSION_END:
        return EntryPlan("next_open_auction", next_session(d), "after_close")
    if t <= PRE_OPEN_END:
        return EntryPlan("next_open_auction", d, "pre_open")
    if t <= AUCTION_END:
        if dec.date() == d and dec.time() < AUCTION_END:
            return EntryPlan("next_open_auction", d, "auction_reachable")
        return EntryPlan("intraday_limit", d, "auction_missed_continuous")
    if t < LATE_START and event_type == "E3":
        calm = move is not None and move < p.intraday_max_move
        if calm and not near_upper:
            return EntryPlan("intraday_limit", d, "e3_intraday", t_pub + p.intraday_min_delay)
        return EntryPlan("next_open_auction", next_session(d), "e3_moved_next_open")
    return EntryPlan("next_open_auction", next_session(d), "next_open")


def entry_plan(
    event_type: str,
    t_pub: datetime,
    t_dec: datetime,
    *,
    p_pre: Decimal | None = None,
    p_now: Decimal | None = None,
    near_upper: bool = False,
    params: SizingParams = DEFAULT_SIZING,
) -> EntryPlan | None:
    """The §5 entry for a decision at `t_dec`, or None when its window has already passed (missed)."""
    plan = _choose(event_type, t_pub, t_dec, intraday_move(p_pre, p_now), near_upper, params)
    dec = _local(t_dec)
    if plan.entry == "next_open_auction":
        deadline = datetime.combine(plan.session, AUCTION_END, IST)
    else:
        deadline = datetime.combine(plan.session, CONTINUOUS_END, IST)
    return None if dec >= deadline else plan
