"""Corporate actions and backward adjustment factors (07 §6).

A factor multiplies every price *before* the ex-date; the adjusted price of day d is
raw(d) × Π factor(e) for all ex-dates e > d (view `core.prices_daily_adj`).

Primary source: İş Yatırım itself. Its `HGDG_KAPANIS / HG_KAPANIS` ratio is constant between
actions and jumps on an ex-date, so factor(e) = ratio(day before e) / ratio(e). The action kind
comes from the paid-in capital (`SERMAYE`) on the same two days:
- capital up and factor ≈ old/new capital → bedelsiz (bonus; the exact capital ratio is stored),
- capital up otherwise → bedelli (rights issue; TERP effect, the implied factor is stored),
- capital unchanged → temettu (cash dividend), capital down → other.
Yahoo's split/dividend events cross-check that and are the only source for tickers İş Yatırım lacks.
Movements under `MIN_EFFECT` (0.1 %) are rounding noise of the 4-decimal `HGDG_KAPANIS` and ignored.
"""

from __future__ import annotations

import itertools
from collections.abc import Sequence
from dataclasses import replace
from datetime import date
from decimal import Decimal
from typing import Final

from kaptan.prices.models import CorporateAction, DailyBar, YahooBar
from kaptan.prices.yahoo import YahooSeries

MIN_EFFECT: Final = Decimal("0.001")
BONUS_MATCH: Final = Decimal("0.01")
FACTOR_PLACES: Final = Decimal("0.000000000001")
HUNDRED: Final = Decimal(100)
ONE: Final = Decimal(1)


def bonus_factor(bonus_capital_pct: Decimal, bonus_dividend_pct: Decimal = Decimal(0)) -> Decimal:
    """Bedelsiz: 1 / (1 + (iç kaynak % + temettüden %) / 100). THYAO 2009-06-25: 313.77 + 86.23 → 0.2."""
    return ONE / (ONE + (bonus_capital_pct + bonus_dividend_pct) / HUNDRED)


def rights_factor(cum_price: Decimal, rights_pct: Decimal, subscription_price: Decimal) -> Decimal:
    """Bedelli: TERP / P_cum with TERP = (P_cum + r·S) / (1 + r), r = rights_pct / 100."""
    r = rights_pct / HUNDRED
    terp = (cum_price + r * subscription_price) / (ONE + r)
    return terp / cum_price


def dividend_factor(prev_close: Decimal, gross_dividend: Decimal) -> Decimal:
    """Temettü: (P_prev_close − D_gross) / P_prev_close."""
    return (prev_close - gross_dividend) / prev_close


def _q(x: Decimal) -> Decimal:
    return x.quantize(FACTOR_PLACES)


def _ratio(bar: DailyBar) -> Decimal | None:
    if bar.ref_adj_close is None or bar.ref_adj_close <= 0:
        return None
    return bar.ref_adj_close / bar.close


def _classify(prev: DailyBar, cur: DailyBar, factor: Decimal) -> CorporateAction:
    base = CorporateAction(ticker=cur.ticker, ex_date=cur.d, kind="other", factor=_q(factor), source="isyatirim")
    old, new = prev.capital_try, cur.capital_try
    if old and new and old > 0 and new > old:
        cap_ratio = old / new
        pct = _q((new / old - ONE) * HUNDRED)
        if abs(factor / cap_ratio - ONE) < BONUS_MATCH:
            return replace(base, kind="bedelsiz", factor=_q(cap_ratio), bonus_capital_pct=pct)
        return replace(base, kind="bedelli", rights_pct=pct)
    if old and new and new < old:
        return replace(base, note="capital decrease")
    if factor < ONE:
        cash = (prev.close * (ONE - factor)).quantize(Decimal("0.0001"))
        return replace(base, kind="temettu", cash_gross=cash, note="implied")
    return replace(base, note="factor > 1 without capital change")


def implied_from_isyatirim(bars: Sequence[DailyBar]) -> list[CorporateAction]:
    """Actions implied by one İş Yatırım response (bars of one ticker, any order)."""
    ordered = sorted(bars, key=lambda b: b.d)
    out: list[CorporateAction] = []
    for prev, cur in itertools.pairwise(ordered):
        r0, r1 = _ratio(prev), _ratio(cur)
        if r0 is None or r1 is None:
            continue
        factor = r0 / r1
        if abs(factor - ONE) > MIN_EFFECT:
            out.append(_classify(prev, cur, factor))
    return out


def _prev_close(bars: Sequence[YahooBar], ex_date: date) -> Decimal | None:
    before = [b for b in bars if b.d < ex_date]
    return before[-1].close if before else None


def from_yahoo(series: YahooSeries) -> list[CorporateAction]:
    """Actions from Yahoo events alone (tickers without İş Yatırım data)."""
    out = [
        CorporateAction(
            ticker=series.ticker,
            ex_date=s.d,
            kind="bedelsiz",
            factor=_q(s.factor),
            bonus_capital_pct=_q((s.numerator / s.denominator - ONE) * HUNDRED),
            source="yfinance",
        )
        for s in series.splits
    ]
    for v in series.dividends:
        prev = _prev_close(series.bars, v.d)
        if prev is None or prev <= v.amount:
            continue
        out.append(
            CorporateAction(
                ticker=series.ticker,
                ex_date=v.d,
                kind="temettu",
                factor=_q(dividend_factor(prev, v.amount)),
                cash_gross=v.amount,
                source="yfinance",
            )
        )
    return sorted(out, key=lambda a: (a.ex_date, a.kind))


def reconcile(
    isy: Sequence[CorporateAction], series: YahooSeries | None, *, has_isyatirim: bool
) -> list[CorporateAction]:
    """İş Yatırım actions win (exact factors, raw cash); Yahoo confirms them and covers tickers İş Yatırım
    lacks. Yahoo dividend amounts are split-adjusted to today (FROTO 2025-04-03: 1.71 = 17.10 / 10), so
    they are only noted, never stored as `cash_gross`."""
    if not has_isyatirim:
        return from_yahoo(series) if series is not None else []
    if series is None:
        return list(isy)
    splits = {s.d for s in series.splits}
    dividends = {v.d: v.amount for v in series.dividends}
    out = []
    for a in isy:
        if a.kind in ("bedelli", "other") and a.ex_date in splits:
            a = replace(a, kind="bedelsiz", note="yahoo split on ex-date")
        elif a.kind == "temettu" and a.ex_date in dividends:
            a = replace(a, note=f"implied; yahoo dividend {dividends[a.ex_date]} (split-adjusted to today)")
        out.append(a)
    return out
