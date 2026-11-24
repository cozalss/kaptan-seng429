"""Telegram as a channel of the alert service: same sender interface, covered kinds, secrets."""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest
import respx
from pydantic import SecretStr

from kaptan.alerts.channels import AlertSendError
from kaptan.alerts.config import AlertConfig
from kaptan.alerts.service import send_now, senders_for
from kaptan.alerts.telegram import TelegramTarget, send_telegram
from tests.unit.telegram_support import TOKEN, FakeTelegram

TARGET = TelegramTarget(token=SecretStr(TOKEN), chat_id=4242)
CFG = replace(AlertConfig(ntfy=None, smtp=None, invalid=()), telegram=TARGET)


class Redis:
    def __init__(self) -> None:
        self.state: dict[str, str] = {}

    async def hset(self, key: str, field: Any = None, value: Any = None, mapping: Any = None) -> None:
        self.state.update(mapping or {field: value})

    async def hdel(self, key: str, *fields: str) -> None:
        for f in fields:
            self.state.pop(f, None)


def test_telegram_is_a_channel_only_when_a_chat_is_paired() -> None:
    assert CFG.channels == ("telegram",)
    assert AlertConfig(ntfy=None, smtp=None, invalid=()).channels == ()
    assert set(senders_for(CFG)) == {"telegram"}
    assert TOKEN not in repr(TARGET) and TOKEN not in repr(CFG)


async def test_a_generic_alert_goes_to_the_paired_chat_as_the_fixed_sentence() -> None:
    fake = FakeTelegram()
    with respx.mock(assert_all_called=False) as mock:
        fake.install(mock)
        outcome = await send_now(Redis(), CFG, "part_down", now=datetime(2026, 11, 23, tzinfo=UTC))
    assert outcome == "sent"
    assert fake.sent()[0] == {"chat_id": 4242, "text": "KAPtan: bir parça çalışmıyor."}


@pytest.mark.parametrize("kind", ["suggestion", "watch"])
async def test_kinds_the_rich_messages_cover_are_not_sent_twice(kind: str) -> None:
    fake = FakeTelegram()
    with respx.mock(assert_all_called=False) as mock:
        fake.install(mock)
        assert await send_now(Redis(), CFG, kind, now=datetime(2026, 11, 23, tzinfo=UTC)) == "off"  # type: ignore[arg-type]
    assert fake.sent() == []


async def test_a_failed_send_is_a_short_reason_without_the_token(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeTelegram(fail_send=True)
    with respx.mock(assert_all_called=False) as mock:
        fake.install(mock)
        with pytest.raises(AlertSendError) as caught:
            await send_telegram(TARGET, "x")
        redis = Redis()
        assert await send_now(redis, CFG, "weekly", now=datetime(2026, 11, 23, tzinfo=UTC)) == "failed"
    assert caught.value.reason == "http_500"
    assert redis.state == {"error_telegram": "1"}
    assert TOKEN not in caplog.text and TOKEN not in str(caught.value)
