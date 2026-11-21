"""The "Kayıtlarımı indir" CSV: Turkish Excel friendly and safe to open."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from kaptan.portfolio import export


def _row(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "book_no": 1, "id": 7, "kind": "buy", "ticker": "KRGCL",
        "occurred_at": datetime(2027, 1, 11, 11, 5, tzinfo=UTC),
        "qty_delta": 120, "new_qty": None, "price": Decimal("33.480000"), "amount_try": Decimal("4017.60"),
        "commission_try": Decimal("12.50"), "commission_estimated": True, "cash_delta": Decimal("-4030.10"),
        "corrects_id": None, "note": "", "undone": False, "corrected": False,
    }  # fmt: skip
    return {**base, **over}


def test_numbers_use_a_decimal_comma_and_no_thousands_separator() -> None:
    assert export.number(Decimal("1250.5")) == "1250,50"
    assert export.number(Decimal("33.480000"), None) == "33,48"
    assert export.number(Decimal("-4030.10")) == "-4030,10"
    assert export.number(None) == ""


def test_text_cells_are_safe_in_a_spreadsheet() -> None:
    assert export.text('=HYPERLINK("x")').startswith("\"'=HYPERLINK")  # no formula, quotes doubled and wrapped
    assert export.text("+90 555") == "'+90 555"
    assert export.text("@sum") == "'@sum"
    assert export.text("a;b") == '"a;b"'
    assert export.text("iki\nsatır") == "iki satır"
    assert export.text("İstanbul Çelik ığüşö") == "İstanbul Çelik ığüşö"
    assert export.text("İ") == "İ"  # NFC: dotted capital I stays one character


def test_the_file_has_a_bom_a_semicolon_header_and_crlf_lines() -> None:
    pieces = list(export.csv_lines([_row()]))
    assert pieces[0].startswith("﻿Defter;Kayıt no;Tarih;Tür;Hisse;Adet;Fiyat (₺)")
    assert pieces[0].endswith("\r\n") and pieces[1].endswith("\r\n")
    cells = pieces[1].rstrip("\r\n").split(";")
    assert cells[:5] == ["1", "7", "11.01.2027 14:05", "Aldım", "KRGCL"]
    assert cells[5:8] == ["120", "33,48", "4017,60"]
    assert cells[8:12] == ["12,50", "Evet", "-4030,10", "Geçerli"]


def test_a_corrected_and_an_undone_row_say_so() -> None:
    assert export.line(_row(corrected=True)).split(";")[11] == "Düzeltildi"
    assert export.line(_row(undone=True)).split(";")[11] == "Geri alındı"
    fix = _row(kind="correction", corrects_id=7, new_qty=100).copy()
    cells = export.line(fix).split(";")
    assert cells[11] == "Düzeltme kaydı" and cells[12] == "7" and cells[5] == "100"
