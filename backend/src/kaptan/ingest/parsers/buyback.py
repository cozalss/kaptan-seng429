"""E1 — "Payların Geri Alınmasına İlişkin Bildirim" (executed buybacks).

The transactions table ("Geri Alım İşlemlerinin Detayları") has one row per trade day:
    <Grup>, <TICKER>, <ISIN> <dd.mm.yyyy> <nominal TL> <ratio to capital %> <price TL> <prior nominal TL> <privileges>
Rows wrap after the ticker, so the section is flattened before matching. The planned-period table
above it has two dates per row and is read separately (program window and cap).
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Final

from kaptan.ingest.parsers.common import NUMBER, flags, form_fields, money, parse_date, section
from kaptan.text.turkish import parse_tr_decimal

LABELS: Final = (
    "Geri Alım İşlemini Gerçekleştiren Ortaklık",
    "Geri Alım İşlemine Konu Ortaklık",
    "Geri Alım İşleminin Niteliği",
    "Yönetim Kurulu Karar Tarihi",
    "Varsa Geri Alım Programının Uygulanacağı Süre",
    "Geri Alıma Konu Azami Pay Miktarı (Nominal TL)",
    "Geri Alım İçin Ayrılan Fonun Toplam Tutarı (TL)",
    "Geri Alım Yapılması Planlanan Dönem",
    "Geri Alım İşlemlerinin Detayları",
)

_TXN: Final = re.compile(
    rf"(?:(?P<group>[A-ZÇĞİÖŞÜ]\s*Grubu),\s*)?(?P<ticker>[A-Z0-9]{{3,6}}),\s*(?P<isin>TR[A-Z0-9]{{10}})\s+"
    rf"(?P<date>\d{{2}}\.\d{{2}}\.\d{{4}})\s+(?P<nominal>{NUMBER})\s+(?P<ratio>{NUMBER})\s+(?P<price>{NUMBER})"
    rf"(?:\s+(?P<prior>{NUMBER}))?"
)
_PLAN: Final = re.compile(
    rf"(?P<ticker>[A-Z0-9]{{3,6}}),\s*(?P<isin>TR[A-Z0-9]{{10}})\s+(?P<start>\d{{2}}\.\d{{2}}\.\d{{4}})\s+"
    rf"(?P<end>\d{{2}}\.\d{{2}}\.\d{{4}})\s+(?P<nominal>{NUMBER})(?:\s+(?P<ratio>{NUMBER}))?"
)


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def _transactions(text: str) -> list[dict[str, Any]]:
    table = _flat(section(text, "Geri Alım İşlemlerinin Detayları", "Ek Açıklamalar", "Yukarıdaki açıklamalarımızın"))
    rows = []
    for m in _TXN.finditer(table):
        rows.append(
            {
                "ticker": m["ticker"],
                "isin": m["isin"],
                "share_group": (m["group"] or "").strip() or None,
                "date": parse_date(m["date"]),
                "nominal_try": parse_tr_decimal(m["nominal"]),
                "capital_ratio_pct": parse_tr_decimal(m["ratio"]),
                "price_try": parse_tr_decimal(m["price"]),
                "prior_nominal_try": parse_tr_decimal(m["prior"]) if m["prior"] else None,
            }
        )
    return rows


def _plan(text: str) -> dict[str, Any] | None:
    table = _flat(section(text, "Geri Alım Yapılması Planlanan Dönem", "Geri Alım İşlemlerinin Detayları"))
    m = _PLAN.search(table)
    if not m:
        return None
    return {
        "start": parse_date(m["start"]),
        "end": parse_date(m["end"]),
        "max_nominal_try": parse_tr_decimal(m["nominal"]),
        "capital_ratio_pct": parse_tr_decimal(m["ratio"]) if m["ratio"] else None,
    }


def parse(text: str) -> dict[str, Any]:
    fields = form_fields(text, LABELS)
    txns = _transactions(text)
    total = sum((t["nominal_try"] or Decimal(0) for t in txns), Decimal(0))
    latest = max((t for t in txns if t["date"]), key=lambda t: t["date"], default=None)
    return {
        "kind": "buyback",
        **flags(text),
        "nature": fields["Geri Alım İşleminin Niteliği"],
        "board_decision_date": parse_date(fields["Yönetim Kurulu Karar Tarihi"]),
        "program_duration": fields["Varsa Geri Alım Programının Uygulanacağı Süre"],
        "max_nominal_try": money(fields["Geri Alıma Konu Azami Pay Miktarı (Nominal TL)"]),
        "fund_total_try": money(fields["Geri Alım İçin Ayrılan Fonun Toplam Tutarı (TL)"]),
        "plan": _plan(text),
        "transactions": txns,
        "total_nominal_try": total if txns else None,
        "latest": latest,
        "status": "ok" if txns else "partial",
    }
