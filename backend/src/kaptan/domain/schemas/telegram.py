"""Mirror of kaptan-panel/src/lib/domain/telegram.ts (Ayarlar · Telegram)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDateTime, KModel

TelegramLevel = Literal["less", "normal", "more"]
CloudKap = Literal["ok", "blocked", "error", "unknown"]


class TelegramStatus(KModel):
    configured: bool
    token_from_env: bool
    bot_username: str | None
    paired: bool
    pairing_open: bool
    pairing_expires_at: IsoDateTime | None
    level: TelegramLevel
    daily_cap: Annotated[int, Field(ge=1, le=50)]
    silent_until: IsoDateTime | None
    last_sent_at: IsoDateTime | None
    cloud_on: bool
    cloud_synced_at: IsoDateTime | None
    cloud_message_at: IsoDateTime | None
    cloud_kap: CloudKap | None
    cloud_error: bool


class TelegramInput(KModel):
    """Any of the three; the token is checked with Telegram and never returned."""

    token: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    level: TelegramLevel | None = None
    daily_cap: Annotated[int, Field(ge=1, le=50)] | None = None


class TelegramPair(KModel):
    pair_link: str
    expires_at: IsoDateTime
