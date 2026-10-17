"""Yahoo Finance daily bars over the public chart API (what `yfinance` calls), `<TICKER>.IS`.

Quote `open/high/low/close` are split-adjusted; `adjclose` is split + dividend adjusted and equals
İş Yatırım `HGDG_KAPANIS` (07 §6 [V]). Stored rows follow yfinance `auto_adjust=True`: close =
adjclose, O/H/L scaled by adjclose/close, `price_basis='adjusted'` (cross-check and fallback for
returns only, never a fill level). `Volume == 0` rows are fake holidays (Kurban Bayramı, Christmas)
and are dropped, as are nulls. Delisted codes answer 404 → empty.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Final

from kaptan.prices.calendar import IST
from kaptan.prices.http import PoliteClient, SourceError
from kaptan.prices.models import DailyBar, YahooBar

log = logging.getLogger(__name__)

URL: Final = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"


@dataclass(frozen=True, slots=True)
class YahooSplit:
    d: date
    numerator: Decimal
    denominator: Decimal

    @property
    def factor(self) -> Decimal:
        """Backward price factor, e.g. 10:1 (FROTO 2025-05-07) → 0.1."""
        return self.denominator / self.numerator


@dataclass(frozen=True, slots=True)
class YahooDividend:
    d: date
    amount: Decimal


@dataclass(frozen=True, slots=True)
class YahooSeries:
    ticker: str
    bars: tuple[YahooBar, ...]
    splits: tuple[YahooSplit, ...]
    dividends: tuple[YahooDividend, ...]
    dropped_zero_volume: int = 0


def symbol(ticker: str) -> str:
    return f"{ticker}.IS"


def _epoch(d: date) -> int:
    return int(datetime.combine(d, time(0), IST).timestamp())


def _ist_date(ts: Any) -> date:
    return datetime.fromtimestamp(int(ts), IST).date()


def _dec(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    out = Decimal(str(value))
    return out if out.is_finite() else None


def _events(result: dict[str, Any]) -> tuple[tuple[YahooSplit, ...], tuple[YahooDividend, ...]]:
    events = result.get("events") or {}
    splits = []
    for e in (events.get("splits") or {}).values():
        num, den = _dec(e.get("numerator")), _dec(e.get("denominator"))
        if num and den and num > 0 and den > 0:
            splits.append(YahooSplit(_ist_date(e["date"]), num, den))
    dividends = []
    for e in (events.get("dividends") or {}).values():
        amount = _dec(e.get("amount"))
        if amount and amount > 0:
            dividends.append(YahooDividend(_ist_date(e["date"]), amount))
    return tuple(sorted(splits, key=lambda s: s.d)), tuple(sorted(dividends, key=lambda v: v.d))


def parse_chart(ticker: str, payload: Any) -> YahooSeries:
    empty = YahooSeries(ticker, (), (), ())
    if payload is None:
        return empty
    chart = payload.get("chart") if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise SourceError(f"yahoo {ticker}: unexpected response")
    results = chart.get("result") or []
    if not results:
        return empty
    result = results[0]
    stamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    adj = (result.get("indicators", {}).get("adjclose") or [{}])[0].get("adjclose") or [None] * len(stamps)
    bars: dict[date, YahooBar] = {}
    dropped = 0
    for i, ts in enumerate(stamps):
        values = [_dec(quote.get(k, [None] * len(stamps))[i]) for k in ("open", "high", "low", "close", "volume")]
        o, h, lo, c, v = values
        a = _dec(adj[i]) if i < len(adj) else None
        if o is None or h is None or lo is None or c is None or c <= 0:
            continue
        if not v:  # None or 0: Yahoo's fake holiday rows (07 §6)
            dropped += 1
            continue
        bars[_ist_date(ts)] = YahooBar(_ist_date(ts), o, h, lo, c, a if a else c, v)
    splits, dividends = _events(result)
    return YahooSeries(ticker, tuple(bars[d] for d in sorted(bars)), splits, dividends, dropped)


async def fetch_chart(client: PoliteClient, ticker: str, start: date, end: date) -> YahooSeries:
    params = {
        "period1": str(_epoch(start)),
        "period2": str(_epoch(end + timedelta(days=1))),
        "interval": "1d",
        "events": "div,splits",
        "includeAdjustedClose": "true",
    }
    payload = await client.get_json(URL.format(symbol=symbol(ticker)), params=params)
    series = parse_chart(ticker, payload)
    return YahooSeries(
        ticker,
        tuple(b for b in series.bars if start <= b.d <= end),
        tuple(s for s in series.splits if start <= s.d <= end),
        tuple(v for v in series.dividends if start <= v.d <= end),
        series.dropped_zero_volume,
    )


def to_adjusted_bars(series: YahooSeries) -> list[DailyBar]:
    """yfinance `auto_adjust=True` rows (price_basis='adjusted', source='yfinance')."""
    out = []
    for b in series.bars:
        k = b.adj_close / b.close
        out.append(
            DailyBar(
                ticker=series.ticker,
                d=b.d,
                close=b.adj_close,
                source="yfinance",
                price_basis="adjusted",
                open=b.open * k,
                high=b.high * k,
                low=b.low * k,
                volume=b.volume,
            )
        )
    return out
