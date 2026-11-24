"""The cloud watcher's PC side: the sync, the actions pull and the single-sender switch. No network (httpx
MockTransport), no database (the in-memory Telegram store of telegram_memory.py)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from kaptan.alerts import announce as announce_mod
from kaptan.alerts import config as alert_cfg
from kaptan.alerts.config import AlertConfig
from kaptan.alerts.telegram import TelegramTarget
from kaptan.api.errors import ApiError
from kaptan.cloud import actions as cloud_actions
from kaptan.cloud import sync as cloud_sync
from kaptan.settings import Settings, cloud_watcher_on
from kaptan.telegram import dispatch, link, morning, runner, store
from kaptan.workers import scheduler
from tests.unit.telegram_memory import FakePool, Mem, install
from tests.unit.telegram_support import TOKEN

NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
URL = "https://kaptan-bulut.example.workers.dev"
SECRET = "cloud-secret-for-tests-0123456789abcdef"
CHAT = 4242


def _settings(**kw: object) -> Settings:
    base: dict[str, object] = {
        "database_url": "postgresql://x@localhost/x",
        "kaptan_env": "dev",
        "jwt_secret": "unit-test-secret-unit-test-secret-0123456789",
        "cloud_watcher_url": URL,
        "cloud_sync_secret": SECRET,
    }
    base.update(kw)
    return Settings(_env_file=None, **base)  # type: ignore[call-arg, arg-type]


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}

    async def hset(self, key: str, mapping: dict[str, str]) -> None:
        self.hashes.setdefault(key, {}).update(mapping)

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.hashes.get(key, {}))


@pytest.fixture
def mem(monkeypatch: pytest.MonkeyPatch) -> Mem:
    m = install(monkeypatch)
    m.state.update(token=TOKEN, bot_username="kaptan_test_bot")
    m.muted = ["GARAN"]

    async def rows(conn: Any, sql: str, params: Any = ()) -> list[dict[str, Any]]:
        if "positions" in sql:
            return [{"ticker": "THYAO"}, {"ticker": "ASELS"}]
        if "watchlist" in sql:
            return [{"ticker": "ASELS"}, {"ticker": "BIMAS"}, {"ticker": "kötü ticker"}]
        return []

    monkeypatch.setattr(cloud_sync, "fetch_all", rows)
    monkeypatch.setattr(cloud_sync, "load_prefs", m.load_prefs)
    return m


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── configuration ─────────────────────────────────────────────────────────────


def test_the_cloud_is_on_only_with_an_https_url_and_a_secret() -> None:
    assert cloud_watcher_on(_settings())
    assert not cloud_watcher_on(_settings(cloud_sync_secret=None))
    assert not cloud_watcher_on(_settings(cloud_watcher_url=None))
    assert not cloud_watcher_on(_settings(cloud_watcher_url="http://plain.example"))
    assert not cloud_watcher_on(_settings(cloud_sync_secret="  "))


async def test_nothing_is_sent_while_the_cloud_is_off(mem: Mem) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request while the cloud is off")

    out = await cloud_sync.sync_once(
        _settings(cloud_sync_secret=None), FakePool(), FakeRedis(), NOW, client=_client(refuse)
    )
    assert out == {"ok": False, "reason": "off"}
    assert await cloud_actions.pull_actions(_settings(cloud_sync_secret=None), FakePool(), NOW) == {
        "applied": 0,
        "left": 0,
    }


# ── the payload ───────────────────────────────────────────────────────────────


async def test_the_payload_has_tickers_and_preferences_but_no_money(mem: Mem) -> None:
    payload = await cloud_sync.build_payload(FakePool().conn, NOW)
    assert payload["held"] == ["ASELS", "THYAO"]
    assert payload["watched"] == ["ASELS", "BIMAS"]  # a malformed ticker is dropped
    assert payload["muted"] == ["GARAN"]
    assert payload["quiet"] == {"on": False, "start": "22:00", "end": "08:00"}
    assert payload["level"] == "normal" and payload["daily_cap"] == 8
    assert payload["pair"] is None and payload["unlink"] is False
    flat = json.dumps(payload).lower()
    for word in ("qty", "amount", "price", "cost", "pnl", "tutar", "adet", "equity", "cash"):
        assert word not in flat


async def test_an_open_pairing_code_travels_as_a_hash_and_a_paired_chat_carries_over(mem: Mem) -> None:
    code = link.new_code()
    mem.state.update(pair_code_hash=link.hash_code(code), pair_expires_at=NOW + link.CODE_TTL, chat_id=None)
    payload = await cloud_sync.build_payload(FakePool().conn, NOW)
    assert payload["pair"] == {
        "hash": link.hash_code(code),
        "expires_at": int((NOW + link.CODE_TTL).timestamp() * 1000),
    }
    assert code not in json.dumps(payload)  # the code itself never leaves: only its hash
    assert "chat_id" not in payload

    mem.state.update(pair_code_hash=None, pair_expires_at=None, chat_id=CHAT)
    paired = await cloud_sync.build_payload(FakePool().conn, NOW)
    assert paired["chat_id"] == CHAT and paired["pair"] is None
    gone = await cloud_sync.build_payload(FakePool().conn, NOW, unlink=True)
    assert gone["unlink"] is True and "chat_id" not in gone


async def test_an_expired_code_is_not_sent(mem: Mem) -> None:
    mem.state.update(pair_code_hash="a" * 64, pair_expires_at=NOW - timedelta(minutes=1), chat_id=None)
    assert (await cloud_sync.build_payload(FakePool().conn, NOW))["pair"] is None


# ── sync_once ────────────────────────────────────────────────────────────────


async def test_a_sync_posts_with_the_bearer_secret_and_takes_the_workers_answer(mem: Mem) -> None:
    seen: list[httpx.Request] = []
    mem.state.update(chat_id=None)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={
            "ok": True, "chat_id": CHAT, "paired_at": 1, "level": "more", "daily_cap": 5,
            "silent_until": int((NOW + timedelta(hours=3)).timestamp() * 1000),
            "last_message_at": int(NOW.timestamp() * 1000), "last_poll_at": 1,
            "kap_status": "blocked", "kap_reason": "x",
        })  # fmt: skip

    redis = FakeRedis()
    out = await cloud_sync.sync_once(_settings(), FakePool(), redis, NOW, client=_client(handler))
    assert out["ok"] is True
    assert str(seen[0].url) == f"{URL}/sync" and seen[0].method == "POST"
    assert seen[0].headers["authorization"] == f"Bearer {SECRET}"
    assert json.loads(seen[0].content)["held"] == ["ASELS", "THYAO"]
    # the PC now knows who is paired and what the phone changed
    assert mem.state["chat_id"] == CHAT and mem.state["paired_at"] == NOW
    assert mem.state["pair_code_hash"] is None
    assert mem.state["level"] == "more" and mem.state["daily_cap"] == 5
    assert mem.state["silent_until"] == NOW + timedelta(hours=3)
    status = await cloud_sync.read_status(redis, _settings())
    assert status["cloud_on"] and status["cloud_kap"] == "blocked" and status["cloud_error"] is False
    assert status["cloud_synced_at"] is not None and status["cloud_message_at"] is not None


async def test_a_failed_sync_never_raises_never_leaks_the_secret_and_is_shown(
    mem: Mem, caplog: pytest.LogCaptureFixture
) -> None:
    redis = FakeRedis()
    caplog.set_level(logging.DEBUG)
    for handler in (
        lambda r: httpx.Response(401, json={"ok": False}),
        lambda r: (_ for _ in ()).throw(httpx.ConnectError("boom " + SECRET + URL)),
        lambda r: httpx.Response(200, json={"ok": False}),
    ):
        out = await cloud_sync.sync_once(_settings(), FakePool(), redis, NOW, client=_client(handler))
        assert out["ok"] is False
    status = await cloud_sync.read_status(redis, _settings())
    assert status["cloud_error"] is True
    assert SECRET not in caplog.text and URL not in caplog.text and SECRET not in json.dumps(status)


async def test_the_status_is_empty_while_the_cloud_is_off() -> None:
    status = await cloud_sync.read_status(FakeRedis(), _settings(cloud_watcher_url=None))
    assert status == {
        "cloud_on": False,
        "cloud_synced_at": None,
        "cloud_message_at": None,
        "cloud_kap": None,
        "cloud_error": False,
    }


# ── actions ──────────────────────────────────────────────────────────────────


async def test_actions_are_applied_to_the_stores_and_acknowledged(mem: Mem, monkeypatch: pytest.MonkeyPatch) -> None:
    done: list[tuple[str, Any]] = []

    async def triage(conn: Any, index: int, state: str, now: datetime) -> None:
        if index == 404:
            raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")
        if index == 500:
            raise RuntimeError("database away")
        done.append((state, index))

    async def mute(conn: Any, ticker: str, now: datetime) -> None:
        done.append(("mute", ticker))

    monkeypatch.setattr(cloud_actions, "apply_triage", triage)
    monkeypatch.setattr(cloud_actions, "apply_mute", mute)
    acked: list[list[int]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == f"Bearer {SECRET}"
        if request.method == "GET":
            return httpx.Response(200, json={"actions": [
                {"id": 1, "action": "read", "idx": 5, "ticker": None},
                {"id": 2, "action": "later", "idx": 6, "ticker": None},
                {"id": 3, "action": "mute", "idx": None, "ticker": "THYAO"},
                {"id": 4, "action": "read", "idx": 404, "ticker": None},
                {"id": 5, "action": "read", "idx": 500, "ticker": None},
                {"id": 6, "action": "mute", "idx": None, "ticker": "bad ticker"},
                {"id": 7, "action": "approve", "idx": 1, "ticker": None},
            ]})  # fmt: skip
        acked.append(json.loads(request.content)["ids"])
        return httpx.Response(200, json={"ok": True})

    out = await cloud_actions.pull_actions(_settings(), FakePool(), NOW, client=_client(handler))
    assert done == [("tamam", 5), ("sonra", 6), ("mute", "THYAO")]
    assert acked == [[1, 2, 3, 4, 6, 7]]  # 404 and unknown kinds have nothing left to do; id 5 stays for the next sync
    assert out == {"applied": 6, "left": 1}


async def test_an_unreachable_worker_leaves_the_queue_alone(mem: Mem) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    out = await cloud_actions.pull_actions(_settings(), FakePool(), NOW, client=_client(down))
    assert out == {"applied": 0, "left": 0}


# ── one sender ───────────────────────────────────────────────────────────────


class SpyApi:
    def __repr__(self) -> str:
        return "SpyApi"


async def _tick(mem: Mem, monkeypatch: pytest.MonkeyPatch, settings: Settings, gap: Any) -> dict[str, int]:
    calls = {"instant": 0, "gap": 0, "suggestions": 0}

    async def touch(conn: Any, now: datetime) -> Any:
        return gap

    async def api_of(settings: Settings, pool: Any, factory: Any = None) -> Any:
        return SpyApi()

    async def prefs(pool: Any) -> dict[str, Any]:
        return mem.prefs()

    async def instant(*a: Any, **k: Any) -> int:
        calls["instant"] += 1
        return 0

    async def send_gap(*a: Any, **k: Any) -> bool:
        calls["gap"] += 1
        return True

    async def suggestions(*a: Any, **k: Any) -> int:
        calls["suggestions"] += 1
        return 0

    monkeypatch.setattr(store, "touch_alive", touch)
    monkeypatch.setattr(runner, "make_api", api_of)
    monkeypatch.setattr(runner, "read_prefs", prefs)
    monkeypatch.setattr(dispatch, "instant_pass", instant)
    monkeypatch.setattr(runner, "send_gap", send_gap)
    monkeypatch.setattr(runner, "announce_suggestions", suggestions)
    mem.state.update(chat_id=CHAT)
    await runner.tick_once(settings, FakePool(), object(), lambda: NOW)
    return calls


async def test_without_the_cloud_the_pc_sends_everything_as_before(mem: Mem, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = await _tick(mem, monkeypatch, _settings(cloud_watcher_url=None), (NOW - timedelta(hours=5), NOW))
    assert calls == {"instant": 1, "gap": 1, "suggestions": 1}


async def test_with_the_cloud_the_pc_sends_only_suggestions(mem: Mem, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = await _tick(mem, monkeypatch, _settings(), (NOW - timedelta(hours=5), NOW))
    assert calls == {"instant": 0, "gap": 0, "suggestions": 1}


async def test_with_the_cloud_there_is_no_getupdates_poller(mem: Mem, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    started: list[str] = []

    async def poll(*a: Any, **k: Any) -> None:
        started.append("poll")

    async def tick(*a: Any, **k: Any) -> None:
        started.append("tick")

    monkeypatch.setattr(runner, "poll_loop", poll)
    monkeypatch.setattr(runner, "tick_loop", tick)
    stop = asyncio.Event()
    await runner.run_telegram(_settings(), FakePool(), object(), stop)
    assert started == ["tick"]
    started.clear()
    await runner.run_telegram(_settings(cloud_watcher_url=None), FakePool(), object(), stop)
    assert sorted(started) == ["poll", "tick"]


async def test_with_the_cloud_the_morning_and_weekend_jobs_send_nothing(
    mem: Mem, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(*a: Any, **k: Any) -> bool:
        raise AssertionError("the Worker sends this message, not the PC")

    monkeypatch.setattr(morning, "send_morning", boom)
    monkeypatch.setattr(morning, "send_weekend", boom)
    ctx = scheduler.Ctx(settings=_settings(), pool=FakePool(), redis=FakeRedis(), http=lambda: None)
    for fn in (scheduler.job_telegram_morning, scheduler.job_telegram_weekend):
        out = await fn(FakePool().conn, ctx, NOW.date(), NOW)
        assert out["sent"] is False and "cloud" in out["reason"]


def test_the_sync_job_runs_every_ten_minutes() -> None:
    job = scheduler.BY_NAME["cloud_sync"]
    assert job.every_min == 10 and job.days == "daily"


async def test_the_sync_job_does_nothing_without_a_configured_cloud() -> None:
    ctx = scheduler.Ctx(
        settings=_settings(cloud_sync_secret=None), pool=FakePool(), redis=FakeRedis(), http=lambda: None
    )
    out = await scheduler.job_cloud_sync(FakePool().conn, ctx, NOW.date(), NOW)
    assert "skipped" in out


async def test_the_sync_job_syncs_then_pulls_the_actions(mem: Mem, monkeypatch: pytest.MonkeyPatch) -> None:
    order: list[str] = []

    async def fake_sync(*a: Any, **k: Any) -> dict[str, Any]:
        order.append("sync")
        return {"ok": True}

    async def fake_pull(*a: Any, **k: Any) -> dict[str, int]:
        order.append("pull")
        return {"applied": 2, "left": 0}

    monkeypatch.setattr(cloud_sync, "sync_once", fake_sync)
    monkeypatch.setattr(cloud_actions, "pull_actions", fake_pull)
    ctx = scheduler.Ctx(settings=_settings(), pool=FakePool(), redis=FakeRedis(), http=lambda: None)
    out = await scheduler.job_cloud_sync(FakePool().conn, ctx, NOW.date(), NOW)
    assert order == ["sync", "pull"] and out == {"synced": True, "applied": 2, "left": 0}


@pytest.mark.parametrize(("cloud_on", "telegram_kept"), [(True, False), (False, True)])
async def test_the_friday_weekly_sentence_skips_telegram_only_when_the_cloud_is_on(
    monkeypatch: pytest.MonkeyPatch, cloud_on: bool, telegram_kept: bool
) -> None:
    base = AlertConfig(ntfy=None, smtp=None, invalid=(), telegram=TelegramTarget(SecretStr(TOKEN), CHAT))
    seen: list[AlertConfig] = []

    async def fake_announce(pool: Any, redis: Any, cfg: AlertConfig, kind: str, *, now: datetime) -> str:
        seen.append(cfg)
        return "sent"

    monkeypatch.setattr(alert_cfg, "alert_config", lambda settings: base)
    monkeypatch.setattr(announce_mod, "announce", fake_announce)
    settings = _settings() if cloud_on else _settings(cloud_sync_secret=None)
    ctx = scheduler.Ctx(settings=settings, pool=FakePool(), redis=FakeRedis(), http=lambda: None)
    await scheduler.job_weekly_summary(FakePool().conn, ctx, NOW.date(), NOW)
    assert (seen[0].telegram is not None) is telegram_kept
