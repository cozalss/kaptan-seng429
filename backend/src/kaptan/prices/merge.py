"""Combine the two sources into the stored rows.

İş Yatırım has no open price and reports TL turnover, not shares. Yahoo's quote row is split-adjusted
but otherwise raw, so between two Yahoo split dates `k = HG_KAPANIS / yahoo_close` is one constant
(the splits after that stretch). Single days disagree a little (Yahoo's close is sometimes the last
trade before the closing auction: FROTO 2025-05-08 91.40 vs 90.95), so k is the *median* of the
stretch, and `raw_open = yahoo_open × k`, `raw_volume = yahoo_volume / k`. The scaled open must fall
within İş Yatırım's own [low, high] (0.5 % slack), otherwise it is left empty (THYAO 2026-08-04:
Yahoo 317.00 vs İş Yatırım low 321.00): a wrong fill level is worse than none, SimBIST then rejects
for lack of a price instead of filling at a made-up level.
"""

from __future__ import annotations

import bisect
import logging
from collections.abc import Sequence
from dataclasses import replace
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Final

from kaptan.prices.models import DailyBar, YahooBar
from kaptan.prices.yahoo import YahooSeries

log = logging.getLogger(__name__)

SLACK: Final = Decimal("0.005")
PRICE_PLACES: Final = Decimal("0.000001")


def _within(price: Decimal, low: Decimal | None, high: Decimal | None) -> bool:
    if low is None or high is None:
        return True
    return low * (1 - SLACK) <= price <= high * (1 + SLACK)


def segment_factors(
    bars: Sequence[DailyBar], yahoo_by_day: dict[date, YahooBar], split_days: Sequence[date]
) -> list[Decimal | None]:
    """Median raw/Yahoo close ratio per stretch between Yahoo split dates (index = stretch number)."""
    ratios: list[list[Decimal]] = [[] for _ in range(len(split_days) + 1)]
    for bar in bars:
        y = yahoo_by_day.get(bar.d)
        if y is not None and y.close > 0:
            ratios[bisect.bisect_right(split_days, bar.d)].append(bar.close / y.close)
    return [median(r) if r else None for r in ratios]


def with_raw_open(bars: Sequence[DailyBar], series: YahooSeries | None) -> list[DailyBar]:
    """İş Yatırım raw bars with `open` and `volume` filled from the same day's Yahoo row."""
    if series is None or not series.bars:
        return list(bars)
    by_day = {b.d: b for b in series.bars}
    split_days = sorted(s.d for s in series.splits)
    factors = segment_factors(bars, by_day, split_days)
    out = []
    for bar in bars:
        y = by_day.get(bar.d)
        k = factors[bisect.bisect_right(split_days, bar.d)]
        if y is None or k is None:
            out.append(bar)
            continue
        raw_open = (y.open * k).quantize(PRICE_PLACES, rounding=ROUND_HALF_UP)
        if not _within(raw_open, bar.low, bar.high):
            log.warning(
                "%s %s: scaled Yahoo open %s outside [%s, %s], left empty",
                bar.ticker,
                bar.d,
                raw_open,
                bar.low,
                bar.high,
            )
            out.append(bar)
            continue
        volume = (y.volume / k).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        out.append(replace(bar, open=raw_open, volume=volume, open_source="yfinance_scaled"))
    return out
