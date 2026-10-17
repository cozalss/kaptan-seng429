"""E4 — "Finansal Rapor" (financial statements).

The BildirimPdf text carries the statements as "label  current  prior" rows (balance sheet: period end
vs. last year end; income statement: YTD vs. prior-year YTD, then the 3-month columns). We read the
first row of each line item that has at least two numbers. Values are TL as reported (TMS 29
inflation-adjusted when the company applies it); the single-quarter figure (YTD difference) and the
surprise are computed downstream (07 §1.1), not here.
"""

from __future__ import annotations

import re
from typing import Any, Final

from kaptan.ingest.parsers.common import NUMBER, numbers
from kaptan.text.turkish import clean_text, tr_lower

#: output key → line labels (first match wins; matched at line start, case-sensitive like KAP).
LINES: Final[dict[str, tuple[str, ...]]] = {
    "revenue": ("Hasılat",),
    "gross_profit": ("BRÜT KAR (ZARAR)", "TİCARİ FAALİYETLERDEN BRÜT KAR (ZARAR)"),
    "operating_profit": ("ESAS FAALİYET KARI (ZARARI)",),
    "pretax_profit": ("SÜRDÜRÜLEN FAALİYETLER VERGİ ÖNCESİ KARI (ZARARI)",),
    "net_profit": ("DÖNEM KARI (ZARARI)",),
    "net_profit_parent": ("Ana Ortaklık Payları",),
    "total_assets": ("TOPLAM VARLIKLAR",),
    "total_equity": ("TOPLAM ÖZKAYNAKLAR",),
    "equity_parent": ("Ana Ortaklığa Ait Özkaynaklar",),
    "paid_in_capital": ("Ödenmiş Sermaye",),
}

_PERIOD: Final = re.compile(r"(\d{4})\s*-\s*(\d{1,2})\.\s*3\s*Aylık Bildirim|(\d{4})\s*-\s*Yıllık Bildirim")
_FIELD: Final = re.compile(r"^(Denetim Türü|Denetim Sonucu|Sunum Para Birimi|Finansal Tablo Niteliği)\s+(.+)$", re.M)


def _line(text: str, label: str) -> tuple[Any, Any] | None:
    m = re.search(rf"^{re.escape(label)}\s+((?:{NUMBER})(?:\s+(?:{NUMBER}))+)\s*$", text, re.M)
    if not m:
        return None
    values = numbers(m.group(1))
    return (values[0], values[1]) if len(values) >= 2 else None


def parse(text: str) -> dict[str, Any]:
    fields = {k: clean_text(v) for k, v in _FIELD.findall(text)}
    period = _PERIOD.search(text)
    quarter: int | None = None
    year: int | None = None
    if period:
        if period.group(1):
            year, quarter = int(period.group(1)), int(period.group(2))
        else:
            year, quarter = int(period.group(3)), 4
    items: dict[str, dict[str, Any]] = {}
    for key, labels in LINES.items():
        for label in labels:
            pair = _line(text, label)
            if pair is not None:
                items[key] = {"current": pair[0], "prior": pair[1]}
                break
    consolidated = fields.get("Finansal Tablo Niteliği")
    return {
        "kind": "financial_report",
        "year": year,
        "quarter": quarter,
        "consolidated": None if consolidated is None else not tr_lower(consolidated).startswith("konsolide olmayan"),
        "currency": fields.get("Sunum Para Birimi"),
        "audit_type": fields.get("Denetim Türü"),
        "audit_opinion": fields.get("Denetim Sonucu"),
        "items": items,
        "status": "ok" if {"revenue", "net_profit"} <= items.keys() else ("partial" if items else "failed"),
    }
