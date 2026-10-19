"""Intraday bars and the latest delayed quote (06 R09 stale-price check, 04 `intraday_archive`).

Source: Yahoo's public chart API (what `yfinance` calls; no key), `<T>.IS` at 1m/5m/15m/1h. BIST data
there is ~15 minutes late; today's intraday prices are the traded levels (raw, P8). checked 2026-10-20.

    await refresh_quotes(conn, ["THYAO"], now, client=polite)        # before a gate check, in session
    q = await latest_quote(conn, "THYAO", now)                          # → Quote(price, age_s, …) | None
    stats = await run_intraday_archive(conn, day, client=polite)       # 19:00: the day's 1m bars

`latest_quote` is point in time: an intraday bar counts only once it is known, `ts + interval +
QUOTE_DELAY_S` (setting, 900 s) ≤ now; otherwise (or when it is older) the latest daily raw mark
(`latest_mark`: the open from 10:15, the close from 18:30). `age_s` = now − the market time the price
was traded at (bar end; 10:00 for an open, the session close for a close) — what R09's `price_age_s` is.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Final, Literal

from psycopg.rows import dict_row

from kaptan.prices.calendar import IST, SESSION_OPEN, session_close
from kaptan.prices.http import PoliteClient, SourceError
from kaptan.prices.reads import Conn, latest_marks
from kaptan.prices.yahoo import URL, symbol

log = logging.getLogger(__name__)

Interval = Literal["1m", "5m", "15m", "1h"]
INTERVAL_S: Final[dict[str, int]] = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600}
DEFAULT_DELAY_S: Final = 15 * 60


@dataclass(frozen=True, slots=True)
class IntradayBar:
    ticker: str
    ts: datetime  # bar start, tz-aware
    interval: Interval
    close: Decimal
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    volume: Decimal | None = None


@dataclass(frozen=True, slots=True)
class Quote:
    ticker: str
    price: Decimal
    traded_at: datetime  # market time of the price (bar end / session open / session close)
    known_at: datetime  # when it became knowable to us
    age_s: float  # now − traded_at
    source: str  # "yfinance:1m" | "isyatirim:open" | "isyatirim:close"


def _dec(v: Any) -> Decimal | None:
    if v is None or isinstance(v, bool):
        return None
    out = Decimal(str(v))
    return out if out.is_finite() else None


def parse_intraday(ticker: str, payload: Any, interval: Interval) -> list[IntradayBar]:
    """Chart JSON → bars with a positive close, ascending (null rows = minutes without data)."""
    if payload is None:
        return []
    chart = payload.get("chart") if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise SourceError(f"yahoo intraday {ticker}: unexpected response")
    results = chart.get("result") or []
    if not results:
        return []
    result = results[0]
    stamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    cols = {k: quote.get(k) or [None] * len(stamps) for k in ("open", "high", "low", "close", "volume")}
    out = []
    for i, ts in enumerate(stamps):
        close = _dec(cols["close"][i])
        if close is None or close <= 0:
            continue
        out.append(
            IntradayBar(
                ticker=ticker,
                ts=datetime.fromtimestamp(int(ts), IST),
                interval=interval,
                close=close,
                open=_dec(cols["open"][i]),
                high=_dec(cols["high"][i]),
                low=_dec(cols["low"][i]),
                volume=_dec(cols["volume"][i]),
            )
        )
    return out


async def fetch_intraday(
    client: PoliteClient, ticker: str, *, interval: Interval = "1m", day: date | None = None
) -> list[IntradayBar]:
    """Today's bars (`range=1d`) or one past day's (Yahoo keeps ~7 days of 1m, 60 days of 5m/15m)."""
    params: dict[str, str] = {"interval": interval, "includePrePost": "false"}
    if day is None:
        params["range"] = "1d"
    else:
        start = datetime.combine(day, time(0), IST)
        params["period1"], params["period2"] = (
            str(int(start.timestamp())),
            str(int((start + timedelta(days=1)).timestamp())),
        )
    payload = await client.get_json(URL.format(symbol=symbol(ticker)), params=params)
    bars = parse_intraday(ticker, payload, interval)
    return bars if day is None else [b for b in bars if b.ts.astimezone(IST).date() == day]


UPSERT_SQL: Final = """
INSERT INTO core.prices_intraday (ticker, ts, interval, open, high, low, close, volume, source, fetched_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'yfinance', %s)
ON CONFLICT (ticker, ts, interval, source) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high,
  low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume, fetched_at = EXCLUDED.fetched_at
"""


async def store_intraday(conn: Conn, bars: Sequence[IntradayBar], fetched_at: datetime) -> int:
    if not bars:
        return 0
    params = [(b.ticker, b.ts, b.interval, b.open, b.high, b.low, b.close, b.volume, fetched_at) for b in bars]
    async with conn.cursor() as cur:
        await cur.executemany(UPSERT_SQL, params)
    return len(params)


async def refresh_quotes(
    conn: Conn, tickers: Sequence[str], now: datetime, *, client: PoliteClient, interval: Interval = "1m"
) -> dict[str, int]:
    """Fetch today's bars of each ticker and store them; ticker → bars stored (a failing one gets 0)."""
    out: dict[str, int] = {}
    for t in dict.fromkeys(tickers):
        try:
            out[t] = await store_intraday(conn, await fetch_intraday(client, t, interval=interval), now)
        except SourceError as exc:
            log.warning("intraday %s: %s", t, exc)
            out[t] = 0
    return out


LATEST_SQL: Final = """
SELECT ticker, ts, interval, close FROM core.prices_intraday
 WHERE ticker = ANY(core.ticker_codes(%(t)s))
   AND ts + (CASE interval WHEN '1m' THEN 60 WHEN '5m' THEN 300 WHEN '15m' THEN 900 ELSE 3600 END
             + %(delay)s) * interval '1 second' <= %(now)s
 ORDER BY ts DESC, ticker <> %(t)s LIMIT 1
"""


async def latest_quote(conn: Conn, ticker: str, now: datetime, *, delay_s: int = DEFAULT_DELAY_S) -> Quote | None:
    """The freshest price of `ticker` knowable at `now` (intraday bar or daily mark), with its age."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    candidates: list[Quote] = []
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(LATEST_SQL, {"t": ticker, "delay": delay_s, "now": now})
        r = await cur.fetchone()
    if r is not None:
        traded = r["ts"] + timedelta(seconds=INTERVAL_S[r["interval"]])
        candidates.append(
            Quote(
                ticker,
                r["close"],
                traded,
                traded + timedelta(seconds=delay_s),
                (now - traded).total_seconds(),
                f"yfinance:{r['interval']}",
            )
        )
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT core.ticker_codes(%s) AS codes", (ticker,))
        codes_row = await cur.fetchone()
    codes = list((codes_row or {}).get("codes") or [ticker])
    marks = await latest_marks(conn, codes, now)  # a renamed code's daily bars live under the new code
    mark = next((marks[c] for c in codes if c in marks), None)
    if mark is not None:
        traded = session_close(mark.d) if mark.field == "close" else datetime.combine(mark.d, SESSION_OPEN, IST)
        candidates.append(
            Quote(ticker, mark.price, traded, mark.known_at, (now - traded).total_seconds(), f"isyatirim:{mark.field}")
        )
    if not candidates:
        return None
    return max(candidates, key=lambda q: q.traded_at)


@dataclass(frozen=True, slots=True)
class ArchiveStats:
    day: date
    tickers: int
    bars: int
    failed: tuple[str, ...]


async def run_intraday_archive(
    conn: Conn,
    day: date,
    *,
    client: PoliteClient,
    tickers: Sequence[str] | None = None,
    interval: Interval = "1m",
    now: datetime | None = None,
) -> ArchiveStats:
    """19:00 job: keep the day's bars (free intraday history disappears after days, 07 §15)."""
    if tickers is None:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(ARCHIVE_TICKERS_SQL, (day,))
            tickers = [r["ticker"] for r in await cur.fetchall()]
    fetched_at = now or datetime.combine(day, time(19, 0), IST)
    bars, failed = 0, []
    for t in tickers:
        try:
            bars += await store_intraday(conn, await fetch_intraday(client, t, interval=interval, day=day), fetched_at)
        except SourceError as exc:
            log.warning("intraday archive %s %s: %s", t, day, exc)
            failed.append(t)
    return ArchiveStats(day, len(tickers), bars, tuple(failed))


#: The day's universe plus everything held (paper or personal book), without duplicates.
ARCHIVE_TICKERS_SQL: Final = """
SELECT ticker FROM core.universe_daily WHERE d = %s AND is_eligible
UNION
SELECT ticker FROM trading.positions
ORDER BY 1
"""
