"""Turkish number formatting and Istanbul session times, as the panel prints them on an order ticket.

Ports of kaptan-panel/src/lib/format.ts (`fmtInt`, `fmtDec`, `fmtPct`, `fmtPrice`: Intl tr-TR, i.e.
"." groups, "," decimals, half-away-from-zero on the shortest
round-trip decimal, which is what V8/ICU rounds — 1.005 → "1,01", 2.15 → "2,2") and lib/time.ts
(`istanbulIso`, `istanbulMinutes`; Istanbul is UTC+3 with no DST). Pure functions.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Final

NBSP: Final = " "
MINUS: Final = "−"  # fmtPct's sign ("−%1,1")
ISTANBUL: Final = timedelta(hours=3)


def _digits(value: float, min_frac: int, max_frac: int) -> str:
    """Intl.NumberFormat("tr-TR") body for |value| (no sign)."""
    exact = Decimal(repr(abs(float(value)))).quantize(Decimal(1).scaleb(-max_frac), rounding=ROUND_HALF_UP)
    whole, _, frac = f"{exact:f}".partition(".")
    frac = frac.rstrip("0") if max_frac > min_frac else frac
    frac = frac.ljust(min_frac, "0")
    grouped = f"{int(whole):,}".replace(",", ".")
    return f"{grouped},{frac}" if frac else grouped


def _signed(value: float, body: str) -> str:
    # Intl's signDisplay "auto": every negative number (even one that prints as 0) gets "-".
    return f"-{body}" if value < 0 else body


def fmt_int(n: float) -> str:
    """fmtInt: 1.240"""
    return _signed(n, _digits(n, 0, 0))


def fmt_dec(n: float, digits: int = 2) -> str:
    """fmtDec: 2,1 / 48,32"""
    return _signed(n, _digits(n, digits, digits))


def fmt_price(n: float) -> str:
    """fmtPrice: "48,32 TL" (no-break space)."""
    return f"{fmt_dec(n, 2)}{NBSP}TL"


def fmt_pct(ratio: float, digits: int = 1) -> str:
    """fmtPct: ratio → "%18" / "%4,2" / "−%1,1" (sign only when the printed number is not zero)."""
    value = abs(ratio * 100)
    body = _digits(value, 0, digits)
    sign = MINUS if ratio < 0 and math.floor(value * 10**digits + 0.5) > 0 else ""
    return f"{sign}%{body}"


def ist_date(at: datetime) -> date:
    """The Istanbul calendar date of an aware time."""
    return (at.astimezone(UTC) + ISTANBUL).date()


def istanbul_minutes(at: datetime) -> int:
    """Minutes since Istanbul midnight (seconds ignored, like the panel)."""
    local = at.astimezone(UTC) + ISTANBUL
    return local.hour * 60 + local.minute


def istanbul_at(day: date, hour: int, minute: int, second: int = 0) -> datetime:
    """istanbulIso(day, "HH:MM", s) as an aware UTC datetime."""
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=UTC) - ISTANBUL
