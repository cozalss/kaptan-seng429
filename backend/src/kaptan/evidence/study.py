"""The event study itself (06 §12.2–12.4), as pure functions over adjusted daily series.

    R_i,t = α_i + β_i · R_XU100,t + ε_i,t        estimated over [−250, −30] sessions (≥ 120 returns,
                                                  else market-adjusted α = 0, β = 1)
    AR_i,t = R_i,t − (α̂_i + β̂_i · R_XU100,t)
    CAR_i[1,h] = Σ_{k=0}^{h−1} AR_i,t0+k        t0 = entry session; its return is open → close (P5)

Point in time: the caller passes only bars whose close was known strictly before `as_of`, and an
event enters the sample only when its longest horizon closed before `as_of` (05 §5.0). Returns come
from the adjusted series (P8), so a bonus issue or split is not a crash; ex-dates of bonus / rights
issues and splits and the company's other event sessions are removed from the estimation window.
"""

from __future__ import annotations

import math
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal, NamedTuple

from kaptan.evidence.params import CLUSTER_SESSIONS, ESTIMATION_WINDOW, MIN_ESTIMATION_OBS
from kaptan.evidence.sessions import entry_session, event_session
from kaptan.evidence.stats import HorizonStats, summarize
from kaptan.prices.calendar import (
    FIRST_YEAR,
    CalendarRangeError,
    add_sessions,
    close_known_at,
    prev_session,
    sessions_between,
)


class Bar(NamedTuple):
    open: float | None
    close: float


Series = Mapping[date, Bar]
ModelKind = Literal["market_model", "market_adj"]


@dataclass(frozen=True, slots=True)
class MarketModel:
    alpha: float
    beta: float
    n_obs: int
    kind: ModelKind


MARKET_ADJUSTED = MarketModel(0.0, 1.0, 0, "market_adj")


@dataclass(frozen=True, slots=True)
class PastEvent:
    ref_id: str
    ticker: str
    company_name: str
    title: str
    published_at: datetime
    available_at: datetime


@dataclass(frozen=True, slots=True)
class EventResult:
    event: PastEvent
    t0: date
    cars: dict[int, float]
    model: MarketModel


@dataclass(frozen=True, slots=True)
class StudyResult:
    horizons: tuple[int, ...]
    results: tuple[EventResult, ...]
    stats: dict[int, HorizonStats]
    n_raw: int  # events offered before clustering and point-in-time filtering
    dropped: dict[str, int] = field(default_factory=dict)

    @property
    def n(self) -> int:
        return len(self.results)


def close_return(series: Series, d: date) -> float | None:
    """Close-to-close return of session `d` (None when either bar is missing)."""
    today, before = series.get(d), series.get(prev_session(d))
    if today is None or before is None or before.close <= 0:
        return None
    return today.close / before.close - 1


def entry_return(series: Series, d: date) -> float | None:
    """Open → close of the entry session (P5); close-to-close when the open is unknown."""
    bar = series.get(d)
    if bar is None:
        return None
    if bar.open is not None and bar.open > 0:
        return bar.close / bar.open - 1
    return close_return(series, d)


def estimation_days(session: date, excluded: Collection[date] = ()) -> list[date]:
    """Sessions [−250, −30] before the event session, clipped to the calendar's first year."""
    lo, hi = ESTIMATION_WINDOW
    try:
        end = add_sessions(session, hi)
    except CalendarRangeError:
        return []
    try:
        start = add_sessions(session, lo)
    except CalendarRangeError:
        start = date(FIRST_YEAR, 1, 1)
    return [d for d in sessions_between(start, end) if d not in excluded]


def fit_market_model(stock: Series, bench: Series, days: Sequence[date]) -> MarketModel:
    """OLS of the stock's daily returns on the benchmark's; too few returns → market-adjusted."""
    pairs = []
    for d in days:
        rs, rb = close_return(stock, d), close_return(bench, d)
        if rs is not None and rb is not None:
            pairs.append((rb, rs))
    n = len(pairs)
    if n < MIN_ESTIMATION_OBS:
        return MarketModel(0.0, 1.0, n, "market_adj")
    mean_b = math.fsum(b for b, _ in pairs) / n
    mean_s = math.fsum(s for _, s in pairs) / n
    var_b = math.fsum((b - mean_b) ** 2 for b, _ in pairs)
    if var_b <= 0:
        return MarketModel(0.0, 1.0, n, "market_adj")
    beta = math.fsum((b - mean_b) * (s - mean_s) for b, s in pairs) / var_b
    return MarketModel(mean_s - beta * mean_b, beta, n, "market_model")


def event_cars(
    stock: Series, bench: Series, t0: date, horizons: Sequence[int], model: MarketModel
) -> dict[int, float] | None:
    """CAR[1,h] for every horizon, or None when any session up to the longest horizon lacks a bar."""
    total, cars = 0.0, {}
    for k in range(max(horizons)):
        d = add_sessions(t0, k)
        rs = entry_return(stock, d) if k == 0 else close_return(stock, d)
        rb = entry_return(bench, d) if k == 0 else close_return(bench, d)
        if rs is None or rb is None:
            return None
        total += rs - (model.alpha + model.beta * rb)
        if k + 1 in horizons:
            cars[k + 1] = total
    return cars


def cluster(events: Sequence[PastEvent], sessions: int = CLUSTER_SESSIONS) -> list[PastEvent]:
    """One company's events within `sessions` sessions of its last kept event count once (06 §12.3)."""
    kept: list[PastEvent] = []
    last: dict[str, date] = {}
    for ev in sorted(events, key=lambda e: (e.published_at, e.ref_id)):
        s = event_session(ev.published_at)
        prev = last.get(ev.ticker)
        if prev is not None and s <= add_sessions(prev, sessions):
            continue
        kept.append(ev)
        last[ev.ticker] = s
    return kept


def window_closed(t0: date, horizon: int, as_of: datetime) -> bool:
    """The horizon's last close was final strictly before `as_of` (no look-ahead)."""
    return close_known_at(add_sessions(t0, horizon - 1)) < as_of


@dataclass(frozen=True, slots=True)
class Precomputed:
    """A materialised result of one event (core.event_returns, `available_at < as_of`): used as is."""

    t0: date
    cars: dict[int, float]
    model: MarketModel


def study(
    events: Sequence[PastEvent],
    series: Mapping[str, Series],
    bench: Series,
    as_of: datetime,
    horizons: Sequence[int],
    excluded: Mapping[str, Collection[date]] | None = None,
    precomputed: Mapping[str, Precomputed] | None = None,
) -> StudyResult:
    """CARs of every usable past event and their cross-sectional statistics per horizon.

    `precomputed` (ref_id → materialised CARs) skips the computation of an event whose every horizon
    is there; the point-in-time filters and the clustering are applied exactly as for computed ones."""
    hs = tuple(sorted(set(horizons)))
    if not hs or hs[0] < 1:
        raise ValueError("horizons must be positive session counts")
    dropped = {"future": 0, "out_of_calendar": 0, "clustered": 0, "window_open": 0, "no_prices": 0}
    usable: list[PastEvent] = []
    for ev in events:
        if ev.available_at >= as_of:
            dropped["future"] += 1
            continue
        try:
            entry_session(ev.published_at)
            event_session(ev.published_at)
        except CalendarRangeError:
            dropped["out_of_calendar"] += 1
            continue
        usable.append(ev)
    clustered = cluster(usable)
    dropped["clustered"] = len(usable) - len(clustered)
    results: list[EventResult] = []
    for ev in clustered:
        try:
            t0, session = entry_session(ev.published_at), event_session(ev.published_at)
            if not window_closed(t0, hs[-1], as_of):
                dropped["window_open"] += 1
                continue
            pre = (precomputed or {}).get(ev.ref_id)
            if pre is not None and pre.t0 == t0 and all(h in pre.cars for h in hs):
                results.append(EventResult(ev, t0, {h: pre.cars[h] for h in hs}, pre.model))
                continue
            stock = series.get(ev.ticker, {})
            days = estimation_days(session, (excluded or {}).get(ev.ticker, ()))
            model = fit_market_model(stock, bench, days)
            cars = event_cars(stock, bench, t0, hs, model)
        except CalendarRangeError:
            dropped["out_of_calendar"] += 1
            continue
        if cars is None:
            dropped["no_prices"] += 1
            continue
        results.append(EventResult(ev, t0, cars, model))
    stats = {h: summarize(h, [r.cars[h] for r in results]) for h in hs} if results else {}
    return StudyResult(hs, tuple(results), stats, n_raw=len(events), dropped=dropped)
