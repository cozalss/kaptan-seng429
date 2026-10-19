"""The evidence tools on Postgres: price context, materiality inputs and the scoped event study.

Scope fallback (06 §3.3 `precedent_ok`): the company's own past events of the type when there are
at least `MIN_EVENTS`, else its sector's (core.issuers.sector), else the whole market's. Below
`MIN_EVENTS` even market-wide the result is kept but its strength is "insufficient" (05 strength_for_n).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from kaptan.evidence import repo
from kaptan.evidence.market import MaterialityInputs, PriceContext, materiality_inputs, price_context
from kaptan.evidence.params import (
    DEFAULT_HORIZONS,
    ESTIMATION_WINDOW,
    MIN_EVENTS,
    RECENT_ACTION_SESSIONS,
    RET_3M_SESSIONS,
    STALE_SESSIONS,
)
from kaptan.evidence.sessions import event_session, last_known_session
from kaptan.evidence.study import PastEvent, Series, StudyResult, study
from kaptan.prices.calendar import FIRST_YEAR, CalendarRangeError, add_sessions, next_session
from kaptan.prices.reads import adv20

Scope = Literal["ticker", "sector", "market"]


@dataclass(frozen=True, slots=True)
class ScopedStudy:
    scope: Scope
    ticker: str
    event_type: str
    result: StudyResult

    @property
    def sufficient(self) -> bool:
        return self.result.n >= MIN_EVENTS


def _back(d: date, sessions: int) -> date:
    try:
        return add_sessions(d, -sessions)
    except CalendarRangeError:
        return date(FIRST_YEAR, 1, 1)


async def load_price_context(
    conn: repo.Conn, ticker: str, as_of: datetime, published_at: datetime
) -> tuple[PriceContext, MaterialityInputs]:
    session = last_known_session(as_of)
    start = _back(session, RET_3M_SESSIONS + 2)
    stock = await repo.series(conn, ticker, start, session)
    bench = await repo.benchmark(conn, start, session)
    raw = await repo.last_raw(conn, ticker, session)
    if raw is not None and raw["d"] < _back(session, STALE_SESSIONS):
        raw = None  # a stale level (halted / delisted) is not today's market cap
    adv = await adv20(conn, ticker, next_session(session))
    acts = await repo.actions(conn, ticker, _back(session, RECENT_ACTION_SESSIONS))
    ctx = price_context(
        ticker,
        as_of,
        session,
        event_session(published_at),
        stock,
        bench,
        last_raw=raw,
        adv20_try=adv,
        actions=acts,
    )
    return ctx, materiality_inputs(raw)


async def study_events(
    conn: repo.Conn, events: Sequence[PastEvent], as_of: datetime, horizons: Sequence[int] = DEFAULT_HORIZONS
) -> StudyResult:
    """Load each company's adjusted series once (up to the last known session) and run the study."""
    session = last_known_session(as_of)
    sessions = []
    for e in events:
        try:
            sessions.append(event_session(e.published_at))
        except CalendarRangeError:
            continue
    if not sessions:
        return study(events, {}, {}, as_of, horizons)
    start = _back(min(sessions), -ESTIMATION_WINDOW[0] + 1)
    tickers = sorted({e.ticker for e in events})
    series: dict[str, Series] = {t: await repo.series(conn, t, start, session) for t in tickers}
    bench = await repo.benchmark(conn, start, session)
    excluded = await repo.excluded_days(conn, tickers, as_of, session)
    return study(events, series, bench, as_of, horizons, excluded)


async def scoped_study(
    conn: repo.Conn,
    event_type: str,
    ticker: str,
    as_of: datetime,
    self_index: int,
    horizons: Sequence[int] = DEFAULT_HORIZONS,
) -> ScopedStudy:
    sector = await repo.sector_of(conn, ticker)
    # (scope, ticker filter, sector filter): own company → its sector → the whole market
    scopes: list[tuple[Scope, str | None, str | None]] = [("ticker", ticker, None)]
    if sector is not None:
        scopes.append(("sector", None, sector))
    scopes.append(("market", None, None))
    best: ScopedStudy | None = None
    for scope, only_ticker, only_sector in scopes:
        events = await repo.past_events(conn, event_type, as_of, self_index, ticker=only_ticker, sector=only_sector)
        best = ScopedStudy(scope, ticker, event_type, await study_events(conn, events, as_of, horizons))
        if best.sufficient:
            break
    assert best is not None  # the market scope always runs
    return best
