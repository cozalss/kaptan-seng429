"""Turkish text primitives (07 §8). Pure functions, no I/O.

Never use `str.lower()` / `casefold()` on Turkish text for comparison: `"İ".lower()` is two code
points ("i" + U+0307) and `"I".lower()` is "i" instead of "ı". Map the i-pair first (`tr_lower`).
Join keys never come from company titles (use the ticker or the KAP member OID); `norm_key` is for
matching, dedup and full-text search only, never for display.
"""

from __future__ import annotations

import codecs
import html
import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Final
from zoneinfo import ZoneInfo

IST: Final = ZoneInfo("Europe/Istanbul")

#: zero-width characters, bidi marks/embeddings/isolates, word joiner…invisible operators, BOM.
_INVISIBLE: Final = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿­]")
_WS: Final = re.compile(r"\s+")
_TAG: Final = re.compile(r"<[^>]+>")
_SCRIPT_STYLE: Final = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.S | re.I)
_BLOCK_TAG: Final = re.compile(r"<\s*(br|/p|/div|/tr|/li|/h[1-6]|/table)\b[^>]*>", re.I)
_PUNCT: Final = re.compile(r"[^\w\s%]")
_FOLD: Final = str.maketrans("çğıöşü", "cgiosu")

_MULT: Final = {"milyar": Decimal(10**9), "milyon": Decimal(10**6), "bin": Decimal(10**3)}
_KAP_FORMATS: Final = ("%d.%m.%Y %H:%M:%S", "%Y.%m.%d %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%d/%m/%Y")


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def tr_lower(s: str) -> str:
    """Turkish lower case: 'İ'→'i', 'I'→'ı' (no combining dot), the rest per Unicode."""
    return nfc(s).replace("İ", "i").replace("I", "ı").lower()


def tr_upper(s: str) -> str:
    """Turkish upper case: 'i'→'İ', 'ı'→'I'."""
    return nfc(s).replace("i", "İ").replace("ı", "I").upper()


def clean_text(s: str) -> str:
    """Ingest cleanup for one line: NFC, invisible/bidi characters removed, whitespace collapsed."""
    return _WS.sub(" ", _INVISIBLE.sub("", nfc(s))).strip()


def clean_multiline(s: str) -> str:
    """Like `clean_text` but keeps line breaks (form tables are read line by line); no blank runs."""
    text = _INVISIBLE.sub("", nfc(s)).replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    lines = (re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line)


def norm_key(s: str) -> str:
    """Matching / dedup / full-text key: tr_lower + punctuation → space, collapsed."""
    return _WS.sub(" ", _PUNCT.sub(" ", tr_lower(clean_text(s)))).strip()


def join_key(s: str) -> str:
    """Diacritic-free key for sources that disagree on diacritics ('Diyarbakır' = 'Diyarbakir')."""
    return norm_key(s).translate(_FOLD)


def strip_html(s: str) -> str:
    """HTML → plain text: scripts/styles dropped, block ends become newlines, entities decoded."""
    text = _SCRIPT_STYLE.sub(" ", s)
    text = _BLOCK_TAG.sub("\n", text)
    text = _TAG.sub(" ", text)
    return clean_multiline(html.unescape(text))


def parse_tr_decimal(s: str | None) -> Decimal | None:
    """'1.234.567,89' → 1234567.89 · '12,5 milyon TL' → 12500000 · '%0,25' → 0.25 · '-' → None.

    A lone dot followed by exactly three digits is a thousands separator ('8.628.000'); a dot with
    another digit count is read as a decimal point only when there is no comma ('13.19' → 13.19).
    """
    if s is None:
        return None
    t = tr_lower(clean_text(s)).replace("%", "").replace("try", "").replace("tl", "").strip()
    t = t.removesuffix("/adet").strip()
    mult = Decimal(1)
    for word, factor in _MULT.items():
        if t.endswith(word):
            t, mult = t[: -len(word)].strip(), factor
            break
    t = t.replace(" ", "")
    if not t or t in {"-", "—", "–"}:
        return None
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        return Decimal(t) * mult
    except InvalidOperation:
        return None


def parse_kap_datetime(s: str) -> datetime:
    """KAP dates ('dd.MM.yyyy HH:mm:ss' in lists, 'yyyy.MM.dd …' in detail payloads) are Istanbul local."""
    value = s.strip()
    for fmt in _KAP_FORMATS:
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=IST)
        except ValueError:
            continue
    raise ValueError(f"unrecognised KAP date: {s!r}")


def decode_bytes(b: bytes) -> tuple[str, str]:
    """Decode bytes from KAP/attachments: UTF-8 (BOM aware), then cp1254 (which accepts almost anything).

    Returns (text, encoding used) so the caller can log a non-UTF-8 source.
    """
    enc = "utf-8-sig" if b.startswith(codecs.BOM_UTF8) else "utf-8"
    try:
        return b.decode(enc), enc
    except UnicodeDecodeError:
        pass
    return b.decode("cp1254", errors="replace"), "cp1254"
