"""Which alert goes where, and the quiet hours (Ayarlar · Bildirimler).

`ops.preferences.alerts` holds one document (kaptan.domain.schemas.preferences.AlertPrefs); NULL means the
defaults: every kind on for the phone and this computer, no quiet hours. Quiet hours are Istanbul time. A
message that falls inside them is held in Redis (`kaptan:alerts:held`, one entry per kind: a second suggestion
adds nothing, the text is the same) and goes out when they end. The test message never waits.
`decide` is pure; `AlertWatch` (kaptan.alerts.watch) does the holding and the sending.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final, Literal

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.alerts.messages import AlertKind
from kaptan.text.turkish import IST

HELD_KEY: Final = "kaptan:alerts:held"
#: A held message older than this is dropped: it would report something long over.
HELD_MAX_AGE_H: Final = 24
#: The alert kind (kaptan.alerts.messages) -> the preference topic the person sees.
TOPIC_OF: Final[dict[str, str]] = {
    "suggestion": "suggestion",
    "part_down": "part_down",
    "watch": "watched",
    "price": "price",
    "weekly": "weekly",
}
#: The preference topics the person sees (kaptan.domain.schemas.preferences.AlertKinds).
TOPICS: Final = ("suggestion", "part_down", "watched", "price", "weekly")
NEVER_HELD: Final = frozenset({"test"})

Decision = Literal["send", "hold", "skip"]


def default_prefs() -> dict[str, Any]:
    on = {"phone": True, "desktop": True}
    return {
        "kinds": {t: dict(on) for t in TOPICS},
        "quiet": {"on": False, "start": "22:00", "end": "08:00"},
        "muted": [],
    }


def with_defaults(raw: dict[str, Any] | None) -> dict[str, Any]:
    """A stored document completed with the defaults (an older one may lack a topic)."""
    base = default_prefs()
    if not raw:
        return base
    kinds = {t: {**base["kinds"][t], **(raw.get("kinds", {}).get(t) or {})} for t in base["kinds"]}
    muted = [t for t in raw.get("muted") or [] if isinstance(t, str)]
    return {"kinds": kinds, "quiet": {**base["quiet"], **(raw.get("quiet") or {})}, "muted": muted}


def _minutes(value: str) -> int:
    hours, _, minutes = value.partition(":")
    return int(hours) * 60 + int(minutes)


def in_quiet(quiet: dict[str, Any], now: datetime) -> bool:
    """True when `now` (Istanbul clock) is inside the quiet hours; a window that crosses midnight is fine."""
    if not quiet.get("on"):
        return False
    start, end = _minutes(quiet["start"]), _minutes(quiet["end"])
    if start == end:
        return False
    local = now.astimezone(IST)
    current = local.hour * 60 + local.minute
    return start <= current < end if start < end else (current >= start or current < end)


def decide(prefs: dict[str, Any], kind: AlertKind, now: datetime) -> Decision:
    """send now, hold until the quiet hours end, or skip (the person turned this kind off for the phone)."""
    if kind == "test":
        return "send"
    topic = TOPIC_OF.get(kind)
    if topic is not None and not prefs["kinds"][topic]["phone"]:
        return "skip"
    if kind not in NEVER_HELD and in_quiet(prefs["quiet"], now):
        return "hold"
    return "send"


async def load_prefs(conn: AsyncConnection[Any]) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT alerts FROM ops.preferences WHERE id = 1")
        row = await cur.fetchone()
    raw = None if row is None else (row["alerts"] if isinstance(row, dict) else row[0])
    return with_defaults(raw if isinstance(raw, dict) else None)


async def save_prefs(conn: AsyncConnection[Any], prefs: dict[str, Any], now: datetime) -> None:
    await conn.execute("UPDATE ops.preferences SET alerts = %s, updated_at = %s WHERE id = 1", (Jsonb(prefs), now))
