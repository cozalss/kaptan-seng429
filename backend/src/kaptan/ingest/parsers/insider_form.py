"""The trade table of an E2 attachment: the part of a "Pay Alım Satım Bildirimi" that the notice itself lacks.

Real attachments come in two families, both ten columns, one row per day or per trade:
    30/10/2026 1.000.000 0 1.000.000 70.424.459,78 71.424.459,78 17,61 17,61 17,86 17,86     (MKK's form)
    30.10.2026 111.110 12.180 98.930 1.707.513 1.806.443 %2,846 %2,846 %3,011 %3,011         (the filer's own)
Columns: date, bought, sold, net, holding at day start, at day end (TL nominal), then capital % and vote %
at day start and at day end. An empty cell is "-" or missing. An English copy writes 1,160,980 and 2.95%.
A narrow column wraps a long cell onto the next line ("135.458.473," then "95"): the pieces are joined back.

A row counts only when its own sums hold (bought − sold = net, start + net = end): the check is how a misread
cell or a shifted column shows itself, so a table with any failing row gives no rows at all. Nothing is guessed.
Person names are not read here (KVKK; names are masked before any LLM call, 07 §8.1).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from kaptan.ingest.parsers.common import parse_date

_ROW: Final = re.compile(r"^\s*(?P<date>\d{1,2}[./]\d{1,2}[./]\d{4})\s+(?P<rest>\S.*)$")
_CELL_PIECE: Final = re.compile(r"^[\d.,]+$")
_CELL: Final = re.compile(r"^(?:[-–—]|%?\(?-?\d[\d.,]*\)?%?)$")
_EMPTY: Final = frozenset({"-", "–", "—"})
_TR_NUMBER: Final = re.compile(r"^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$")
_EN_NUMBER: Final = re.compile(r"^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$")
_PRICE: Final = re.compile(r"(\d[\d.]*,\d+)\s*(?:TL)?\s*[-–—]\s*(\d[\d.]*,\d+)\s*TL\s+fiyat", re.I)
_CORRECTION: Final = re.compile(r"Düzeltme\s+mi\s*\?\s*:?\s*(EVET|HAYIR)", re.I)
_SUM_TOLERANCE: Final = Decimal(1)  # filers round kuruş in the holding columns
_PCT_COLUMNS: Final = ("start_capital_pct", "start_vote_pct", "end_capital_pct", "end_vote_pct")
_MIN_NOMINALS: Final = 3  # net, start, end: without these there is nothing to check
_NOMINALS: Final = 5


@dataclass(frozen=True, slots=True)
class FormTable:
    rows: tuple[dict[str, Any], ...]
    rejected: int  # date rows whose sums did not hold (any → `rows` is empty)
    price_low_try: Decimal | None
    price_high_try: Decimal | None
    is_correction: bool | None

    @property
    def direction(self) -> str | None:
        bought = sum((r["buy_nominal_try"] or Decimal(0) for r in self.rows), Decimal(0))
        sold = sum((r["sell_nominal_try"] or Decimal(0) for r in self.rows), Decimal(0))
        if bought > 0 and sold > 0:
            return "mixed"
        if bought > 0:
            return "buy"
        if sold > 0:
            return "sell"
        return None


def _number(cell: str, pattern: re.Pattern[str], thousands: str, point: str) -> Decimal | None:
    raw = cell.strip("%")
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()").strip("%")
    if not pattern.match(raw):
        raise ValueError(cell)
    try:
        value = Decimal(raw.replace(thousands, "").replace(point, "."))
    except InvalidOperation as exc:
        raise ValueError(cell) from exc
    return -value if negative else value


def _parse_cells(cells: list[str], pattern: re.Pattern[str], thousands: str, point: str) -> list[Decimal | None] | None:
    try:
        return [None if c in _EMPTY else _number(c, pattern, thousands, point) for c in cells]
    except ValueError:
        return None


def _sums_hold(buy: Decimal | None, sell: Decimal | None, net: Decimal, start: Decimal, end: Decimal) -> bool:
    if abs(start + net - end) > _SUM_TOLERANCE:
        return False
    if buy is None and sell is None:
        return True
    return abs((buy or Decimal(0)) - (sell or Decimal(0)) - net) <= _SUM_TOLERANCE


def _build_row(day: date, values: list[Decimal | None]) -> dict[str, Any] | None:
    """Nominals align to the right (trade cells may be missing), the last four cells are the percentages."""
    nominals, pcts = values[:-4], values[-4:]
    if not _MIN_NOMINALS <= len(nominals) <= _NOMINALS or any(p is not None and not 0 <= p <= 100 for p in pcts):
        return None
    net, start, end = nominals[-3:]
    if net is None or start is None or end is None:
        return None
    trades = nominals[:-3]
    buy, sell = (trades[0], trades[1]) if len(trades) == 2 else (None, None)
    if len(trades) == 1:  # one trade cell: its side is the side of the net, and it must equal the net
        buy, sell = (trades[0], None) if net >= 0 else (None, trades[0])
    if not _sums_hold(buy, sell, net, start, end):
        return None
    return {
        "date": day,
        "buy_nominal_try": buy,
        "sell_nominal_try": sell,
        "net_nominal_try": net,
        "start_nominal_try": start,
        "end_nominal_try": end,
        **dict(zip(_PCT_COLUMNS, pcts, strict=True)),
    }


def _read_row(day: date, cells: list[str]) -> dict[str, Any] | None:
    """Turkish numbers first; the English reading only when the Turkish one cannot explain the row."""
    for pattern, thousands, point in ((_TR_NUMBER, ".", ","), (_EN_NUMBER, ",", ".")):
        values = _parse_cells(cells, pattern, thousands, point)
        row = None if values is None else _build_row(day, values)
        if row is not None:
            return row
    return None


def _price(text: str) -> tuple[Decimal | None, Decimal | None]:
    m = _PRICE.search(re.sub(r"\s+", " ", text))
    if m is None:
        return None, None
    low, high = (_parse_cells([m.group(1), m.group(2)], _TR_NUMBER, ".", ",") or [None, None])[:2]
    if low is None or high is None or low > high:
        return None, None
    return low, high


def _is_whole(cell: str) -> bool:
    raw = cell.strip("%()")
    return cell in _EMPTY or bool(_TR_NUMBER.match(raw) or _EN_NUMBER.match(raw))


def _rejoin(cells: list[str], next_line: str) -> list[str]:
    """Put the pieces on the next line back on the cells they were cut from, left to right. Only when every cut
    cell has exactly one piece; the row's sums then decide whether the result is right."""
    pieces = next_line.split()
    cut = [i for i, c in enumerate(cells) if not _is_whole(c)]
    if not cut or len(cut) != len(pieces) or not all(_CELL_PIECE.match(p) for p in pieces):
        return cells
    joined = dict(zip(cut, pieces, strict=True))
    return [c + joined.get(i, "") for i, c in enumerate(cells)]


def parse_form(text: str) -> FormTable:
    rows: list[dict[str, Any]] = []
    rejected = 0
    lines = text.split("\n")
    for i, line in enumerate(lines):
        m = _ROW.match(line)
        if m is None:
            continue
        cells = _rejoin(m["rest"].split(), lines[i + 1] if i + 1 < len(lines) else "")
        day = parse_date(m["date"])
        if day is None or not all(_CELL.match(c) for c in cells) or len(cells) < _MIN_NOMINALS + 4:
            continue  # prose that happens to start with a date
        row = _read_row(day, cells)
        if row is None:
            rejected += 1
        else:
            rows.append(row)
    low, high = _price(text)
    correction = _CORRECTION.search(text)
    return FormTable(
        rows=() if rejected else tuple(rows),
        rejected=rejected,
        price_low_try=low,
        price_high_try=high,
        is_correction=None if correction is None else correction.group(1).upper() == "EVET",
    )


_TABLE_HEAD: Final = (
    "Pay Alım Satım Bilgileri (ek belgedeki tablodan)\n"
    "İşlem Tarihi | Alım Nominal (TL) | Satım Nominal (TL) | Net Nominal (TL) | Gün Başı Nominal (TL) | "
    "Gün Sonu Nominal (TL) | Gün Başı Sermaye % | Gün Başı Oy % | Gün Sonu Sermaye % | Gün Sonu Oy %"
)
_COLUMNS: Final = (
    "buy_nominal_try",
    "sell_nominal_try",
    "net_nominal_try",
    "start_nominal_try",
    "end_nominal_try",
    *_PCT_COLUMNS,
)


def _tr_number(value: Decimal | None) -> str:
    if value is None:
        return "-"
    return f"{value:,f}".replace(",", "\0").replace(".", ",").replace("\0", ".")


def table_block(rows: tuple[dict[str, Any], ...]) -> str:
    """The rows with their column names, the way the Reader's prompt expects a table (" | " between cells)."""
    body = (" | ".join([r["date"].strftime("%d/%m/%Y"), *[_tr_number(r[c]) for c in _COLUMNS]]) for r in rows)
    return "\n".join([_TABLE_HEAD, *body])


_NO_TABLE: Final = "Ekte kontrol edilebilen bir işlem tablosu bulunamadı."
_BAD_TABLE: Final = "Ekteki işlem tablosunun toplamları tutmuyor; tablo kullanılmadı."


def merge_form(parsed: Mapping[str, Any] | None, form: FormTable | None, *, unreadable: str | None) -> dict[str, Any]:
    """The notice's parsed document with what its attachment gave (a new document).

    `attachment_status`: read (verified rows) | no_table (text, but no row that adds up) | unreadable (no text).
    Rows the notice's own form already carries are kept: there the attachment only adds to them."""
    base: dict[str, Any] = {"kind": "insider_trade", "rows": [], **(parsed or {})}
    if base["rows"]:
        return {**base, "rows_source": "form"}
    if form is None:
        reason = unreadable or "Ek okunamadı."
        return {
            **base,
            "status": "attachment_unreadable",
            "attachment_status": "unreadable",
            "attachment_reason": reason,
        }
    correction = bool(base.get("is_correction")) or bool(form.is_correction)
    doc = {**base, "is_correction": correction if form.is_correction is not None else base.get("is_correction")}
    if not form.rows:
        reason = _BAD_TABLE if form.rejected else _NO_TABLE
        return {**doc, "status": "partial", "attachment_status": "no_table", "attachment_reason": reason}
    return {
        **doc,
        "rows": list(form.rows),
        "direction": form.direction,
        "price_low_try": form.price_low_try,
        "price_high_try": form.price_high_try,
        "status": "ok",
        "rows_source": "attachment",
        "attachment_status": "read",
    }
