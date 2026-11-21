"""Central bank rate-decision days (the only macro dates that come from an official published calendar).

Source: TCMB, "2026 Para Politikası Kurulu toplantı takvimi",
https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/PPK/2026
(public page, no key; the bank publishes the year's meeting days in advance). Checked 2026-11-21 against the
bank's own page via search. The table covers 2026 only: after it, nothing is shown, never a guess.

TÜİK's inflation release days are NOT here: the full official calendar page could not be read reliably, and a
date typed by hand is not shown (the calendar says so in its notes).
"""

from __future__ import annotations

from datetime import date
from typing import Final

SOURCE_URL: Final = (
    "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/PPK/2026"
)
PPK_2026: Final[tuple[date, ...]] = (
    date(2026, 1, 22),
    date(2026, 3, 12),
    date(2026, 4, 22),
    date(2026, 6, 11),
    date(2026, 7, 23),
    date(2026, 9, 10),
    date(2026, 10, 22),
    date(2026, 12, 10),
)
LAST_KNOWN: Final = PPK_2026[-1]
NOTE_NO_INFLATION: Final = (
    "Enflasyon açıklama günlerini göstermiyorum: resmi takvimi güvenle okuyamadım, elle yazılmış tarih koymam."
)
NOTE_NO_NEXT_YEAR: Final = "Merkez Bankası'nın bu tarihten sonraki toplantı takvimini henüz okumadım."


def rate_decision_days(start: date, end: date) -> list[date]:
    return [d for d in PPK_2026 if start <= d <= end]


def notes_for(end: date) -> list[str]:
    notes = [NOTE_NO_INFLATION]
    if end > LAST_KNOWN:
        notes.append(NOTE_NO_NEXT_YEAR)
    return notes
