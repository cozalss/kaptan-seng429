"""Which token, which bot, which chat: the pairing of the phone with KAPtan.

Pairing in four steps (Ayarlar · Telegram): the person makes a bot with @BotFather and pastes its token; KAPtan checks
it with `getMe` and keeps it; "Bağlan" makes a one-time code (valid 15 minutes, only its SHA-256 is stored) and the
link `https://t.me/<bot>?start=<code>`; the person taps it and presses Start; the poller then receives `/start <code>`
and stores that chat id. From then on only that chat is listened to: any other chat is ignored and logged (the chat id
and the kind of update only, never the text).
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.settings import Settings

CODE_TTL: Final = timedelta(minutes=15)
TOKEN_RE: Final = re.compile(r"^\d{6,12}:[A-Za-z0-9_-]{30,60}$")
USERNAME_RE: Final = re.compile(r"^[A-Za-z0-9_]{3,64}$")
CODE_RE: Final = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def env_token(settings: Settings) -> str | None:
    raw = settings.alert_telegram_bot_token
    value = raw.get_secret_value().strip() if raw is not None else ""
    return value or None


def token_of(settings: Settings, state: dict[str, Any]) -> str | None:
    """The token from `.env` when set, else the one pasted in Ayarlar."""
    return env_token(settings) or (state.get("token") or None)


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def new_code() -> str:
    return secrets.token_urlsafe(12)


def deep_link(bot_username: str, code: str) -> str:
    return f"https://t.me/{bot_username}?start={code}"


def code_matches(state: dict[str, Any], code: str, now: datetime) -> bool:
    """True for the live, unspent code only (constant-time comparison of the hashes)."""
    stored, expires = state.get("pair_code_hash"), state.get("pair_expires_at")
    if not stored or expires is None or now >= expires or not CODE_RE.fullmatch(code):
        return False
    return hmac.compare_digest(str(stored), hash_code(code))
