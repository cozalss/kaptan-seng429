"""Plain Turkish for the reports: one place for how a ratio, a day and a move are said."""

from __future__ import annotations

from datetime import date
from typing import Final

from kaptan.rules.format import fmt_pct, fmt_signed_pct

MONTHS_TR: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
#: A move smaller than this prints as "%0,0": it is called "değişmedi", not up or down.
FLAT: Final = 0.0005


def day_tr(d: date) -> str:
    """2026-12-06 → "6 Aralık"."""
    return f"{d.day} {MONTHS_TR[d.month - 1]}"


def day_year_tr(d: date) -> str:
    return f"{day_tr(d)} {d.year}"


def signed(ratio: float) -> str:
    """0.032 → "+%3,2"; −0.011 → "−%1,1"."""
    return fmt_signed_pct(ratio, 1)


def moved(ratio: float, subject: str) -> str:
    """("BIST 100", 0.032) → "BIST 100 %3,2 arttı"; small moves "değişmedi"."""
    if abs(ratio) < FLAT:
        return f"{subject} değişmedi"
    return f"{subject} {fmt_pct(abs(ratio), 1)} {'arttı' if ratio > 0 else 'azaldı'}"


_LOCATIVE: Final = ("ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta")


def day_locative(d: date) -> str:
    """2026-12-06 → "6 Aralık'ta" (the month's last sound and vowel decide ta/te/da/de)."""
    return f"{day_tr(d)}'{_LOCATIVE[d.month - 1]}"
