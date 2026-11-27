"""Turkish number formatting for rule traces and risk checks: the panel's lib/format.ts, byte for byte.

`Intl.NumberFormat("tr-TR")` groups thousands with "." and uses "," as the decimal mark; rounding is
half away from zero on the exact binary value of the double, which `Decimal(float)` reproduces.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Final

MINUS: Final = "−"  # "−", the panel's minus sign
NBSP: Final = " "


def _tr_number(value: float, *, min_digits: int, max_digits: int) -> str:
    q = Decimal(value).quantize(Decimal(1).scaleb(-max_digits), rounding=ROUND_HALF_UP)
    sign = "-" if q < 0 else ""
    whole, _, frac = f"{abs(q):f}".partition(".")
    frac = frac.rstrip("0")
    if len(frac) < min_digits:
        frac = frac.ljust(min_digits, "0")
    grouped = f"{int(whole):,}".replace(",", ".")
    return f"{sign}{grouped}{',' + frac if frac else ''}"


def fmt_int(n: float) -> str:
    """1240 → "1.240"."""
    return _tr_number(n, min_digits=0, max_digits=0)


def fmt_dec(n: float, digits: int = 2) -> str:
    """2.1212 → "2,1" (digits=1); always `digits` decimals."""
    return _tr_number(n, min_digits=digits, max_digits=digits)


def fmt_pct(ratio: float, digits: int = 1) -> str:
    """0.18 → "%18", 0.0031 → "%0,3", −0.0113 → "−%1,1" (no sign on a printed zero)."""
    value = abs(ratio * 100)
    body = _tr_number(value, min_digits=0, max_digits=digits)
    rounded = Decimal(value * 10**digits).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    sign = MINUS if ratio < 0 and rounded > 0 else ""
    return f"{sign}%{body}"


def fmt_signed_pct(ratio: float, digits: int = 1) -> str:
    """0.041 → "+%4,1"; negatives and zero as fmt_pct."""
    return f"+{fmt_pct(ratio, digits)}" if ratio > 0 else fmt_pct(ratio, digits)


def fmt_try(n: float) -> str:
    """432000000 → "432.000.000 TL" (plain space: the rule trace's spelling)."""
    return f"{fmt_int(round(n))} TL"


def fmt_ratio_x(n: float) -> str:
    """2.1212 → "2,1×"."""
    return f"{fmt_dec(n, 1)}×"


#: The word a number is read aloud with last ("8" → "sekiz", "12" → "on iki", "0,25" → "yirmi beş").
_ONES: Final = ("sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz")
_TENS: Final = ("", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan")
_BACK: Final = frozenset("aıou")
_VOICELESS: Final = frozenset("fsthçşkp")


def _last_word(number_text: str) -> str:
    digits = "".join(ch for ch in number_text.rpartition(",")[2] if ch.isdigit()) or "0"
    if digits[-1] != "0" or len(digits) == 1:
        return _ONES[int(digits[-1])]
    if digits[-2] != "0":
        return _TENS[int(digits[-2])]
    return "yüz" if len(digits) == 3 else "bin"


def _ending(number_text: str, case: str) -> str:
    word = _last_word(number_text)
    vowel = next(ch for ch in reversed(word) if ch in "aeıioöuü")
    back, ends_vowel = vowel in _BACK, word[-1] in "aeıioöuü"
    if case == "acc":
        v = {"a": "ı", "ı": "ı", "o": "u", "u": "u", "e": "i", "i": "i", "ö": "ü", "ü": "ü"}[vowel]
        return ("y" if ends_vowel else "") + v
    if case == "dat":
        return ("y" if ends_vowel else "") + ("a" if back else "e")
    return ("t" if word[-1] in _VOICELESS else "d") + ("an" if back else "en")  # ablative


def accusative(number_text: str) -> str:
    """ "%8" → "%8'i", "%12" → "%12'yi", "%0,25" → "%0,25'i": the ending follows the last word read aloud."""
    return f"{number_text}'{_ending(number_text, 'acc')}"


def dative(number_text: str) -> str:
    """ "%0,2" → "%0,2'ye", "%10" → "%10'a"."""
    return f"{number_text}'{_ending(number_text, 'dat')}"


def ablative(number_text: str) -> str:
    """ "%0,25" → "%0,25'ten", "%8" → "%8'den"."""
    return f"{number_text}'{_ending(number_text, 'abl')}"
