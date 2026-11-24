"""The instant tier: new important disclosures of the person's own stocks, one message per company per 30 minutes.

One pass (`instant_pass`), run every half minute by the Telegram loop:
1. every new signal that `routing.tier` calls instant enters `ops.telegram_queue` as `queued` (once: the disclosure
   index is the key, so a restart never repeats a message);
2. per company: quiet hours or /sessiz -> the rows are `held` (reason quiet) and wait for the morning message; the
   daily cap reached -> `held` (reason cap); a message to that company less than 30 minutes ago -> they stay `queued`
   and go out together later as one grouped message; otherwise one message goes out.
Nothing is dropped. At most one message a second (the Bot API's limit for one chat).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.telegram import format as fmt
from kaptan.telegram import source, store
from kaptan.telegram.botapi import BotApi, TelegramError
from kaptan.telegram.format import SignalLike
from kaptan.telegram.routing import GROUP_WINDOW, SEND_GAP_S, day_bounds, quiet_reason, tier

log = logging.getLogger("kaptan.telegram")

LOOKBACK: Final = timedelta(hours=3)
Sleep = Callable[[float], Awaitable[None]]


async def _intake(conn: DictConn, state: dict[str, Any], muted: frozenset[str], now: datetime) -> dict[int, SignalLike]:
    paired_at = state.get("paired_at")
    since = max(now - LOOKBACK, paired_at) if paired_at else now - LOOKBACK
    sigs = await source.signals_between(conn, since, now, only_important=state["level"] != "more")
    fresh = {s.disclosure_index: s for s in sigs if tier(s, state["level"]) == "instant" and s.ticker not in muted}
    seen = await store.known_indexes(conn, fresh)
    for index, sig in fresh.items():
        if index not in seen:
            await store.enqueue(conn, index, sig.ticker, sig.company, "queued", None, now)
    return fresh


async def _sigs_of(conn: DictConn, rows: list[dict[str, Any]], cache: dict[int, SignalLike]) -> list[SignalLike]:
    out: list[SignalLike] = []
    for row in rows:
        index = int(row["disclosure_index"])
        sig = cache.get(index) or await source.describe(conn, index)
        if sig is not None:
            cache[index] = sig
            out.append(sig)
    return sorted(out, key=lambda s: s.published_at)


async def instant_pass(
    conn: DictConn,
    api: BotApi,
    state: dict[str, Any],
    prefs: dict[str, Any],
    now: datetime,
    *,
    sleep: Sleep = asyncio.sleep,
) -> int:
    """One pass; returns how many messages went out. A failed send leaves its rows queued for the next pass."""
    chat_id = state.get("chat_id")
    if chat_id is None:
        return 0
    muted = frozenset(prefs["muted"])
    cache = await _intake(conn, state, muted, now)
    queued = [r for r in await store.rows_in(conn, "queued") if r["ticker"] not in muted]
    by_ticker: dict[str, list[dict[str, Any]]] = {}
    for row in queued:
        by_ticker.setdefault(str(row["ticker"] or row["company"]), []).append(row)
    start, end = day_bounds(now)
    sent_today = await store.instant_count(conn, start, end)
    sent = 0
    for ticker, rows in by_ticker.items():
        indexes = [int(r["disclosure_index"]) for r in rows]
        if quiet_reason(state, prefs, now):
            await store.move(conn, indexes, "held", "quiet", now)
        elif sent_today >= int(state["daily_cap"]):
            await store.move(conn, indexes, "held", "cap", now)
        else:
            last = await store.last_instant(conn, ticker)
            if last is not None and now - last < GROUP_WINDOW:
                continue
            sigs = await _sigs_of(conn, rows, cache)
            if not sigs:
                await store.move(conn, indexes, "done", "gone", now)
                continue
            if sent:
                await sleep(SEND_GAP_S)
            text = fmt.one(sigs[0]) if len(sigs) == 1 else fmt.group(ticker, sigs[0].company, sigs)
            try:
                await api.send_message(int(chat_id), text, reply_markup=fmt.keyboard(sigs))
            except TelegramError as exc:
                log.warning("telegram: message not sent (%s); will retry", exc.reason)
                if exc.retry_after:
                    await sleep(min(exc.retry_after, 30.0))
                continue
            await store.move(conn, indexes, "done", "instant", now)
            await store.record_sent(conn, now, "instant", [ticker], len(sigs))
            sent += 1
            sent_today += 1
    await conn.commit()
    return sent
