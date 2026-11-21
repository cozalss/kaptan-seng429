"""Turning the text cells of a file into typed rows with the person's column mapping. Never guesses.

- A type word of the file is only understood when it is in KNOWN_TYPES (a short list of plain words) or the person
  told us what it is (`mapping.types`). Any other word is reported back as unknown; its rows wait.
- Dates: `gg.aa.yyyy`, `gg/aa/yyyy`, `gg-aa-yyyy` (day first: this is a Turkish statement) or `yyyy-aa-gg`, with an
  optional time. Two-digit years are refused.
- Numbers: with both `.` and `,` the last one is the decimal mark; a lone `,` is a decimal comma (several are
  thousands); a lone `.` is a decimal point unless exactly three digits follow it (`1.234`: could be one thousand
  two hundred, could be 1,234), which is refused as unclear, never guessed. Excel files arrive with plain dot numbers
  (`number_style="dot"`), where a lone dot is always a decimal point.
- A row's hash (SHA-256) covers date, kind, share, quantity, price, commission, amount and the row's place among
  identical rows of the same file, so two equal fills the same day are two rows, and the same file twice is the same.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Final

from kaptan.domain.schemas.imports import ImportKind, ImportMapping, TypeChoice
from kaptan.prices.calendar import IST

KNOWN_TYPES: Final[dict[str, ImportKind]] = {
    "alis": "buy",
    "alim": "buy",
    "al": "buy",
    "hisse alis": "buy",
    "alis islemi": "buy",
    "buy": "buy",
    "purchase": "buy",
    "satis": "sell",
    "sat": "sell",
    "hisse satis": "sell",
    "satis islemi": "sell",
    "sell": "sell",
    "sale": "sell",
    "para yatirma": "deposit",
    "yatirma": "deposit",
    "para girisi": "deposit",
    "nakit yatirma": "deposit",
    "deposit": "deposit",
    "para cekme": "withdrawal",
    "cekme": "withdrawal",
    "para cikisi": "withdrawal",
    "nakit cekme": "withdrawal",
    "withdrawal": "withdrawal",
    "temettu": "dividend",
    "kar payi": "dividend",
    "temettu odemesi": "dividend",
    "dividend": "dividend",
}
FOLD: Final = str.maketrans("ışğçöüâîû", "isgcouaiu")
DATE_RE: Final = re.compile(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$")
ISO_RE: Final = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?")
TICKER_RE: Final = re.compile(r"^[A-Z0-9]{3,6}$")
NOISE: Final = re.compile(r"[₺$€]|\b(?:TL|TRY)\b", re.IGNORECASE)
MAX_QTY: Final = 10**9
MAX_MONEY: Final = Decimal(10) ** 10


def type_key(raw: str) -> str:
    """A type word in the one form used to look it up: Turkish-folded, lowercase, plain letters and single spaces."""
    text = raw.replace("İ", "i").replace("I", "ı").lower().translate(FOLD)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text).split())[:60]


@dataclass(frozen=True, slots=True)
class Parsed:
    """One row of the file, understood (or not): `error` is the plain reason it was not."""

    index: int
    day: date | None = None
    moment: datetime | None = None
    kind: ImportKind | None = None
    ticker: str | None = None
    qty: int | None = None
    price: Decimal | None = None
    commission: Decimal | None = None
    amount: Decimal | None = None
    error: str = ""
    skipped: bool = False
    unknown_type: str = ""


def parse_date(text: str) -> tuple[date, datetime] | None:
    """(the day, the moment: the given time or noon) in Istanbul, or None when the text is not a date."""
    m = DATE_RE.match(text.strip())
    parts: tuple[str, ...]
    if m:
        d, mo, y, hh, mi, ss = m.groups()
        parts = (y, mo, d, hh or "", mi or "", ss or "")
    else:
        iso = ISO_RE.match(text.strip())
        if not iso:
            return None
        parts = iso.groups("")
    try:
        day = date(int(parts[0]), int(parts[1]), int(parts[2]))
        at = time(int(parts[3]), int(parts[4]), int(parts[5] or 0)) if parts[3] else time(12, 0)
    except ValueError:
        return None
    return day, datetime.combine(day, at, IST)


def parse_number(text: str, style: str = "auto") -> Decimal | None:
    """The number in the text, or None when it is not one or is unclear (see the module docstring)."""
    s = NOISE.sub("", text).replace(" ", "").replace(" ", "").strip()
    sign = -1 if s.startswith("-") or (s.startswith("(") and s.endswith(")")) else 1
    s = s.strip("-+()")
    if not re.fullmatch(r"[0-9.,]+", s) or not re.search(r"\d", s):
        return None
    dots, commas = s.count("."), s.count(",")
    if dots and commas:
        decimal = "." if s.rfind(".") > s.rfind(",") else ","
        if s.count(decimal) > 1:
            return None
    elif commas:
        decimal = "," if commas == 1 else ""
    elif dots:
        tail = s.rsplit(".", 1)[1]
        if dots > 1:
            decimal = ""
        elif style == "dot" or len(tail) != 3:
            decimal = "."
        else:
            return None
    else:
        decimal = ""
    thousands = "," if decimal == "." else "."
    s = s.replace(thousands, "").replace(decimal, ".") if decimal else s.replace(".", "").replace(",", "")
    try:
        return sign * Decimal(s)
    except InvalidOperation:
        return None


def _cell(row: list[str], col: int | None) -> str:
    return row[col].strip() if col is not None and col < len(row) else ""


def _kind_of(row: list[str], mapping: ImportMapping) -> tuple[ImportKind | None, str, str, bool]:
    """(kind, error, unknown word, skipped)."""
    if mapping.fixed_kind is not None:
        return mapping.fixed_kind, "", "", False
    raw = _cell(row, mapping.type)
    if not raw:
        return None, "İşlem türü boş.", "", False
    key = type_key(raw)
    choice: TypeChoice | None = mapping.types.get(key) or KNOWN_TYPES.get(key)
    if choice is None:
        return None, f"“{raw[:40]}” ne demek, bilmiyorum. Ne olduğunu sen seç.", key, False
    if choice == "skip":
        return None, "Bu türü almayacağını söyledin.", "", True
    return choice, "", "", False


def _money(text: str, label: str, style: str) -> tuple[Decimal | None, str]:
    if not text:
        return None, ""
    value = parse_number(text, style)
    if value is None:
        return None, f"{label} sayısını net okuyamadım: “{text[:30]}”."
    return abs(value), ""


def parse_row(index: int, row: list[str], mapping: ImportMapping, style: str) -> Parsed:
    kind, err, unknown, skipped = _kind_of(row, mapping)
    if kind is None:
        return Parsed(index, error=err, unknown_type=unknown, skipped=skipped)
    when = parse_date(_cell(row, mapping.date))
    if when is None:
        return Parsed(index, kind=kind, error="Tarihi okuyamadım. gg.aa.yyyy ya da yyyy-aa-gg bekliyorum.")
    day, moment = when
    fields = {}
    for name, col, label in (
        ("price", mapping.price, "Fiyat"),
        ("commission", mapping.commission, "Komisyon"),
        ("amount", mapping.amount, "Tutar"),
    ):
        value, err = _money(_cell(row, col), label, style)
        if err:
            return Parsed(index, day, moment, kind, error=err)
        fields[name] = value
    return _finish(index, row, mapping, style, kind, day, moment, fields)


def _finish(
    index: int,
    row: list[str],
    mapping: ImportMapping,
    style: str,
    kind: ImportKind,
    day: date,
    moment: datetime,
    fields: dict[str, Decimal | None],
) -> Parsed:
    price, commission, amount = fields["price"], fields["commission"], fields["amount"]

    def bad(why: str, ticker: str | None = None, qty: int | None = None) -> Parsed:
        return Parsed(index, day, moment, kind, ticker, qty, price, commission, amount, error=why)

    if kind in ("deposit", "withdrawal"):
        if amount is None or amount <= 0 or amount > MAX_MONEY:
            return bad("Tutar yok ya da okunamadı.")
        return Parsed(index, day, moment, kind, amount=amount)
    ticker = _cell(row, mapping.ticker).upper()
    if not TICKER_RE.fullmatch(ticker):
        return bad("Hisse kodu yok ya da tanıdık değil.")
    if kind == "dividend":
        if amount is None or amount <= 0 or amount > MAX_MONEY:
            return bad("Kâr payı tutarı yok ya da okunamadı.", ticker)
        return Parsed(index, day, moment, kind, ticker, amount=amount)
    qty_text = _cell(row, mapping.qty)
    q = parse_number(qty_text, style) if qty_text else None
    if q is None or q != q.to_integral_value() or not 0 < abs(q) <= MAX_QTY:
        return bad("Adet yok, okunamadı ya da tam sayı değil.", ticker)
    qty = int(abs(q))
    if price is None and amount is not None and amount > 0:
        price = (amount / qty).quantize(Decimal("0.0001"))
    if price is None or price <= 0 or price > MAX_MONEY:
        return bad("Fiyat yok ya da okunamadı.", ticker, qty)
    return Parsed(index, day, moment, kind, ticker, qty, price, commission, amount)


def rows_of(table: list[list[str]], mapping: ImportMapping, style: str) -> list[Parsed]:
    start = 1 if mapping.has_header else 0
    return [parse_row(i, table[i], mapping, style) for i in range(start, len(table))]


def row_hashes(rows: list[Parsed]) -> dict[int, str]:
    """Hash of every understood row, by index (rows with an error have none)."""
    seen: dict[str, int] = {}
    out: dict[int, str] = {}
    for r in rows:
        if r.error or r.kind is None or r.day is None:
            continue
        stamp = r.moment.isoformat(timespec="minutes") if r.moment else r.day.isoformat()
        body = "|".join(str(x) for x in (stamp, r.kind, r.ticker, r.qty, r.price, r.commission, r.amount))
        n = seen.get(body, 0)
        seen[body] = n + 1
        out[r.index] = hashlib.sha256(f"{body}|{n}".encode()).hexdigest()
    return out


def header_key(table: list[list[str]]) -> str:
    """A fingerprint of the first row (its words), so a saved mapping is only offered to the same layout."""
    return hashlib.sha256("|".join(type_key(c) for c in (table[0] if table else [])).encode()).hexdigest()[:32]
