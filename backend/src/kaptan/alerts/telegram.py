"""The Telegram sender of the alert service: the same shape as `send_ntfy` / `send_email` (kaptan.alerts.channels).

`send_telegram(target, text)` delivers a fixed sentence (plain text, no parse mode) to the paired chat or raises
`AlertSendError` with a safe reason. The richer messages (company, line, buttons, morning message) are built by
kaptan.telegram; this one only carries the generic kinds (part_down, price, weekly, test). The token is a secret of
the target and never reaches a log or an error.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import SecretStr

from kaptan.alerts.channels import AlertSendError
from kaptan.settings import Settings
from kaptan.telegram import link, store
from kaptan.telegram.botapi import BotApi, TelegramError

#: The kinds the rich Telegram messages already cover (a generic sentence next to them would be a double).
COVERED_KINDS = frozenset({"suggestion", "watch"})


@dataclass(frozen=True, slots=True)
class TelegramTarget:
    token: SecretStr
    chat_id: int

    def __repr__(self) -> str:
        return f"TelegramTarget(chat_id={self.chat_id})"


async def send_telegram(target: TelegramTarget, text: str, *, api: BotApi | None = None) -> None:
    bot = api or BotApi(target.token.get_secret_value())
    try:
        await bot.call("sendMessage", {"chat_id": target.chat_id, "text": text})
    except TelegramError as exc:
        raise AlertSendError(exc.reason) from None


async def resolve_target(settings: Settings, pool: Any) -> TelegramTarget | None:
    """The paired chat with its token, or None (no token, or nobody paired yet). Reads the database."""
    try:
        async with pool.connection() as conn:
            state = await store.get_state(conn)
            await conn.rollback()
    except Exception:  # the database is away: the other channels still work
        return None
    token = link.token_of(settings, state)
    if token is None or state.get("chat_id") is None:
        return None
    return TelegramTarget(token=SecretStr(token), chat_id=int(state["chat_id"]))
