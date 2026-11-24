"""The "missed while the PC was off" note of the morning brief.

Two facts, both from the Telegram wave: the heartbeat's last gap (`kaptan.telegram.store.last_gap`: the workers did
not run for a while) and the messages the quiet hours held too long (`kaptan.alerts.announce.take_carried`, kept in
Redis; reading it clears it, so only the brief that is built for real takes it). No gap and nothing carried: None,
and the brief says nothing.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.text.turkish import IST

#: A gap older than this is not "this morning's" news any more.
GAP_FRESH: Final = timedelta(hours=24)
MIN_GAP_HOURS: Final = 0.5


def gap_sentence(gap: dict[str, Any] | None, now: datetime) -> str | None:
    """ "Bilgisayar dün 22:10'dan bu sabah 07:40'a kadar kapalıydı." for a recent gap, else None (pure)."""
    if gap is None or gap["hours"] < MIN_GAP_HOURS or now - gap["to"] > GAP_FRESH:
        return None
    start, end = gap["from"].astimezone(IST), gap["to"].astimezone(IST)
    day = "dün" if start.date() < end.date() else "bugün"
    return (
        f"Bilgisayar {day} {start:%H:%M}'dan {end:%H:%M}'a kadar kapalıydı; o sürede gelen duyurular yukarıda da var."
    )


def carried_sentence(n: int) -> str | None:
    return f"Sessiz saatlerde {n} bildirim bekleyip eskidi; önemlileri yukarıdaki listede." if n > 0 else None


async def missed_note(conn: Any, now: datetime, *, redis: Any = None) -> str | None:
    from kaptan.alerts.announce import take_carried
    from kaptan.telegram.store import last_gap

    parts = [gap_sentence(await last_gap(conn), now)]
    if redis is not None:
        parts.append(carried_sentence(await take_carried(redis)))
    said = [p for p in parts if p]
    return " ".join(said) if said else None
