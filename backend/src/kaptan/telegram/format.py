"""What a Telegram message looks like. Pure functions: HTML parse mode, every dynamic text escaped.

A message names the company and carries one plain line (decision of 2026-11-24). It never carries the person's
money: no share count, amount, price paid or profit and loss. Company names can hold `&` `<` `>`, which Telegram's
HTML mode would read as markup (https://core.telegram.org/bots/api#html-style), so they pass through `esc`.
There is deliberately NO approve button: approving moves money and stays in the app.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from html import escape
from typing import Any, Final, Protocol

from kaptan.text.turkish import IST

TONE_MARK: Final = {"olumlu": "▲ olumlu", "olumsuz": "▼ olumsuz", "notr": "• nötr", "belirsiz": "• nötr"}
MAX_LINES: Final = 8
CB_READ: Final = "ok"
CB_LATER: Final = "later"
CB_MUTE: Final = "mute"
CB_READ_ALL: Final = "okt"


class SignalLike(Protocol):
    """The fields of `kaptan.signal.Signal` this module reads (frozen dataclass there)."""

    @property
    def disclosure_index(self) -> int: ...
    @property
    def ticker(self) -> str | None: ...
    @property
    def company(self) -> str: ...
    @property
    def published_at(self) -> datetime: ...
    @property
    def important(self) -> bool: ...
    @property
    def mine(self) -> str | None: ...
    @property
    def line_tr(self) -> str: ...
    @property
    def tone(self) -> str: ...
    @property
    def so_what_tr(self) -> str | None: ...
    @property
    def suggestion_tr(self) -> str | None: ...
    @property
    def kap_url(self) -> str: ...


def esc(text: str) -> str:
    """`<`, `>` and `&` as entities (quotes are fine outside attributes)."""
    return escape(text, quote=False)


def clock(at: datetime) -> str:
    return at.astimezone(IST).strftime("%H:%M")


def head(sig: SignalLike) -> str:
    who = esc(sig.ticker) if sig.ticker else esc(sig.company)
    return f"<b>{who}</b> · {esc(sig.company)}" if sig.ticker else f"<b>{who}</b>"


def tone_mark(tone: str) -> str:
    return TONE_MARK.get(tone, TONE_MARK["notr"])


def one(sig: SignalLike) -> str:
    """One disclosure: head, line + tone, the so-what, KAPtan's word, the time."""
    rows = [head(sig), f"{esc(sig.line_tr)} ({tone_mark(sig.tone)})"]
    if sig.so_what_tr:
        rows.append(esc(sig.so_what_tr))
    if sig.suggestion_tr:
        rows.append(esc(sig.suggestion_tr))
    rows.append(f"<i>{clock(sig.published_at)}</i>")
    return "\n".join(rows)


def group(ticker: str, company: str, sigs: Sequence[SignalLike]) -> str:
    """A burst for one company: "THYAO: 3 yeni duyuru" and one line each."""
    rows = [f"<b>{esc(ticker)}</b> · {esc(company)}: {len(sigs)} yeni duyuru"]
    for sig in sigs[:MAX_LINES]:
        rows.append(f"• {esc(sig.line_tr)} ({tone_mark(sig.tone)}) <i>{clock(sig.published_at)}</i>")
    if len(sigs) > MAX_LINES:
        rows.append(f"… ve {len(sigs) - MAX_LINES} duyuru daha")
    return "\n".join(rows)


def keyboard(sigs: Sequence[SignalLike]) -> dict[str, Any]:
    """Okudum / Sonra oku / Aç (the KAP page: the panel link is localhost, useless on a phone) / Bu şirketi sustur."""
    last = max(sigs, key=lambda s: s.published_at)
    ticker = last.ticker
    if len(sigs) == 1:
        read = {"text": "Okudum", "callback_data": f"{CB_READ}:{last.disclosure_index}"}
    else:
        stamp = int(last.published_at.timestamp())
        read = {"text": "Okudum", "callback_data": f"{CB_READ_ALL}:{ticker}:{stamp}"}
    rows: list[list[dict[str, str]]] = [
        [read, {"text": "Sonra oku", "callback_data": f"{CB_LATER}:{last.disclosure_index}"}],
        [{"text": "Aç", "url": last.kap_url}],
    ]
    if ticker:
        rows[1].append({"text": "Bu şirketi sustur", "callback_data": f"{CB_MUTE}:{ticker}"})
    return {"inline_keyboard": rows}


def suggestion(ticker: str, side: str, reason: str) -> str:
    """ "KAPtan: THYAO için al önerisi hazır" and the one-line reason. No approve button, no amounts."""
    word = "al" if side == "buy" else "sat"
    rows = [f"KAPtan: <b>{esc(ticker)}</b> için {word} önerisi hazır."]
    if reason:
        rows.append(esc(reason[:200]))
    rows.append("Karar uygulamada; burada onaylanmaz.")
    return "\n".join(rows)
