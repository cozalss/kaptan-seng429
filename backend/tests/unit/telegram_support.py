"""Fixed signals and a fake Telegram Bot API (respx) for the Telegram tests. Never the real API."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import respx

TOKEN = "123456789:AAFakeTokenForTestsOnly_0123456789abcd"
BOT = "kaptan_test_bot"
T0 = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)  # a Monday, 12:00 Istanbul


@dataclass(frozen=True, slots=True)
class Sig:
    disclosure_index: int
    ticker: str | None = "THYAO"
    company: str = "Türk Hava Yolları"
    published_at: datetime = T0
    kind: str | None = "buyback"
    important: bool = True
    mine: str | None = "held"
    line_tr: str = "Kendi hissesini geri alacağını bildirdi."
    tone: str = "olumlu"
    so_what_tr: str | None = "Genelde fiyatı destekler; yapman gereken bir şey yok."
    suggestion_tr: str | None = None
    kap_url: str = "https://www.kap.org.tr/tr/Bildirim/1"
    panel_path: str = "/okunanlar?bildirim=1"


@dataclass
class FakeTelegram:
    """Answers the Bot API calls of one bot token; keeps what was sent."""

    token: str = TOKEN
    updates: list[dict[str, Any]] = field(default_factory=list)
    calls: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    fail_send: bool = False
    _next_message: int = 100

    def install(self, mock: respx.MockRouter) -> None:
        mock.post(url__regex=rf"https://api\.telegram\.org/bot{re.escape(self.token)}/\w+").mock(
            side_effect=self._handle
        )

    def _handle(self, request: httpx.Request) -> httpx.Response:
        method = request.url.path.rsplit("/", 1)[-1]
        payload = json.loads(request.content or b"{}")
        self.calls.append((method, payload))
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"id": 1, "username": BOT}})
        if method == "getUpdates":
            offset = int(payload.get("offset", 0))
            found = [u for u in self.updates if u["update_id"] >= offset]
            return httpx.Response(200, json={"ok": True, "result": found})
        if method == "sendMessage":
            if self.fail_send:
                return httpx.Response(500, json={"ok": False})
            self._next_message += 1
            return httpx.Response(200, json={"ok": True, "result": {"message_id": self._next_message}})
        return httpx.Response(200, json={"ok": True, "result": True})

    def sent(self, method: str = "sendMessage") -> list[dict[str, Any]]:
        return [p for m, p in self.calls if m == method]

    def texts(self) -> list[str]:
        return [str(p["text"]) for p in self.sent()]


def message(update_id: int, chat_id: int, text: str, *, chat_type: str = "private") -> dict[str, Any]:
    chat = {"id": chat_id, "type": chat_type}
    return {"update_id": update_id, "message": {"message_id": update_id, "chat": chat, "text": text}}


def button(update_id: int, chat_id: int, data: str, *, text: str = "THYAO · Türk Hava Yolları") -> dict[str, Any]:
    keyboard = [[{"text": "Aç", "url": "https://www.kap.org.tr/tr/Bildirim/1"}]]
    return {
        "update_id": update_id,
        "callback_query": {
            "id": f"cb{update_id}",
            "data": data,
            "message": {
                "message_id": 7,
                "chat": {"id": chat_id, "type": "private"},
                "text": text,
                "reply_markup": {"inline_keyboard": keyboard},
            },
        },
    }
