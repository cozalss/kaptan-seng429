"""E2 — "Pay Alım Satım Bildirimi" (insider / major-holder trades).

Two shapes on KAP:
- the company or holder files the form itself (class ODA): a "Pay Alım Satım Bilgileri" table, one
  row per day: date, bought nominal, sold nominal, net, holding at day start / end (TL nominal), then
  four percentages (capital / votes at day start, capital / votes at day end). Empty cells are simply
  missing, so numbers are assigned from the right (the holding columns are always filled);
- MKK forwards a person's notice (class DUY, sender "KAMUYU AYDINLATMA PLATFORMU"): the data is only
  in an attachment → `status = "attachment_only"`.

Person names are **not** extracted (KVKK; names are masked before any LLM call, 07 §8.1).
Fund threshold notices are not E2 (the Reader decides from `role`); we flag `mentions_fund`.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Final

from kaptan.ingest.parsers.common import NUMBER, flags, numbers, parse_date, section
from kaptan.text.turkish import tr_lower

_DATE_BREAK: Final = re.compile(r"(\d{1,2}/\d{1,2})\s*\n\s*/\s*(\d{4})")
_ROW: Final = re.compile(r"^(?P<date>\d{1,2}/\d{1,2}/\d{4})\s+(?P<rest>.+)$", re.M)
_PCT: Final = re.compile(rf"%\s*({NUMBER})")
_PRICE_RANGE: Final = re.compile(rf"({NUMBER})\s*[–-]\s*({NUMBER})\s*TL\s*fiyat aralığı", re.I)
_RELATED: Final = re.compile(r"İlgili Şirketler\s*\[?([A-Z0-9, ]*)\]?")
_NOMINAL_COLS: Final = (
    "buy_nominal_try",
    "sell_nominal_try",
    "net_nominal_try",
    "start_nominal_try",
    "end_nominal_try",
)
_PCT_COLS: Final = ("start_capital_pct", "start_vote_pct", "end_capital_pct", "end_vote_pct")


def _row(date_text: str, rest: str) -> dict[str, Any]:
    pcts = [n for raw in _PCT.findall(rest) for n in numbers(raw)]
    head = rest.split("%", 1)[0]
    nominals = numbers(head)[-len(_NOMINAL_COLS) :]
    row: dict[str, Any] = {"date": parse_date(date_text)}
    # right-align: the holding columns are always present, leading empty trade cells are not
    padded: list[Decimal | None] = [None] * (len(_NOMINAL_COLS) - len(nominals)) + list(nominals)
    row.update(zip(_NOMINAL_COLS, padded, strict=True))
    pct_padded: list[Decimal | None] = (list(pcts) + [None] * len(_PCT_COLS))[: len(_PCT_COLS)]
    row.update(zip(_PCT_COLS, pct_padded, strict=True))
    return row


def _direction(rows: list[dict[str, Any]]) -> str | None:
    bought = sum((r["buy_nominal_try"] or Decimal(0) for r in rows), Decimal(0))
    sold = sum((r["sell_nominal_try"] or Decimal(0) for r in rows), Decimal(0))
    if not rows or (bought == 0 and sold == 0):
        return None
    if bought > 0 and sold > 0:
        return "mixed"
    return "buy" if bought > 0 else "sell"


def parse(text: str) -> dict[str, Any]:
    fixed = _DATE_BREAK.sub(r"\1/\2", text)
    table = section(fixed, "Pay Alım Satım Bilgileri", "Yukarıdaki açıklamalarımızın")
    rows = [_row(m["date"], m["rest"]) for m in _ROW.finditer(table)]
    explanation = section(fixed, "Açıklamalar", "Pay Alım Satım Bilgileri", "Bildirimlerin MKK tarafından")
    price = _PRICE_RANGE.search(explanation)
    related = _RELATED.search(fixed)
    low = tr_lower(explanation)
    status = "ok" if rows else ("attachment_only" if "ekte" in low else "partial")
    return {
        "kind": "insider_trade",
        **flags(fixed),
        "related_companies": [c.strip() for c in related.group(1).split(",") if c.strip()] if related else [],
        "rows": rows,
        "direction": _direction(rows),
        "price_low_try": numbers(price.group(1))[0] if price else None,
        "price_high_try": numbers(price.group(2))[0] if price else None,
        "mentions_fund": "fon" in low.split() or "fonu" in low or "fon)" in low,
        "status": status,
    }
