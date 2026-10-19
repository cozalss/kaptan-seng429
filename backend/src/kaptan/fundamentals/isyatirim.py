"""İş Yatırım financial statements (the `MaliTablo` JSON endpoint `isyatirimhisse` wraps), parsed to
year-to-date line items, and the single-quarter / trailing-twelve-month derivations (07 §1.1, 06 §3.4).

    GET …/Common/Data.aspx/MaliTablo?companyCode=THYAO&exchange=TRY&financialGroup=XI_29
        &year1=2025&period1=12&year2=2025&period2=9&…          (≤ 4 periods per request)
    → {"ok": true, "value": [{"itemCode": "3C", "itemDescTr": "Satış Gelirleri",
                              "value1": "1125149219659", …}, …]}

Values are TL and **cumulative from the start of the fiscal year** (3, 6, 9, 12 months), with no
publication date (P3: `available_at` comes from KAP, see `kaptan.fundamentals.store`). A quarter is the
difference of consecutive YTD values (07 Rev. 3); TTM = YTD(y, m) + FY(y−1) − YTD(y−1, m).
`financialGroup` XI_29 is the industrial template. Banks and insurers report under UFRS, whose item
codes mean other lines: they are not fetched (no E3/E4 rows; E3 then falls back to market cap).

Item codes (XI_29, checked on THYAO 2024–2026):
3C Satış Gelirleri · 3DF Faaliyet Kârı · 3HCA Vergi Öncesi Diğer Gelir ve Giderler (where İş Yatırım puts
the TMS 29 net monetary position gain/loss [~]) · 3Z Ana Ortaklık Payları · 4C İşletme Faaliyetlerinden
Nakit · 2OA Ödenmiş Sermaye · 2O Ana Ortaklığa Ait Özkaynaklar.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from kaptan.prices.http import PoliteClient, SourceError

URL: Final = "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo"
GROUP: Final = "XI_29"
PERIODS_PER_REQUEST: Final = 4

#: Flow items (YTD in the source) → our quarter / TTM names.
FLOW_CODES: Final[dict[str, str]] = {
    "3C": "revenue",
    "3DF": "operating_profit",
    "3HCA": "net_monetary_position_gain",
    "3Z": "net_profit_parent",
    "4C": "cfo",
}
#: Balance-sheet items (a level at the period end).
STOCK_CODES: Final[dict[str, str]] = {"2OA": "paid_in_capital", "2O": "equity"}

Period = tuple[int, int]  # (fiscal year, months: 3 | 6 | 9 | 12)
Statements = dict[Period, dict[str, Decimal]]  # period → our base name → YTD / level value


@dataclass(frozen=True, slots=True)
class Item:
    period_end: date
    item: str  # a core.fundamentals_pit item
    value: Decimal


def period_end(p: Period) -> date:
    year, months = p
    return {3: date(year, 3, 31), 6: date(year, 6, 30), 9: date(year, 9, 30), 12: date(year, 12, 31)}[months]


def recent_periods(today: date, n: int) -> list[Period]:
    """The last `n` quarter ends strictly before `today`, newest first."""
    year, q = today.year, (today.month - 1) // 3  # quarters fully past this year
    out: list[Period] = []
    while len(out) < n:
        if q == 0:
            year, q = year - 1, 4
        out.append((year, 3 * q))
        q -= 1
    return out


def _dec(v: Any) -> Decimal | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        out = Decimal(str(v).strip())
    except (InvalidOperation, ValueError):
        return None
    return out if out.is_finite() else None


def parse_statements(payload: Any, periods: Sequence[Period]) -> Statements:
    """One MaliTablo answer → {period: {name: value}}; a period whose every mapped value is null is absent."""
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        detail = payload.get("errorCode") if isinstance(payload, dict) else type(payload).__name__
        raise SourceError(f"isyatirim MaliTablo: unexpected response ({detail})")
    names = {**FLOW_CODES, **STOCK_CODES}
    out: Statements = {}
    for row in payload.get("value") or []:
        name = names.get(str(row.get("itemCode") or ""))
        if name is None:
            continue
        for i, p in enumerate(periods, start=1):
            value = _dec(row.get(f"value{i}"))
            if value is not None:
                out.setdefault(p, {})[name] = value
    return out


async def fetch_statements(client: PoliteClient, ticker: str, periods: Sequence[Period]) -> Statements:
    """YTD statements of `periods` (≤ 4 per request, XI_29 template)."""
    out: Statements = {}
    for i in range(0, len(periods), PERIODS_PER_REQUEST):
        chunk = list(periods[i : i + PERIODS_PER_REQUEST])
        params = {"companyCode": ticker, "exchange": "TRY", "financialGroup": GROUP}
        for k, (year, months) in enumerate(chunk, start=1):
            params[f"year{k}"], params[f"period{k}"] = str(year), str(months)
        payload = await client.get_json(URL, params=params)
        if payload is not None:
            out.update(parse_statements(payload, chunk))
    return out


def _quarter(st: Statements, p: Period, name: str) -> Decimal | None:
    year, months = p
    cur = st.get(p, {}).get(name)
    if cur is None:
        return None
    if months == 3:
        return cur
    prev = st.get((year, months - 3), {}).get(name)
    return None if prev is None else cur - prev


def _ttm(st: Statements, p: Period, name: str) -> Decimal | None:
    year, months = p
    cur = st.get(p, {}).get(name)
    if cur is None:
        return None
    if months == 12:
        return cur
    fy, same = st.get((year - 1, 12), {}).get(name), st.get((year - 1, months), {}).get(name)
    return None if fy is None or same is None else cur + fy - same


def derive(st: Statements) -> list[Item]:
    """The core.fundamentals_pit items every period of `st` supports (missing inputs → no item)."""
    items: list[Item] = []
    for p in sorted(st):
        end = period_end(p)
        candidates: dict[str, Decimal | None] = {
            "revenue_q": _quarter(st, p, "revenue"),
            "operating_profit_q": _quarter(st, p, "operating_profit"),
            "net_monetary_position_gain_q": _quarter(st, p, "net_monetary_position_gain"),
            "net_profit_parent_q": _quarter(st, p, "net_profit_parent"),
            "revenue_ttm": _ttm(st, p, "revenue"),
            "net_income_ttm": _ttm(st, p, "net_profit_parent"),
            "cfo_ttm": _ttm(st, p, "cfo"),
            "revenue_annual": st[p].get("revenue") if p[1] == 12 else None,
            "paid_in_capital": st[p].get("paid_in_capital"),
            "equity": st[p].get("equity"),
        }
        items.extend(Item(end, name, v) for name, v in candidates.items() if v is not None)
    return items
