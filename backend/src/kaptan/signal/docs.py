"""Signals as API documents (SignalItem / SignalList) and the day's list: mine first, then the rest."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final

from kaptan.clock import istanbul_date
from kaptan.digest.store import CLOSED_DAY_NOTE, CLOSED_NOTE, default_day
from kaptan.disclosures.listing import day_bounds
from kaptan.domain.schemas._base import iso_ms
from kaptan.rules.calendar import is_trading_day
from kaptan.signal.store import Signal, signals_between
from kaptan.signal.triage import marks

MINE_RANK: Final = {"held": 0, "watched": 1, None: 2}


def item_doc(signal: Signal, triage: dict[int, str] | None = None) -> dict[str, Any]:
    return {
        "disclosure_index": signal.disclosure_index,
        "ticker": signal.ticker,
        "company_name": signal.company,
        "published_at": iso_ms(signal.published_at),
        "kind": signal.kind,
        "important": signal.important,
        "mine": signal.mine,
        "line_tr": signal.line_tr,
        "tone": signal.tone,
        "so_what_tr": signal.so_what_tr,
        "suggestion_tr": signal.suggestion_tr,
        "kap_url": signal.kap_url,
        "panel_path": signal.panel_path,
        "triage": (triage or {}).get(signal.disclosure_index),
    }


def mine_first(signals: list[Signal]) -> list[Signal]:
    """Held, then watched, then the rest; each group newest first (the input is newest first, the sort is stable)."""
    return sorted(signals, key=lambda s: MINE_RANK[s.mine])


async def triage_map(conn: Any) -> dict[int, str]:
    return {m["disclosure_index"]: m["state"] for m in await marks(conn)}


async def day_list(conn: Any, now: datetime, day: date | None = None) -> dict[str, Any]:
    """The SignalList of one Istanbul day (default: today, or the last trading day when the market is closed)."""
    today = istanbul_date(now)
    fell_back = False
    if day is None:
        day, fell_back = default_day(today)
    start, end = day_bounds(day)
    signals = mine_first(await signals_between(conn, start, end, now=now))
    triage = await triage_map(conn)
    mine = sum(1 for s in signals if s.mine)
    note = CLOSED_NOTE if fell_back else (None if is_trading_day(day) else CLOSED_DAY_NOTE)
    return {
        "day": day,
        "note": note,
        "mine_count": mine,
        "other_count": len(signals) - mine,
        "items": [item_doc(s, triage) for s in signals],
    }
