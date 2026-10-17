"""Shared helpers for the type-specific parsers (input = cleaned BildirimPdf text, one form row per line).

KAP renders every form as "label value" rows; long labels and values wrap onto the next lines. The
robust way to read them is positional: find every known label of the form in order and take the text
between one label and the next as its value (`form_fields`).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from kaptan.text.turkish import clean_text, parse_tr_decimal

NUMBER: Final = r"-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?"
_NUMBER_RE: Final = re.compile(rf"(?<![\w.,])(?:{NUMBER})(?![\w])")
_DATE_RE: Final = re.compile(r"(\d{1,2})[./](\d{1,2})[./](\d{4})")
_YES_NO: Final = re.compile(r"\b(Evet|Hayır)\b")
_EMPTY_VALUES: Final = frozenset({"", "-", "—", "–", "[]"})


def label_pattern(label: str) -> str:
    """A label as a regex: words separated by any whitespace (labels wrap), '?' tolerant of a space."""
    return r"\s*".join(re.escape(w) for w in label.replace("?", " ?").split())


def form_fields(text: str, labels: Sequence[str], *, after: str | None = None) -> dict[str, str | None]:
    """{label: value or None}, labels given in form order and searched in that order.

    Searching starts after the `after` marker when present (e.g. "Bildirim İçeriği", so a title such
    as "İhale Sonucu Hakkında" is not taken for the "İhale Sonucu" row). Labels missing from the text
    map to None; empty / '-' values to None.
    """
    pos = 0
    if after is not None and (anchor := re.search(label_pattern(after), text)):
        pos = anchor.end()
    found: list[tuple[int, int, str]] = []
    for label in labels:
        m = re.compile(label_pattern(label)).search(text, pos)
        if m:
            found.append((m.start(), m.end(), label))
            pos = m.end()
    out: dict[str, str | None] = dict.fromkeys(labels)
    for i, (_start, end, label) in enumerate(found):
        stop = found[i + 1][0] if i + 1 < len(found) else len(text)
        value = clean_text(text[end:stop].split("\n\n")[0])
        out[label] = None if value in _EMPTY_VALUES else value
    return out


def section(text: str, start: str, *ends: str) -> str:
    """Text after the first `start` label up to the first of `ends` that follows it ('' when absent)."""
    m = re.search(label_pattern(start), text)
    if not m:
        return ""
    rest = text[m.end() :]
    stops = [s.start() for e in ends if (s := re.search(label_pattern(e), rest))]
    return rest[: min(stops)] if stops else rest


def yes_no(text: str, question: str) -> bool | None:
    """'Yapılan Açıklama Güncelleme mi? Evet (Yes)' → True."""
    m = re.search(label_pattern(question) + r"\s*(Evet|Hayır)", text, re.I)
    if not m:
        return None
    return m.group(1).lower() == "evet"


def flags(text: str) -> dict[str, bool | None]:
    """The update / correction / deferral questions every ÖDA form starts with."""
    return {
        "is_update": yes_no(text, "Güncelleme mi ?"),
        "is_correction": yes_no(text, "Düzeltme mi ?"),
        "is_deferred": yes_no(text, "Ertelenmiş Bir Açıklama mı ?"),
    }


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    m = _DATE_RE.search(value)
    if not m:
        return None
    day, month, year = (int(g) for g in m.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def numbers(text: str) -> list[Decimal]:
    """Every Turkish-formatted number in reading order."""
    out: list[Decimal] = []
    for raw in _NUMBER_RE.findall(text):
        value = parse_tr_decimal(raw)
        if value is not None:
            out.append(value)
    return out


def money(value: str | None) -> Decimal | None:
    """'1.153.896.940,00 TL' → Decimal; the first number in the value."""
    if not value:
        return None
    found = numbers(value)
    return found[0] if found else None


def jsonable(value: Any) -> Any:
    """Decimals → str (exact), dates → ISO; recursive. Parsed documents are stored as JSONB."""
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(v) for v in value]
    return value


def has_yes_no(text: str) -> bool:
    return bool(_YES_NO.search(text))
