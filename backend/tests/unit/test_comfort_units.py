"""Pause ends, alert preferences, quiet hours and the held messages (agent COMFORT). No services needed."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from pydantic import SecretStr, ValidationError

from kaptan.alerts.announce import announce, flush_held
from kaptan.alerts.config import AlertConfig, NtfyTarget
from kaptan.alerts.prefs import HELD_KEY, decide, default_prefs, in_quiet, with_defaults
from kaptan.auth.credentials import new_password_problem
from kaptan.domain.schemas.preferences import PauseInput
from kaptan.ops.pause import PauseError, end_of_pause

# 23:00 Istanbul (UTC+3) = 20:00 UTC; 12:00 Istanbul = 09:00 UTC
NIGHT = datetime(2026, 11, 20, 20, 0, tzinfo=UTC)
NOON = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
MORNING_END = datetime(2026, 11, 21, 5, 30, tzinfo=UTC)  # 08:30 Istanbul


def quiet(on: bool = True, start: str = "22:00", end: str = "08:00") -> dict[str, Any]:
    return {"on": on, "start": start, "end": end}


def test_quiet_hours_cross_midnight_in_istanbul_time() -> None:
    assert in_quiet(quiet(), NIGHT)
    assert not in_quiet(quiet(), NOON)
    assert not in_quiet(quiet(), MORNING_END)
    assert not in_quiet(quiet(on=False), NIGHT)
    assert in_quiet(quiet(start="13:00", end="15:00"), datetime(2026, 11, 21, 11, 0, tzinfo=UTC))  # 14:00
    assert not in_quiet(quiet(start="09:00", end="09:00"), NIGHT)  # an empty window is no window


def test_decide_sends_holds_or_skips() -> None:
    prefs = with_defaults({"quiet": quiet()})
    assert decide(prefs, "suggestion", NOON) == "send"
    assert decide(prefs, "suggestion", NIGHT) == "hold"
    assert decide(prefs, "test", NIGHT) == "send"
    off = with_defaults({"kinds": {"watched": {"phone": False}}})
    assert decide(off, "watch", NOON) == "skip"
    assert decide(off, "suggestion", NOON) == "send"


def test_an_older_document_is_completed_with_the_defaults() -> None:
    assert with_defaults(None) == default_prefs()
    got = with_defaults({"kinds": {"stopped": {"desktop": False}, "price": {"desktop": False}}})
    assert "stopped" not in got["kinds"]  # a retired topic of an old document is dropped
    assert got["kinds"]["price"] == {"phone": True, "desktop": False}
    assert got["kinds"]["suggestion"] == {"phone": True, "desktop": True}


def test_pause_end_by_days_and_by_date() -> None:
    assert end_of_pause(NOON, days=3, until=None) == NOON + timedelta(days=3)
    end = end_of_pause(NOON, days=None, until=date(2026, 11, 25))
    assert end == datetime(2026, 11, 24, 21, 0, tzinfo=UTC)  # 00:00 on the 25th, Istanbul
    for bad in (date(2026, 11, 21), date(2026, 11, 1), date(2028, 1, 1)):
        with pytest.raises(PauseError):
            end_of_pause(NOON, days=None, until=bad)


def test_pause_input_wants_exactly_one() -> None:
    assert PauseInput(days=3).days == 3
    for body in ({}, {"days": 3, "until": "2026-12-01"}, {"days": 0}, {"days": 91}):
        with pytest.raises(ValidationError):
            PauseInput.model_validate(body)


def test_new_password_rules() -> None:
    assert new_password_problem("eski-parola", "yeni-parola") is None
    assert new_password_problem("eski", "kısa") is not None
    assert new_password_problem("eski", "kaptan2026") is not None
    assert new_password_problem("aynı-parola", "aynı-parola") is not None
    assert new_password_problem("eski", "x" * 201) is not None


class FakeRedis:
    def __init__(self) -> None:
        self.held: dict[str, str] = {}
        self.slots: set[str] = set()
        self.state: dict[str, str] = {}

    async def hset(self, key: str, field: Any = None, value: Any = None, mapping: Any = None) -> None:
        if key == HELD_KEY:
            self.held[field] = value
        else:
            self.state.update(mapping or {field: value})

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.held) if key == HELD_KEY else dict(self.state)

    async def hdel(self, key: str, *fields: str) -> None:
        for f in fields:
            (self.held if key == HELD_KEY else self.state).pop(f, None)

    async def set(self, key: str, _v: str, nx: bool = False, ex: int = 0) -> bool:
        if key in self.slots:
            return False
        self.slots.add(key)
        return True


class Pool:
    """A pool whose connection answers `SELECT alerts` with the given document."""

    def __init__(self, alerts: dict[str, Any] | None) -> None:
        self.alerts = alerts

    def connection(self) -> Pool:
        return self

    async def __aenter__(self) -> Pool:
        return self

    async def __aexit__(self, *_a: object) -> None:
        return None

    def cursor(self) -> Pool:
        return self

    async def execute(self, *_a: object) -> None:
        return None

    async def fetchone(self) -> dict[str, Any]:
        return {"alerts": self.alerts}

    async def rollback(self) -> None:
        return None


CFG = AlertConfig(
    ntfy=NtfyTarget(url="https://ntfy.sh/", topic=SecretStr("kaptan-test-topic-0123456789")), smtp=None, invalid=()
)


async def test_a_message_in_the_quiet_hours_waits_and_goes_out_after(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[str] = []

    async def deliver(text: str) -> None:
        sent.append(text)

    redis, pool = FakeRedis(), Pool({"quiet": quiet()})
    senders = {"ntfy": deliver}
    assert await announce(pool, redis, CFG, "suggestion", now=NIGHT, senders=senders) == "sent"
    assert sent == [] and "suggestion" in redis.held  # held, not sent
    assert await flush_held(pool, redis, CFG, now=NIGHT, senders=senders) == ()  # still quiet
    assert await flush_held(pool, redis, CFG, now=MORNING_END, senders=senders) == ("suggestion",)
    assert sent == ["KAPtan: yeni bir önerin var."] and redis.held == {}


async def test_the_test_message_is_never_held_and_an_off_kind_is_not_sent() -> None:
    sent: list[str] = []

    async def deliver(text: str) -> None:
        sent.append(text)

    redis = FakeRedis()
    pool = Pool({"quiet": quiet(), "kinds": {"watched": {"phone": False}}})
    senders = {"ntfy": deliver}
    assert await announce(pool, redis, CFG, "test", now=NIGHT, senders=senders) == "sent"
    assert sent == ["KAPtan: deneme bildirimi."]
    assert await announce(pool, redis, CFG, "watch", now=NOON, senders=senders) == "off"
    assert len(sent) == 1


async def test_a_stale_held_message_is_dropped() -> None:
    redis = FakeRedis()
    redis.held["suggestion"] = (MORNING_END - timedelta(hours=30)).isoformat()
    assert await flush_held(Pool(None), redis, CFG, now=MORNING_END) == ()
    assert redis.held == {}


async def test_unreadable_preferences_fall_back_to_the_defaults() -> None:
    sent: list[str] = []

    async def deliver(text: str) -> None:
        sent.append(text)

    class Broken:
        def connection(self) -> None:
            raise RuntimeError("db away")

    assert await announce(Broken(), FakeRedis(), CFG, "test", now=NIGHT, senders={"ntfy": deliver}) == "sent"
    assert sent
