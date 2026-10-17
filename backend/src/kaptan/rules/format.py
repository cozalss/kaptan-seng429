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
