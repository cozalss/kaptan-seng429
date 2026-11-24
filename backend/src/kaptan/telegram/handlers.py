"""What the bot does with an update: /start <code>, /ayar, /sessiz, /durum and the buttons.

Only the paired chat is listened to. Before pairing, the only thing accepted is `/start <live code>`; every other
update, from any other chat, is ignored and logged (chat id and kind only, never the text).
There is no stop feature in KAPtan: /sessiz and the levels pause messages only, never the app. No button approves
a suggestion: approving moves money and stays in the app.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Final

from kaptan.alerts.prefs import load_prefs, save_prefs
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.db import DictConn
from kaptan.signal.triage import set_state
from kaptan.telegram import format as fmt
from kaptan.telegram import link, store
from kaptan.telegram.botapi import BotApi, TelegramError
from kaptan.telegram.format import esc
from kaptan.telegram.routing import LEVEL_TR, day_bounds, next_morning

log = logging.getLogger("kaptan.telegram")

TICKER_RE: Final = re.compile(r"^[A-Z0-9]{3,6}$")
MAX_MUTED: Final = 50
LEVEL_WORDS: Final = {
    "az": "less",
    "daha az": "less",
    "normal": "normal",
    "çok": "more",
    "cok": "more",
    "daha çok": "more",
}
HELP: Final = (
    "KAPtan bu sohbete bağlı. Önemli duyuruları buraya yazarım.\n"
    "/ayar az | normal | çok: kaç mesaj geleceği\n"
    "/sessiz: sabaha kadar mesaj gönderme (uygulama çalışmaya devam eder)\n"
    "/durum: bugünün sayıları"
)
LEVEL_KEYS: Final = {"less": "Daha az", "normal": "Normal", "more": "Daha çok"}


def level_keyboard() -> dict[str, Any]:
    return {"inline_keyboard": [[{"text": t, "callback_data": f"lvl:{k}"} for k, t in LEVEL_KEYS.items()]]}


async def _say(api: BotApi, chat_id: int, text: str, markup: dict[str, Any] | None = None) -> None:
    try:
        await api.send_message(chat_id, text, reply_markup=markup)
    except TelegramError as exc:
        log.warning("telegram: reply not sent (%s)", exc.reason)


async def handle_update(conn: DictConn, api: BotApi, update: dict[str, Any], now: datetime) -> None:
    state = await store.get_state(conn)
    if isinstance(update.get("callback_query"), dict):
        await _callback(conn, api, state, update["callback_query"], now)
    elif isinstance(update.get("message"), dict):
        await _message(conn, api, state, update["message"], now)
    await conn.commit()


def _chat_id(message: Any) -> int | None:
    chat = message.get("chat") if isinstance(message, dict) else None
    if isinstance(chat, dict) and chat.get("type") == "private" and isinstance(chat.get("id"), int):
        return int(chat["id"])
    return None


async def _message(conn: DictConn, api: BotApi, state: dict[str, Any], msg: dict[str, Any], now: datetime) -> None:
    chat = _chat_id(msg)
    text = str(msg.get("text") or "").strip()
    paired = state.get("chat_id")
    if chat is None or (paired is not None and chat != paired):
        log.warning("telegram: message from an unknown chat ignored (chat=%s)", chat)
        return
    command, _, rest = text.partition(" ")
    command = command.split("@", 1)[0].lower()
    if paired is None:
        if command == "/start" and link.code_matches(state, rest.strip(), now):
            await store.update(conn, now, chat_id=chat, paired_at=now, pair_code_hash=None, pair_expires_at=None)
            await _say(api, chat, "Bağlandı. Senin hisselerindeki önemli duyuruları artık buraya yazarım.\n\n" + HELP)
        else:
            log.warning("telegram: message from a chat that is not paired ignored (chat=%s)", chat)
        return
    if command == "/start":
        await _say(api, chat, HELP)
    elif command == "/ayar":
        await _ayar(conn, api, chat, state, rest.strip().lower(), now)
    elif command == "/sessiz":
        await store.update(conn, now, silent_until=next_morning(now))
        await _say(api, chat, "Tamam. Sabah mesajına kadar anlık mesaj göndermem; kalanlar sabah mesajında olur.")
    elif command == "/durum":
        await _say(api, chat, await status_text(conn, state, now))


async def _ayar(conn: DictConn, api: BotApi, chat: int, state: dict[str, Any], arg: str, now: datetime) -> None:
    level = LEVEL_WORDS.get(arg)
    if level is None:
        await _say(api, chat, f"Şu an: {LEVEL_TR[state['level']]}. Değiştirmek için seç:", level_keyboard())
        return
    await store.update(conn, now, level=level)
    await _say(api, chat, f"Tamam: {LEVEL_TR[level]}.")


async def status_text(conn: DictConn, state: dict[str, Any], now: datetime) -> str:
    start, end = day_bounds(now)
    counts = await store.counts_between(conn, start, end)
    held = len(await store.rows_in(conn, "held"))
    rows = [
        f"Bugün {counts.get('instant', 0)} anlık mesaj gönderdim (günlük sınır {state['daily_cap']}).",
        f"Sabaha kalan: {held}. Seviye: {LEVEL_TR[state['level']]}.",
    ]
    until = state.get("silent_until")
    if until is not None and now < until:
        rows.append("Şu an sessizdeyim; sabah mesajıyla devam ederim.")
    return "\n".join(rows)


# ── buttons ───────────────────────────────────────────────────────────────────


async def _callback(conn: DictConn, api: BotApi, state: dict[str, Any], cb: dict[str, Any], now: datetime) -> None:
    raw = cb.get("message")
    msg: dict[str, Any] = raw if isinstance(raw, dict) else {}
    chat = _chat_id(msg)
    cb_id = str(cb.get("id") or "")
    if state.get("chat_id") is None or chat != state["chat_id"]:
        log.warning("telegram: button from an unknown chat ignored (chat=%s)", chat)
        return
    kind, _, arg = str(cb.get("data") or "").partition(":")
    done = await _act(conn, kind, arg, now)
    try:  # answered at once: clients show a progress bar until then
        await api.answer_callback(cb_id, done[0] if done else "")
    except TelegramError as exc:
        log.warning("telegram: button not answered (%s)", exc.reason)
    if done is None or chat is None:
        return
    try:
        text = esc(str(msg.get("text") or "")) + f"\n\n<i>{esc(done[1])}</i>"
        await api.edit_message_text(chat, int(msg["message_id"]), text, reply_markup=_after(msg))
    except (TelegramError, KeyError, TypeError, ValueError) as exc:
        log.warning("telegram: message not edited (%s)", getattr(exc, "reason", type(exc).__name__))


def _after(msg: dict[str, Any]) -> dict[str, Any]:
    """The buttons left after one was pressed: only the link stays."""
    rows = (msg.get("reply_markup") or {}).get("inline_keyboard") or []
    links = [b for row in rows for b in row if isinstance(b, dict) and "url" in b]
    return {"inline_keyboard": [links] if links else []}


async def _act(conn: DictConn, kind: str, arg: str, now: datetime) -> tuple[str, str] | None:
    """(toast, line added to the message) or None for an unknown or failed button."""
    try:
        if kind == fmt.CB_READ and arg.isdigit():
            await _triage(conn, int(arg), "tamam", now)
            return "Okundu", "✓ Okundu"
        if kind == fmt.CB_LATER and arg.isdigit():
            await _triage(conn, int(arg), "sonra", now)
            return "Sonra okunacaklara eklendi", "Sonra oku listesinde"
        if kind == fmt.CB_READ_ALL:
            ticker, _, stamp = arg.partition(":")
            return await _read_all(conn, ticker, stamp, now)
        if kind == fmt.CB_MUTE:
            return await _mute(conn, arg, now)
        if kind == "lvl" and arg in LEVEL_KEYS:
            await store.update(conn, now, level=arg)
            return LEVEL_TR[arg], f"Seviye: {LEVEL_TR[arg]}"
    except ApiError:
        return None
    return None


async def _triage(conn: DictConn, index: int, state: str, now: datetime) -> None:
    """Okudum (tamam) / Sonra oku (sonra): the triage store of SIGNAL, which also marks the disclosure read."""
    await set_state(conn, index, state, now=now)  # type: ignore[arg-type]  # 404 (ApiError) when it is gone


async def _read_all(conn: DictConn, ticker: str, stamp: str, now: datetime) -> tuple[str, str] | None:
    if not TICKER_RE.fullmatch(ticker) or not stamp.isdigit():
        return None
    cur = await conn.execute(
        "SELECT disclosure_index FROM core.disclosures WHERE (primary_ticker = %s OR %s = ANY(stock_codes))"
        " AND published_at <= to_timestamp(%s) AND published_at > to_timestamp(%s) - interval '1 day'"
        " ORDER BY published_at DESC LIMIT 20",
        (ticker, ticker, int(stamp), int(stamp)),
    )
    for row in await cur.fetchall():
        await _triage(conn, int(row["disclosure_index"]), "tamam", now)
    return "Okundu", "✓ Hepsi okundu"


async def _mute(conn: DictConn, ticker: str, now: datetime) -> tuple[str, str] | None:
    if not TICKER_RE.fullmatch(ticker):
        return None
    prefs = await load_prefs(conn)
    if ticker not in prefs["muted"]:
        if len(prefs["muted"]) >= MAX_MUTED:
            return None
        prefs = {**prefs, "muted": [*prefs["muted"], ticker]}
        await save_prefs(conn, prefs, now)
        await append(
            conn,
            [AuditDraft("system:telegram", "preferences.alerts_changed", "preferences", "alerts", {"muted": ticker})],
        )
    return f"{ticker} susturuldu", f"🔕 {ticker} susturuldu. Ayarlar'dan geri açabilirsin."


# The two button effects the cloud watcher's queue reuses (kaptan.cloud.actions): same stores, same audit.
apply_triage = _triage
apply_mute = _mute
