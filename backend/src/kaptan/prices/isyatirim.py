"""İş Yatırım daily data (the `HisseTekil` JSON endpoint `isyatirimhisse` wraps, called directly).

Per row: `HG_KAPANIS/HG_MIN/HG_MAX` = raw close/low/high, `HG_HACIM` = TL turnover, `HGDG_KAPANIS` =
adjusted close (bonus/rights *and* dividends, as of the request day), `SERMAYE` = paid-in capital,
`PD` / `HAO_PD` = market cap / free-float market cap. No open price: `merge.with_raw_open()` scales
Yahoo's split-adjusted open to the raw level. Delisted codes (e.g. TRKCM) still answer here while
Yahoo returns 404; renamed codes answer under the new code only (KOZAL → TRALT, 07 §6).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

from kaptan.prices.calendar import FIRST_YEAR, LAST_YEAR, is_trading_day
from kaptan.prices.http import PoliteClient, SourceError
from kaptan.prices.models import DailyBar

log = logging.getLogger(__name__)

URL: Final = "https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil"
CHUNK_DAYS: Final = 365
DATE_FMT: Final = "%d-%m-%Y"


def _dec(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        out = Decimal(str(value))
    except ArithmeticError:
        return None
    return out if out.is_finite() else None


def chunks(start: date, end: date, days: int = CHUNK_DAYS) -> list[tuple[date, date]]:
    """[start, end] split into inclusive windows of at most `days` days."""
    if end < start:
        return []
    out: list[tuple[date, date]] = []
    lo = start
    while lo <= end:
        hi = min(end, lo + timedelta(days=days - 1))
        out.append((lo, hi))
        lo = hi + timedelta(days=1)
    return out


def parse_rows(ticker: str, payload: Any) -> list[DailyBar]:
    """The endpoint's JSON → raw bars, ascending; drops non-session days and rows without a close."""
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        detail = payload.get("errorCode") if isinstance(payload, dict) else type(payload).__name__
        raise SourceError(f"isyatirim {ticker}: unexpected response ({detail})")
    bars: dict[date, DailyBar] = {}
    for row in payload.get("value") or []:
        try:
            d = datetime.strptime(str(row["HGDG_TARIH"]), DATE_FMT).date()
        except (KeyError, ValueError):
            log.warning("isyatirim %s: row without a valid date skipped", ticker)
            continue
        close = _dec(row.get("HG_KAPANIS"))
        if close is None or close <= 0:
            continue
        if FIRST_YEAR <= d.year <= LAST_YEAR and not is_trading_day(d):
            log.info("isyatirim %s: %s is not a BIST session, row dropped", ticker, d)
            continue
        bars[d] = DailyBar(
            ticker=ticker,
            d=d,
            close=close,
            source="isyatirim",
            price_basis="raw",
            high=_dec(row.get("HG_MAX")),
            low=_dec(row.get("HG_MIN")),
            turnover_try=_dec(row.get("HG_HACIM")),
            mcap_try=_dec(row.get("PD")),
            free_float_mcap_try=_dec(row.get("HAO_PD")),
            capital_try=_dec(row.get("SERMAYE")),
            ref_adj_close=_dec(row.get("HGDG_KAPANIS")),
        )
    return [bars[d] for d in sorted(bars)]


async def fetch_daily(client: PoliteClient, ticker: str, start: date, end: date) -> list[DailyBar]:
    """Raw daily bars for [start, end], one request per ≤ 1-year chunk."""
    out: list[DailyBar] = []
    for lo, hi in chunks(start, end):
        params = {"hisse": ticker, "startdate": lo.strftime(DATE_FMT), "enddate": hi.strftime(DATE_FMT)}
        payload = await client.get_json(URL, params=params)
        if payload is None:
            continue
        out.extend(parse_rows(ticker, payload))
    return out
