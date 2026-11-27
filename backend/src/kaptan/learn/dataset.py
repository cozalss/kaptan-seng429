"""The learning pool: every matured E1–E4 event outside the sealed holdout, with its net return and rule inputs.

    pool = await load_pool(conn, as_of)          # list[Sample], oldest first

Where it comes from (and nothing else, 06 §12.6, `kaptan.evidence.holdout`):
- events: `core.events` + `core.event_returns` at the type's primary window (E1/E2 20, E3/E4 5 borsa günü), known
  before `as_of`, published 2022-01-01 → 2024-12-31 (the archive) or from 2026-11-01 on (live);
- prices (the inputs below): only sessions outside 2025-01-01 → 2026-10-31. A live event too early after the seal
  to have 20 unsealed sessions before it has no price inputs (and is left out of the tests that need them);
- notices (E1 buyback ratio, E2 insider value): the deterministic parser's tables, read point in time.

Every row is checked again in Python (`check_unsealed`): a sealed row raises instead of being learned from.
Clustering is the study's (one company's events within 10 borsa günü count once). The cost is §8.1's round trip
for a small order: commission (+ BSMV) and fees, the Corwin–Schultz half spread of the 20 sessions before the event,
the manual slippage, floored at 0.3 %; market impact is left out (a 50 000 TL book's order is far below 1 % of
turnover). `net` = CAR − cost.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

from kaptan.evidence import repo
from kaptan.evidence.holdout import HOLDOUT_END, HOLDOUT_START
from kaptan.evidence.market import market_adjusted_runup
from kaptan.evidence.params import LEAK_SESSIONS, RUNUP_SESSIONS
from kaptan.evidence.sessions import event_session
from kaptan.evidence.study import PastEvent, Series, cluster
from kaptan.learn.tunables import PRIMARY_HORIZON
from kaptan.market import notices
from kaptan.prices.calendar import IST, CalendarRangeError, add_sessions, prev_session
from kaptan.sizing.costs import HLC, median_cs_spread
from kaptan.sizing.params import DEFAULT_SIZING

Conn = repo.Conn
POOL_START: Final = datetime(2022, 1, 1, tzinfo=IST)
LIVE_START: Final = HOLDOUT_END  # 2026-11-01: live evidence starts where the seal ends
SEALED_FROM: Final = HOLDOUT_START.date()
SEALED_TO: Final = (HOLDOUT_END - timedelta(days=1)).date()
BENCH_START: Final = date(2021, 11, 1)  # 25 sessions before the pool's first event
PRICE_LOOKBACK: Final = 25  # sessions of prices before the event the inputs need (spread 21, run-up 11)
DEFAULT_HALF_SPREAD: Final = 0.001  # trading.yaml costs.default_half_spread

POOL_SQL: Final = """
SELECT e.event_id, e.event_code, e.ticker, e.event_time, e.available_at, e.disclosure_index, r.car, r.available_at AS
       car_known_at, d.company_name
  FROM core.events e
  JOIN core.event_returns r USING (event_id)
  JOIN core.disclosures d ON d.disclosure_index = e.disclosure_index
 WHERE e.source_kind = 'kap' AND e.event_code = ANY(%(codes)s::text[])
   AND r.horizon = CASE WHEN e.event_code IN ('E1', 'E2') THEN 20 ELSE 5 END
   AND r.available_at < %(as_of)s
   AND e.event_time >= %(pool_start)s
   AND (e.event_time < %(seal_start)s OR e.event_time >= %(seal_end)s)
   AND (d.published_at < %(seal_start)s OR d.published_at >= %(seal_end)s)
 ORDER BY e.event_time, e.event_id
"""
HLC_SQL: Final = """
SELECT d, adj_high, adj_low, adj_close FROM core.prices_daily_adj
 WHERE ticker = %s AND source = 'isyatirim' AND d >= %s AND d <= %s AND (d < %s OR d > %s)
 ORDER BY d
"""
CAPITAL_SQL: Final = """
SELECT capital_try FROM core.prices_daily
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND price_basis = 'raw' AND d <= %(d)s
   AND (d < %(s0)s OR d > %(s1)s) AND capital_try IS NOT NULL
 ORDER BY d DESC LIMIT 1
"""


class HoldoutLeakError(RuntimeError):
    """A sealed row reached the learning pool: a bug, never learned from."""


def sealed_day(d: date) -> bool:
    return SEALED_FROM <= d <= SEALED_TO


def sealed_time(ts: datetime) -> bool:
    return HOLDOUT_START <= ts < HOLDOUT_END


def check_unsealed(ts: datetime, what: str) -> None:
    if sealed_time(ts):
        raise HoldoutLeakError(f"{what} at {ts.isoformat()} is inside the sealed holdout")


@dataclass(frozen=True, slots=True)
class Sample:
    kind: str
    ticker: str
    published_at: datetime
    car: float  # CAR[1, primary horizon]
    cost: float  # round trip as a fraction
    source: str  # "archive" | "live"
    features: dict[str, float | None] = field(default_factory=dict)

    @property
    def net(self) -> float:
        return self.car - self.cost

    @property
    def year(self) -> int:
        return self.published_at.astimezone(IST).year


def _source(ts: datetime) -> str:
    return "live" if ts >= LIVE_START else "archive"


def _unsealed_range(start: date, end: date) -> tuple[date, date] | None:
    """[start, end] with the sealed years cut off (the part before or after them, never both across)."""
    if end < SEALED_FROM or start > SEALED_TO:
        return start, end
    if start < SEALED_FROM:
        return start, prev_session(SEALED_FROM)
    after = SEALED_TO + timedelta(days=1)
    return (after, end) if after <= end else None


def round_trip(spread: float | None) -> float:
    p = DEFAULT_SIZING
    half = DEFAULT_HALF_SPREAD if spread is None else spread / 2
    side = float(p.c_broker * (1 + p.bsmv) + p.exchange_fee + p.clearing_fee + p.manual_slippage) + half
    return max(2 * side, float(p.floor_round_trip))


async def _hlc(conn: Conn, ticker: str, start: date, end: date) -> list[tuple[date, HLC]]:
    rows = await repo.rows(conn, HLC_SQL, (ticker, start, end, SEALED_FROM, SEALED_TO))
    out = []
    for r in rows:
        hi, lo = r["adj_high"], r["adj_low"]
        out.append(
            (r["d"], HLC(None if hi is None else float(hi), None if lo is None else float(lo), float(r["adj_close"])))
        )
    return out


def _price_features(stock: Series, bench: Series, bars: Sequence[tuple[date, HLC]], session: date) -> dict[str, Any]:
    end = prev_session(session)
    before = [b for d, b in bars if d <= end][-(DEFAULT_SIZING.atr_window + 1) :]
    spread = median_cs_spread(before, DEFAULT_SIZING.atr_window, DEFAULT_SIZING.min_window_obs)
    return {
        "leak_5d": market_adjusted_runup(stock, bench, end, LEAK_SESSIONS),
        "ret_10d": market_adjusted_runup(stock, bench, end, RUNUP_SESSIONS),
        "spread": spread,
    }


async def _notice_features(conn: Conn, row: dict[str, Any], session: date) -> dict[str, float | None]:
    kind, ticker, published = row["event_code"], row["ticker"], row["event_time"]
    if kind not in ("E1", "E2"):
        return {}
    since = notices.lookback_start(published)
    if row["event_time"] >= LIVE_START:
        since = max(since, LIVE_START)  # the notices before a live event stop at the seal
    rows = await notices.load_notices(conn, ticker, since, row["available_at"], int(row["disclosure_index"]))
    rows = [n for n in rows if not sealed_time(n.published_at)]
    if kind == "E1":
        cap = await repo.rows(conn, CAPITAL_SQL, {"t": ticker, "d": session, "s0": SEALED_FROM, "s1": SEALED_TO})
        capital = Decimal(str(cap[0]["capital_try"])) if cap else None
        b = notices.buyback_features(rows, int(row["disclosure_index"]), published, ticker, capital, None)
        return {"capital_10d": None if b.capital_pct is None else float(b.capital_pct)}
    i = notices.insider_features(rows, int(row["disclosure_index"]), row["available_at"], None)
    return {"insider_value_try": None if i.net_value_try is None else float(i.net_value_try)}


def _clustered(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    by_ref = {f"evt:kap:{r['disclosure_index']}": r for r in rows}
    out: list[dict[str, Any]] = []
    for kind in PRIMARY_HORIZON:
        events = [
            PastEvent(ref, r["ticker"], r["company_name"] or "", "", r["event_time"], r["available_at"])
            for ref, r in by_ref.items()
            if r["event_code"] == kind
        ]
        out.extend(by_ref[e.ref_id] for e in cluster(events))
    return sorted(out, key=lambda r: (r["event_time"], r["event_id"]))


async def _series_by_ticker(
    conn: Conn, rows: Sequence[dict[str, Any]]
) -> tuple[dict[tuple[str, str], Series], dict[tuple[str, str], list[tuple[date, HLC]]], dict[str, Series]]:
    """Per (company, archive|live): its unsealed adjusted closes and bars; per era: the XU100 closes."""
    spans: dict[tuple[str, str], list[date]] = defaultdict(list)
    for r in rows:
        spans[(r["ticker"], _source(r["event_time"]))].append(event_session(r["event_time"]))
    stock: dict[tuple[str, str], Series] = {}
    bars: dict[tuple[str, str], list[tuple[date, HLC]]] = {}
    era_end: dict[str, date] = {}
    for (ticker, src), sessions in spans.items():
        try:
            start = add_sessions(min(sessions), -PRICE_LOOKBACK)
        except CalendarRangeError:
            start = min(sessions) - timedelta(days=40)
        span = _unsealed_range(start, max(sessions))
        if span is None:
            continue
        stock[(ticker, src)] = await repo.series(conn, ticker, *span)
        bars[(ticker, src)] = await _hlc(conn, ticker, *span)
        era_end[src] = max(era_end.get(src, span[1]), span[1])
    bench: dict[str, Series] = {}
    if "archive" in era_end:
        bench["archive"] = await repo.benchmark(conn, BENCH_START, min(era_end["archive"], prev_session(SEALED_FROM)))
    if "live" in era_end:
        bench["live"] = await repo.benchmark(conn, LIVE_START.date(), era_end["live"])
    return stock, bars, bench


async def load_pool(conn: Conn, as_of: datetime, kinds: Sequence[str] = tuple(PRIMARY_HORIZON)) -> list[Sample]:
    """The matured, unsealed, clustered events of `kinds` known before `as_of`, with costs and rule inputs."""
    params = {
        "codes": list(kinds), "as_of": as_of, "pool_start": POOL_START, "seal_start": HOLDOUT_START,
        "seal_end": HOLDOUT_END,
    }  # fmt: skip
    rows = _clustered(await repo.rows(conn, POOL_SQL, params))
    stock, bars, bench = await _series_by_ticker(conn, rows)
    out: list[Sample] = []
    for r in rows:
        check_unsealed(r["event_time"], f"event {r['event_id']}")
        src = _source(r["event_time"])
        try:
            session = event_session(r["event_time"])
        except CalendarRangeError:
            continue
        prices = _price_features(
            stock.get((r["ticker"], src), {}), bench.get(src, {}), bars.get((r["ticker"], src), []), session
        )
        feats: dict[str, float | None] = {"leak_5d": prices["leak_5d"], "ret_10d": prices["ret_10d"]}
        feats |= await _notice_features(conn, r, session)
        cost = round_trip(prices["spread"])
        out.append(Sample(r["event_code"], r["ticker"], r["event_time"], float(r["car"]), cost, src, feats))
    return out
