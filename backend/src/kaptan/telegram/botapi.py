"""A thin Telegram Bot API client: outbound HTTPS only, the token never in a log line, an error or a return value.

Checked against the official docs (https://core.telegram.org/bots/api and https://core.telegram.org/bots/faq):
- `getUpdates`: long polling with `timeout` (seconds, default 0 = short polling); `offset` must be the highest
  update_id seen + 1, which also confirms the earlier updates; `allowed_updates` narrows the kinds; it does not
  work while a webhook is set; unconfirmed updates are kept at most 24 hours.
- `sendMessage`: `text` is 1-4096 characters after entity parsing; `parse_mode` "HTML": every `<`, `>` and `&`
  that is not part of a tag must be written `&lt;`, `&gt;`, `&amp;` (see kaptan.telegram.format.esc).
- `InlineKeyboardMarkup` / `InlineKeyboardButton`: `callback_data` is 1-64 bytes, `url` opens a link.
  `CallbackQuery`: clients show a progress bar until `answerCallbackQuery` is called, so buttons are answered at once.
- `editMessageText` / `editMessageReplyMarkup` change a message we sent.
- Limits (bot FAQ): about one message per second in a single chat, about 30 per second for bulk sends.
- Deep link (bots/features): `https://t.me/<bot>?start=<code>` makes the bot receive `/start <code>`; the code may
  hold A-Z a-z 0-9 _ - and be up to 64 characters.

The token sits in the request URL (that is how the Bot API is addressed), and HTTP clients print URLs. So the
`httpx` / `httpcore` loggers are held at WARNING here, a failure is reduced to a short reason (a class name or
`http_<status>`), and `mask` removes the token from any text before it could be logged.
"""

from __future__ import annotations

import logging
from typing import Any, Final

import httpx

API_ROOT: Final = "https://api.telegram.org"
TIMEOUT_S: Final = 15.0
POLL_TIMEOUT_S: Final = 25
MAX_TEXT: Final = 4096

for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)


class TelegramError(Exception):
    """A call failed. `reason` is safe to log; `retry_after` is set when Telegram asked us to wait (HTTP 429)."""

    def __init__(self, reason: str, *, retry_after: float | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.retry_after = retry_after


def mask(text: str, token: str | None) -> str:
    """`text` with the token (and its secret half) replaced, for the rare place that must print something."""
    if not token:
        return text
    out = text.replace(token, "***")
    secret = token.partition(":")[2]
    return out.replace(secret, "***") if secret else out


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_S + POLL_TIMEOUT_S, follow_redirects=False, trust_env=False)


class BotApi:
    """One bot. `client` stands in for the HTTP client in tests (respx mocks the same host)."""

    def __init__(self, token: str, client: httpx.AsyncClient | None = None) -> None:
        self._token = token
        self._client = client

    def __repr__(self) -> str:
        return "BotApi(token=***)"

    async def call(self, method: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{API_ROOT}/bot{self._token}/{method}"
        owned = self._client is None
        client = self._client or http_client()
        reason: str | None = None
        retry: float | None = None
        result: Any = None
        try:
            res = await client.post(url, json=payload or {})
            body: Any = {}
            try:
                body = res.json()
            except ValueError:
                body = {}
            if res.is_success and isinstance(body, dict) and body.get("ok") is True:
                result = body.get("result")
            else:
                reason = f"http_{res.status_code}"
                params = body.get("parameters") if isinstance(body, dict) else None
                if isinstance(params, dict) and isinstance(params.get("retry_after"), int | float):
                    retry = float(params["retry_after"])
        except httpx.HTTPError as exc:
            reason = type(exc).__name__
        finally:
            if owned:
                await client.aclose()
        if reason is not None:
            raise TelegramError(reason, retry_after=retry)
        return result

    async def get_me(self) -> dict[str, Any]:
        out = await self.call("getMe")
        return out if isinstance(out, dict) else {}

    async def get_updates(self, offset: int, poll_s: int = POLL_TIMEOUT_S) -> list[dict[str, Any]]:
        out = await self.call(
            "getUpdates",
            {"offset": offset, "timeout": poll_s, "allowed_updates": ["message", "callback_query"]},
        )
        return [u for u in out if isinstance(u, dict)] if isinstance(out, list) else []

    async def send_message(
        self, chat_id: int, text: str, *, reply_markup: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text[:MAX_TEXT],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        out = await self.call("sendMessage", payload)
        return out if isinstance(out, dict) else {}

    async def edit_message_text(
        self, chat_id: int, message_id: int, text: str, *, reply_markup: dict[str, Any] | None = None
    ) -> None:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text[:MAX_TEXT],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "reply_markup": reply_markup or {"inline_keyboard": []},
        }
        await self.call("editMessageText", payload)

    async def answer_callback(self, callback_id: str, text: str = "") -> None:
        await self.call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text[:190]})
