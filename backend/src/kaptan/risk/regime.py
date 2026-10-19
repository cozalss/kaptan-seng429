"""Market regime detector for R10 (06 §9), one row per BIST session:

    crisis_on  = (XU100 close < SMA50 AND RV20 ≥ P80(RV20 over the last 756 sessions)) OR XU100 day ≤ −5 %
    RV20       = sqrt(252) × stdev(daily log return, 20 sessions)
    crisis_off = none of the crisis_on conditions for 5 consecutive sessions (hysteresis)

    result = await run_regime(conn, date(2026, 9, 16))         # after the EOD prices are stored

The detector writes trading.regime_daily (the hysteresis state lives there) and trading.risk_state.regime,
which the gate's R10 and the rule engine read; a change is audited (`risk.regime_changed`). XU100 is the
adjusted Yahoo series (kaptan.prices). The RV leg needs ≥ 252 RV20 values (a year) before it may fire;
with less history only SMA-free legs count (the −5 % day). The third leg of 06 §9 (an index-wide circuit
breaker in the last 5 sessions) has no data source yet and is not evaluated.
"""

from __future__ import annotations

import itertools
import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.audit.writer import AuditDraft, append
from kaptan.prices.calendar import add_sessions, is_trading_day
from kaptan.prices.reads import adjusted_series
from kaptan.risk.kill_switch import RISK_MONITOR
from kaptan.settings import get_settings

Regime = Literal["normal", "crisis"]

INDEX: Final = "XU100"
SMA_WINDOW: Final = 50
RV_WINDOW: Final = 20
RV_PERCENTILE: Final = 0.80
RV_LOOKBACK: Final = 756
RV_MIN_HISTORY: Final = 252
INDEX_CRASH: Final = -0.05
EXIT_CONFIRM_SESSIONS: Final = 5
ANNUAL: Final = math.sqrt(252)

PREV_SQL: Final = "SELECT regime, calm_streak FROM trading.regime_daily WHERE d < %s ORDER BY d DESC LIMIT 1"
UPSERT_SQL: Final = """
INSERT INTO trading.regime_daily (d, crisis_raw, regime, calm_streak, close, sma50, rv20, rv20_p80, day_return)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (d) DO UPDATE SET crisis_raw = EXCLUDED.crisis_raw, regime = EXCLUDED.regime,
  calm_streak = EXCLUDED.calm_streak, close = EXCLUDED.close, sma50 = EXCLUDED.sma50, rv20 = EXCLUDED.rv20,
  rv20_p80 = EXCLUDED.rv20_p80, day_return = EXCLUDED.day_return, computed_at = now()
"""
STATE_SQL: Final = "SELECT regime FROM trading.risk_state WHERE id = 1 FOR UPDATE"


@dataclass(frozen=True, slots=True)
class RegimeSignal:
    d: date
    close: float
    sma50: float | None
    rv20: float | None
    rv20_p80: float | None
    day_return: float | None
    crisis_raw: bool


@dataclass(frozen=True, slots=True)
class RegimeResult:
    signal: RegimeSignal
    regime: Regime
    calm_streak: int
    changed: bool


def percentile(values: Sequence[float], q: float) -> float:
    """Linear interpolation between closest ranks (numpy's default)."""
    xs = sorted(values)
    pos = (len(xs) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def rv_series(closes: Sequence[float], window: int = RV_WINDOW) -> list[float]:
    """Annualised RV20 at every session that has `window` log returns behind it."""
    rets = [math.log(b / a) for a, b in itertools.pairwise(closes)]
    return [ANNUAL * statistics.stdev(rets[i - window : i]) for i in range(window, len(rets) + 1)]


def signal(closes: Sequence[tuple[date, float]]) -> RegimeSignal:
    """The crisis_on test for the last session of `closes` (ascending, the day itself last)."""
    if not closes:
        raise ValueError("no closes")
    d, close = closes[-1]
    px = [c for _, c in closes]
    day_ret = px[-1] / px[-2] - 1 if len(px) >= 2 else None
    sma = statistics.fmean(px[-SMA_WINDOW:]) if len(px) >= SMA_WINDOW else None
    rvs = rv_series(px)[-RV_LOOKBACK:]
    rv20 = rvs[-1] if rvs else None
    p80 = percentile(rvs, RV_PERCENTILE) if len(rvs) >= RV_MIN_HISTORY else None
    trend_vol = sma is not None and close < sma and rv20 is not None and p80 is not None and rv20 >= p80
    crash = day_ret is not None and day_ret <= INDEX_CRASH
    return RegimeSignal(d, close, sma, rv20, p80, day_ret, trend_vol or crash)


def next_regime(prev: Regime, prev_calm: int, crisis_raw: bool) -> tuple[Regime, int]:
    """Hysteresis: crisis at once, normal only after EXIT_CONFIRM_SESSIONS calm sessions in a row."""
    if crisis_raw:
        return "crisis", 0
    calm = prev_calm + 1
    if prev == "crisis" and calm < EXIT_CONFIRM_SESSIONS:
        return "crisis", calm
    return "normal", calm


async def _closes(conn: AsyncConnection[Any], day: date) -> list[tuple[date, float]]:
    start = add_sessions(day, -(RV_LOOKBACK + RV_WINDOW + 1))
    _src, bars = await adjusted_series(conn, INDEX, start, day)
    return [(d, float(bars[d][1])) for d in sorted(bars)]


async def run_regime(conn: AsyncConnection[Any], day: date, *, demo: bool | None = None) -> RegimeResult | None:
    """Detect `day`'s regime and store it (one transaction). None: DEMO_MODE (the demo keeps its seeded
    regime), not a session, or no XU100 close for `day`."""
    if (get_settings().demo_mode if demo is None else demo) or not is_trading_day(day):
        return None
    closes = await _closes(conn, day)
    if not closes or closes[-1][0] != day:
        return None
    sig = signal(closes)
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.execute(PREV_SQL, (day,))
            prev = await cur.fetchone()
            regime, calm = next_regime(
                "crisis" if prev is not None and prev["regime"] == "crisis" else "normal",
                int(prev["calm_streak"]) if prev is not None else 0,
                sig.crisis_raw,
            )
            params = (sig.close, sig.sma50, sig.rv20, sig.rv20_p80, sig.day_return)
            await cur.execute(UPSERT_SQL, (day, sig.crisis_raw, regime, calm, *params))
            await cur.execute("INSERT INTO trading.risk_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
            await cur.execute(STATE_SQL)
            state = await cur.fetchone()
            before = "normal" if state is None else str(state["regime"])
            await cur.execute("UPDATE trading.risk_state SET regime = %s, updated_at = now() WHERE id = 1", (regime,))
        changed = before != regime
        if changed:
            payload = {"from": before, "to": regime, "d": day.isoformat(), "crisis_raw": sig.crisis_raw}
            await append(conn, [AuditDraft(RISK_MONITOR, "risk.regime_changed", "system_flag", "regime", payload)])
    return RegimeResult(sig, regime, calm, changed)
