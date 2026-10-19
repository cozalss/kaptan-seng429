"""Price context and materiality inputs of one ticker as of the disclosure (05 MarketSnapshot, 06 §4).

Pure functions over what `repo` loaded; everything is as known strictly before `as_of`:
- levels (last close, market cap, capital) are raw İş Yatırım values of the last known session (P8);
- returns, volatility and run-ups use the adjusted series (P8);
- turnover is İş Yatırım TL turnover (`kaptan.prices.adv`, the 20 sessions up to the last known one);
- corporate actions: ex-dates in the last 20 sessions, and announced future ones (announced < as_of).
A value the data cannot give is None and its name is listed in `unknown`, never a guess.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from kaptan.evidence.params import (
    LEAK_SESSIONS,
    MIN_VOL_OBS,
    RECENT_ACTION_SESSIONS,
    RET_3M_SESSIONS,
    RETURN_LOOKBACKS,
    RUNUP_SESSIONS,
    VOL_WINDOW,
)
from kaptan.evidence.study import Series, close_return
from kaptan.prices.calendar import add_sessions, prev_session


@dataclass(frozen=True, slots=True)
class ActionFlag:
    ex_date: date
    kind: str
    factor: float


@dataclass(frozen=True, slots=True)
class PriceContext:
    ticker: str
    as_of: datetime
    session: date  # last session whose close was known before as_of
    last_close_try: Decimal | None
    returns: dict[int, float | None]  # look-back sessions → adjusted return
    ret_3m: float | None
    vol_20d: float | None  # sample sd of daily adjusted returns (not annualised)
    adv20_try: Decimal | None
    ret_5d_mkt_adj: float | None  # 06 §4 leakage: [−5, −1] vs XU100
    ret_10d_mkt_adj: float | None  # 06 §4 E4 run-up: [−10, −1] vs XU100
    recent_actions: tuple[ActionFlag, ...] = ()
    upcoming_actions: tuple[ActionFlag, ...] = ()

    @property
    def flags(self) -> dict[str, bool]:
        kinds = {a.kind for a in self.recent_actions}
        return {
            "recent_bonus_or_split": bool(kinds & {"bedelsiz", "split"}),
            "recent_rights_issue": "bedelli" in kinds,
            "recent_dividend": "temettu" in kinds,
            "upcoming_corporate_action": bool(self.upcoming_actions),
        }


@dataclass(frozen=True, slots=True)
class MaterialityInputs:
    """Denominators 06 §3.3 names; annual revenue needs financial statements, which we do not store yet."""

    market_cap_try: Decimal | None
    free_float_mcap_try: Decimal | None
    paid_in_capital_try: Decimal | None
    annual_revenue_try: Decimal | None = None
    unknown: tuple[str, ...] = field(default=())


def _ratio(series: Series, end: date, start: date) -> float | None:
    a, b = series.get(start), series.get(end)
    if a is None or b is None or a.close <= 0:
        return None
    return b.close / a.close - 1


def lookback_return(series: Series, end: date, sessions: int) -> float | None:
    return _ratio(series, end, add_sessions(end, -sessions))


def market_adjusted_runup(stock: Series, bench: Series, end: date, sessions: int) -> float | None:
    """Π(1 + R_i) − Π(1 + R_XU100) over the `sessions` sessions ending at `end` (06 §4)."""
    rs, rb = lookback_return(stock, end, sessions), lookback_return(bench, end, sessions)
    if rs is None or rb is None:
        return None
    return rs - rb


def volatility(series: Series, end: date, window: int = VOL_WINDOW) -> float | None:
    rets: list[float] = []
    d = end
    for _ in range(window):
        r = close_return(series, d)
        if r is not None:
            rets.append(r)
        d = prev_session(d)
    if len(rets) < MIN_VOL_OBS:
        return None
    mean = math.fsum(rets) / len(rets)
    return math.sqrt(math.fsum((r - mean) ** 2 for r in rets) / (len(rets) - 1))


def split_actions(
    rows: Sequence[Mapping[str, Any]], session: date, as_of: datetime
) -> tuple[tuple[ActionFlag, ...], tuple[ActionFlag, ...]]:
    """(recent, upcoming): ex-dates in (session − 20, session], and later ones announced before as_of."""
    lo = add_sessions(session, -RECENT_ACTION_SESSIONS)
    recent, upcoming = [], []
    for r in rows:
        flag = ActionFlag(r["ex_date"], str(r["kind"]), float(r["factor"]))
        if lo < r["ex_date"] <= session:
            recent.append(flag)
        elif r["ex_date"] > session and r.get("announced_at") is not None and r["announced_at"] < as_of:
            upcoming.append(flag)
    return tuple(recent), tuple(upcoming)


def price_context(
    ticker: str,
    as_of: datetime,
    session: date,
    event_session: date,
    stock: Series,
    bench: Series,
    *,
    last_raw: Mapping[str, Any] | None,
    adv20_try: Decimal | None,
    actions: Sequence[Mapping[str, Any]] = (),
) -> PriceContext:
    # The run-up window ends the session before the event session, but never after the last known close.
    leak_end = min(prev_session(event_session), session)
    recent, upcoming = split_actions(actions, session, as_of)
    return PriceContext(
        ticker=ticker,
        as_of=as_of,
        session=session,
        last_close_try=None if last_raw is None else last_raw["close"],
        returns={k: lookback_return(stock, session, k) for k in RETURN_LOOKBACKS},
        ret_3m=lookback_return(stock, session, RET_3M_SESSIONS),
        vol_20d=volatility(stock, session),
        adv20_try=adv20_try,
        ret_5d_mkt_adj=market_adjusted_runup(stock, bench, leak_end, LEAK_SESSIONS),
        ret_10d_mkt_adj=market_adjusted_runup(stock, bench, leak_end, RUNUP_SESSIONS),
        recent_actions=recent,
        upcoming_actions=upcoming,
    )


def materiality_inputs(last_raw: Mapping[str, Any] | None) -> MaterialityInputs:
    row = last_raw or {}
    values = {
        "market_cap_try": row.get("mcap_try"),
        "free_float_mcap_try": row.get("free_float_mcap_try"),
        "paid_in_capital_try": row.get("capital_try"),
    }
    unknown = (*(k for k, v in values.items() if v is None), "annual_revenue_try")
    return MaterialityInputs(**values, unknown=unknown)
