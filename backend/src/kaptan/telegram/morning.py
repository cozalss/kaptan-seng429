"""The morning message (08:45 Istanbul, trading days), the weekend summary (last trading day, 18:30) and the
"you were away" message.

One message each, in plain Turkish, nothing about money. Held rows (quiet hours, daily cap, /sessiz) are carried
into the next morning message and marked done there; nothing is dropped. No Monday double: the weekend summary is
recorded, and the next morning covers only what came after it.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.rules.calendar import is_trading_day
from kaptan.telegram import format as fmt
from kaptan.telegram import source, store
from kaptan.telegram.botapi import BotApi, TelegramError
from kaptan.telegram.format import SignalLike, esc
from kaptan.text.turkish import IST

log = logging.getLogger("kaptan.telegram")

CLOSE: Final = time(18, 0)
TOP_OTHERS: Final = 5
MAX_MINE: Final = 12
NOTHING_MINE: Final = "Senin hisselerinde önemli bir şey yok."
CAP_NOTE: Final = "Günlük mesaj sınırı dolduğu için bazıları sabaha kaldı; hepsi yukarıda."
CARRIED_NOTE: Final = "Sessiz saatlerde {n} bildirim kalmıştı; ayrıntısı uygulamada."


def previous_trading_day(day: date) -> date:
    d = day - timedelta(days=1)
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d


def _line(sig: SignalLike) -> str:
    who = esc(sig.ticker) if sig.ticker else esc(sig.company)
    return f"• <b>{who}</b>: {esc(sig.line_tr)} ({fmt.tone_mark(sig.tone)})"


def _section(title: str, sigs: list[SignalLike], limit: int) -> list[str]:
    rows = [title, *(_line(s) for s in sigs[:limit])]
    if len(sigs) > limit:
        rows.append(f"… ve {len(sigs) - limit} duyuru daha (uygulamada)")
    return rows


async def _carried(conn: DictConn) -> tuple[list[SignalLike], bool, list[int]]:
    """The held signals, whether any waited for the cap, and their indexes."""
    rows = await store.rows_in(conn, "held") + await store.rows_in(conn, "morning")
    out: list[SignalLike] = []
    for row in rows:
        sig = await source.describe(conn, int(row["disclosure_index"]))
        if sig is not None:
            out.append(sig)
    return out, any(r["reason"] == "cap" for r in rows), [int(r["disclosure_index"]) for r in rows]


def _merge(*groups: list[SignalLike]) -> list[SignalLike]:
    seen: dict[int, SignalLike] = {}
    for g in groups:
        for s in g:
            seen.setdefault(s.disclosure_index, s)
    return sorted(seen.values(), key=lambda s: s.published_at)


async def _since(conn: DictConn, day: date) -> datetime:
    start = datetime.combine(previous_trading_day(day), CLOSE, IST)
    last = await store.last_sent(conn, "weekend")
    return max(start, last) if last is not None else start


async def build_morning(
    conn: DictConn, now: datetime, muted: frozenset[str], *, carried_notes: int = 0
) -> tuple[str, list[int]]:
    """(the text, the held indexes it carried)."""
    day = now.astimezone(IST).date()
    since = await _since(conn, day)
    fresh = [s for s in await source.signals_between(conn, since, now, only_important=True) if s.ticker not in muted]
    held, capped, held_ids = await _carried(conn)
    held = [s for s in held if s.ticker not in muted]
    mine = _merge([s for s in fresh if s.mine], [s for s in held if s.mine])
    others = [s for s in fresh if not s.mine][:TOP_OTHERS]
    when = "Dün akşamdan beri" if previous_trading_day(day) == day - timedelta(days=1) else "Son iş gününden beri"
    rows = ["Günaydın."]
    if mine:
        rows += _section(f"{when} senin hisselerinde:", mine, MAX_MINE)
    else:
        rows.append(NOTHING_MINE)
    if others:
        rows += ["", *_section("Günün öne çıkanları:", others, TOP_OTHERS)]
    if capped:
        rows += ["", CAP_NOTE]
    if carried_notes:
        rows += ["", CARRIED_NOTE.format(n=carried_notes)]
    return "\n".join(rows), held_ids


async def build_weekend(conn: DictConn, now: datetime, muted: frozenset[str]) -> tuple[str, list[int]]:
    day = now.astimezone(IST).date()
    since = datetime.combine(day, time(8, 45), IST)
    fresh = [s for s in await source.signals_between(conn, since, now, only_important=True) if s.ticker not in muted]
    held, _capped, held_ids = await _carried(conn)
    mine = _merge([s for s in fresh if s.mine], [s for s in held if s.mine and s.ticker not in muted])
    rows = ["İyi akşamlar. Borsa yarın kapalı."]
    rows += _section("Bugün senin hisselerinde:", mine, MAX_MINE) if mine else [NOTHING_MINE]
    rows.append("Bir sonraki iş günü sabahı yine yazarım.")
    return "\n".join(rows), held_ids


def gap_text(hours: float, sigs: list[SignalLike]) -> str:
    shown = f"{hours:.0f}" if hours >= 10 else f"{hours:.1f}".replace(".", ",")
    if not sigs:
        return f"KAPtan {shown} saat kapalıydı; bu sürede senin hisselerinde önemli duyuru olmadı."
    rows = [f"KAPtan {shown} saat kapalıydı; bu sürede senin hisselerinde {len(sigs)} önemli duyuru oldu:"]
    rows += [_line(s) for s in sigs[:MAX_MINE]]
    return "\n".join(rows)


async def _send(conn: DictConn, api: BotApi, chat_id: int, text: str, kind: str, ids: list[int], now: datetime) -> bool:
    try:
        await api.send_message(chat_id, text)
    except TelegramError as exc:
        log.warning("telegram: %s message not sent (%s)", kind, exc.reason)
        return False
    await store.move(conn, ids, "done", kind, now)
    await store.record_sent(conn, now, kind, [], 1)
    return True


async def send_morning(
    conn: DictConn, api: BotApi, state: dict[str, Any], muted: frozenset[str], now: datetime, *, carried_notes: int = 0
) -> bool:
    if state.get("chat_id") is None:
        return False
    text, ids = await build_morning(conn, now, muted, carried_notes=carried_notes)
    ok = await _send(conn, api, int(state["chat_id"]), text, "morning", ids, now)
    if ok:
        await store.update(conn, now, morning_sent_on=now.astimezone(IST).date())
    await conn.commit()
    return ok


async def send_weekend(
    conn: DictConn, api: BotApi, state: dict[str, Any], muted: frozenset[str], now: datetime
) -> bool:
    day = now.astimezone(IST).date()
    if state.get("chat_id") is None or is_trading_day(day + timedelta(days=1)):
        return False
    text, ids = await build_weekend(conn, now, muted)
    ok = await _send(conn, api, int(state["chat_id"]), text, "weekend", ids, now)
    await conn.commit()
    return ok


async def send_gap(
    conn: DictConn, api: BotApi, state: dict[str, Any], gap: tuple[datetime, datetime], now: datetime
) -> bool:
    """ "KAPtan X saat kapalıydı ...": one message after a gap of more than 30 minutes, then the gap is marked told."""
    if state.get("chat_id") is None:
        return False
    sigs = await source.signals_between(conn, gap[0], gap[1], only_important=True, only_mine=True)
    hours = (gap[1] - gap[0]).total_seconds() / 3600
    try:
        await api.send_message(int(state["chat_id"]), gap_text(hours, sigs))
    except TelegramError as exc:
        log.warning("telegram: gap message not sent (%s)", exc.reason)
        return False
    for sig in sigs:  # told now: the instant tier must not repeat them
        await store.enqueue(conn, sig.disclosure_index, sig.ticker, sig.company, "done", "gap", now)
    await store.record_sent(conn, now, "gap", [], 1)
    await store.mark_gap_told(conn)
    await conn.commit()
    return True
