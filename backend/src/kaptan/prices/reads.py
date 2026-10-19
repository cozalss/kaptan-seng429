"""Read helpers for the rule engine, the event study, SimBIST and position marks.

Basis rule (P8): price *levels* (fills, limit price, R09 band, marks) are raw İş Yatırım rows;
*returns* use the adjusted series. The adjusted series is the view `core.prices_daily_adj`
(raw × stored factors); only when a window has no İş Yatırım rows at all (e.g. XU100, which İş
Yatırım's stock endpoint does not serve) the Yahoo adjusted rows are used. Series are never mixed
inside one computation. Session arithmetic uses `kaptan.prices.calendar` (Europe/Istanbul).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final, Literal

from psycopg import AsyncConnection
from psycopg.rows import dict_row

from kaptan.prices.calendar import add_sessions, close_known_at, istanbul_date, open_known_at, prev_session
from kaptan.prices.models import Mark, PriceBasis

Conn = AsyncConnection[Any]
SeriesSource = Literal["isyatirim", "yfinance"]

#: Renamed codes (core.ticker_history, e.g. KOZAL → TRALT): every read below matches all codes of the
#: chain (`core.ticker_codes`), so an old code finds the history İş Yatırım/Yahoo serve under the new one;
#: on a day both codes have a row, the requested code's row wins.
RAW_SQL: Final = """
SELECT open, close FROM core.prices_daily
WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND d = %(d)s AND source = 'isyatirim' AND price_basis = 'raw'
ORDER BY ticker <> %(t)s LIMIT 1
"""
ISY_ADJ_SQL: Final = """
SELECT DISTINCT ON (d) d, adj_open AS open, adj_close AS close FROM core.prices_daily_adj
WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND d BETWEEN %(lo)s AND %(hi)s
ORDER BY d, ticker <> %(t)s
"""
YF_ADJ_SQL: Final = """
SELECT DISTINCT ON (d) d, open, close FROM core.prices_daily
WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'yfinance' AND d BETWEEN %(lo)s AND %(hi)s
ORDER BY d, ticker <> %(t)s
"""
ADV_SQL: Final = """
SELECT DISTINCT ON (d) d, turnover_try, close, volume FROM core.prices_daily
WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND d >= %(lo)s AND d < %(hi)s
ORDER BY d, ticker <> %(t)s
"""
MARKS_SQL: Final = """
SELECT t.ticker, p.d, p.open, p.close
FROM unnest(%s::text[]) AS t(ticker)
CROSS JOIN LATERAL (
  SELECT d, open, close FROM core.prices_daily
  WHERE ticker = t.ticker AND source = 'isyatirim' AND price_basis = 'raw' AND d <= %s
  ORDER BY d DESC LIMIT 2
) p
ORDER BY t.ticker, p.d DESC
"""

Bars = dict[date, tuple[Decimal | None, Decimal]]


async def _rows(conn: Conn, sql: str, params: Sequence[Any] | dict[str, Any]) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return await cur.fetchall()


async def adjusted_series(
    conn: Conn, ticker: str, start: date, end: date, source: SeriesSource | None = None
) -> tuple[SeriesSource | None, Bars]:
    """d → (adj_open, adj_close) over [start, end]: İş Yatırım (view) if it has rows there, else Yahoo."""
    for src, sql in (("isyatirim", ISY_ADJ_SQL), ("yfinance", YF_ADJ_SQL)):
        if source is not None and src != source:
            continue
        rows = await _rows(conn, sql, {"t": ticker, "lo": start, "hi": end})
        if rows:
            return src, {r["d"]: (r["open"], r["close"]) for r in rows}  # type: ignore[return-value]
    return None, {}


async def close_on(conn: Conn, ticker: str, d: date, *, basis: PriceBasis = "raw") -> Decimal | None:
    """The session close of `d` (raw İş Yatırım level by default), None when there is no bar."""
    if basis == "raw":
        rows = await _rows(conn, RAW_SQL, {"t": ticker, "d": d})
        return rows[0]["close"] if rows else None
    _, bars = await adjusted_series(conn, ticker, d, d)
    return bars[d][1] if d in bars else None


async def open_on(conn: Conn, ticker: str, d: date, *, basis: PriceBasis = "raw") -> Decimal | None:
    """The session open of `d` (the SimBIST `opg` fill level), None when unknown."""
    if basis == "raw":
        rows = await _rows(conn, RAW_SQL, {"t": ticker, "d": d})
        return rows[0]["open"] if rows else None
    _, bars = await adjusted_series(conn, ticker, d, d)
    return bars[d][0] if d in bars else None


async def adv(conn: Conn, ticker: str, asof: date, *, window: int = 20) -> Decimal | None:
    """Average daily TL turnover over the `window` sessions strictly before `asof` (known at its open).

    A missing session inside the window counts as zero turnover (no trades / halt); fewer than
    half the sessions present means "not enough data" → None. Turnover is İş Yatırım `HG_HACIM`,
    falling back to close × volume.
    """
    lo = add_sessions(asof, -window)
    rows = await _rows(conn, ADV_SQL, {"t": ticker, "lo": lo, "hi": asof})
    if len(rows) * 2 < window:
        return None
    total = Decimal(0)
    for r in rows:
        if r["turnover_try"] is not None:
            total += r["turnover_try"]
        elif r["volume"] is not None:
            total += r["close"] * r["volume"]
    return total / window


async def adv20(conn: Conn, ticker: str, asof: date) -> Decimal | None:
    return await adv(conn, ticker, asof, window=20)


def _ret(entry: Decimal | None, exit_: Decimal | None) -> Decimal | None:
    if entry is None or exit_ is None or entry <= 0:
        return None
    return exit_ / entry - 1


async def forward_return(
    conn: Conn, ticker: str, t0: date, horizon: int, *, entry: Literal["open", "close"] = "open"
) -> Decimal | None:
    """Adjusted return over `horizon` sessions from session `t0`.

    entry='open' (the event study's P5 convention): open(t0) → close(t0 + horizon − 1), so horizon 1
    is open(t0) → close(t0). entry='close': close(t0) → close(t0 + horizon).
    """
    if horizon < 1:
        raise ValueError("horizon must be >= 1 session")
    exit_day = add_sessions(t0, horizon - 1 if entry == "open" else horizon)
    for src in ("isyatirim", "yfinance"):
        _, bars = await adjusted_series(conn, ticker, t0, exit_day, source=src)
        if t0 in bars and exit_day in bars:
            start_px = bars[t0][0] if entry == "open" else bars[t0][1]
            out = _ret(start_px, bars[exit_day][1])
            if out is not None:
                return out
    return None


async def daily_returns(conn: Conn, ticker: str, start: date, end: date) -> list[tuple[date, Decimal]]:
    """Close-to-close adjusted returns of each session in [start, end] whose previous session has a bar."""
    _src, bars = await adjusted_series(conn, ticker, prev_session(start), end)
    out = []
    for d in sorted(bars):
        if d < start:
            continue
        prev = prev_session(d)
        if prev in bars:
            r = _ret(bars[prev][1], bars[d][1])
            if r is not None:
                out.append((d, r))
    return out


def _mark_from(ticker: str, rows: Sequence[dict[str, Any]], at: datetime) -> Mark | None:
    for r in rows:  # newest first
        d = r["d"]
        if at >= close_known_at(d):
            return Mark(ticker, r["close"], d, "close", close_known_at(d), "isyatirim")
        if r["open"] is not None and at >= open_known_at(d):
            return Mark(ticker, r["open"], d, "open", open_known_at(d), "isyatirim")
    return None


async def latest_marks(conn: Conn, tickers: Sequence[str], at: datetime) -> dict[str, Mark]:
    """The latest raw price each ticker had *as known at* `at` (15-min delay, 18:30 EOD close)."""
    if not tickers:
        return {}
    rows = await _rows(conn, MARKS_SQL, (list(dict.fromkeys(tickers)), istanbul_date(at)))
    by_ticker: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_ticker.setdefault(r["ticker"], []).append(r)
    out = {}
    for t, rs in by_ticker.items():
        mark = _mark_from(t, rs, at)
        if mark is not None:
            out[t] = mark
    return out


async def latest_mark(conn: Conn, ticker: str, at: datetime) -> Mark | None:
    return (await latest_marks(conn, [ticker], at)).get(ticker)
