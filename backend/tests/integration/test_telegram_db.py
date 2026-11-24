"""Telegram on a real database: the tables of migration 0039, the gap stamp, and the Ayarlar API
(token -> pair -> poller pairs the chat -> sample -> unlink). Telegram itself is a fake (respx)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis
import respx

from kaptan.db import DictConn
from kaptan.settings import Settings
from kaptan.telegram import handlers, store
from kaptan.telegram.botapi import BotApi
from tests.conftest import DEMO_PASSPHRASE, bearer
from tests.contract.harness import assert_matches
from tests.unit.telegram_support import BOT, TOKEN, FakeTelegram, message

pytestmark = pytest.mark.integration

URL = "/api/v1/me/telegram"
NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)


@pytest.fixture
async def clean(owner_pg: DictConn) -> AsyncIterator[DictConn]:
    async def wipe() -> None:
        await owner_pg.execute(
            "UPDATE ops.telegram SET token = NULL, bot_username = NULL, chat_id = NULL, pair_code_hash = NULL,"
            " pair_expires_at = NULL, paired_at = NULL, update_offset = 0, level = 'normal', daily_cap = 8,"
            " silent_until = NULL, morning_sent_on = NULL, desk_cursor = NULL WHERE id = 1"
        )
        await owner_pg.execute("DELETE FROM ops.telegram_queue")
        await owner_pg.execute("DELETE FROM ops.telegram_sent")
        await owner_pg.execute("UPDATE ops.worker_alive SET last_alive_at = NULL, gap_from = NULL, gap_to = NULL")
        await owner_pg.commit()

    await wipe()
    yield owner_pg
    await wipe()


async def test_a_gap_of_more_than_thirty_minutes_is_remembered_for_the_brief(
    migrated: Settings, clean: DictConn, pg: DictConn
) -> None:
    assert await store.touch_alive(pg, NOW) is None  # first start: nothing to compare
    assert await store.touch_alive(pg, NOW + timedelta(minutes=20)) is None  # a short restart is no gap
    gap = await store.touch_alive(pg, NOW + timedelta(hours=7, minutes=20))
    assert gap == (NOW + timedelta(minutes=20), NOW + timedelta(hours=7, minutes=20))
    seen = await store.last_gap(pg)
    assert seen is not None and seen["hours"] == 7.0 and seen["told"] is False
    await store.mark_gap_told(pg)
    again = await store.last_gap(pg)
    assert again is not None and again["told"] is True
    await pg.commit()


async def test_the_queue_remembers_each_disclosure_once_and_counts_instant_messages(
    migrated: Settings, clean: DictConn, pg: DictConn
) -> None:
    await store.enqueue(pg, 9001, "THYAO", "THY", "queued", None, NOW)
    await store.enqueue(pg, 9001, "THYAO", "THY", "held", "cap", NOW)  # the second write changes nothing
    assert await store.known_indexes(pg, [9001, 9002]) == {9001}
    assert [r["state"] for r in await store.rows_in(pg, "queued")] == ["queued"]
    await store.move(pg, [9001], "held", "quiet", NOW)
    assert [r["reason"] for r in await store.rows_in(pg, "held")] == ["quiet"]
    await store.record_sent(pg, NOW, "instant", ["THYAO"], 2)
    day = NOW.replace(hour=0)
    assert await store.instant_count(pg, day, day + timedelta(days=1)) == 1
    assert await store.last_instant(pg, "THYAO") == NOW and await store.last_instant(pg, "ASELS") is None
    assert await store.last_sent(pg, "weekend") is None
    await pg.commit()


async def _headers(client: httpx.AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    assert res.status_code == 200, res.text
    return bearer(res.json()["access_token"])


async def test_the_whole_pairing_through_the_api(
    client: httpx.AsyncClient, migrated: Settings, clean: DictConn
) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    await redis.delete("kaptan:telegram:sample")
    assert (await client.get(URL)).status_code == 401
    headers = await _headers(client)
    first = (await client.get(URL, headers=headers)).json()
    assert_matches("TelegramStatus", first)
    assert first["configured"] is False and first["paired"] is False and first["level"] == "normal"

    fake = FakeTelegram()
    with respx.mock(assert_all_called=False) as mock:
        fake.install(mock)
        assert (await client.put(URL, headers=headers, json={"token": "abc"})).status_code == 422
        saved = await client.put(URL, headers=headers, json={"token": TOKEN, "level": "less", "daily_cap": 5})
        assert saved.status_code == 200, saved.text
        body = saved.json()
        assert body["configured"] is True and body["bot_username"] == BOT and body["level"] == "less"
        assert TOKEN not in saved.text and "token" not in body  # never returned

        pair = await client.post(f"{URL}/pair", headers=headers)
        assert pair.status_code == 200, pair.text
        assert_matches("TelegramPair", pair.json())
        link_url = pair.json()["pair_link"]
        assert link_url.startswith(f"https://t.me/{BOT}?start=")
        code = link_url.split("start=")[1]
        assert (await client.get(URL, headers=headers)).json()["pairing_open"] is True
        cur = await clean.execute("SELECT pair_code_hash FROM ops.telegram WHERE id = 1")
        row = await cur.fetchone()
        assert row is not None and code not in str(row["pair_code_hash"])  # only the hash is stored

        # the poller side: a stranger first, then the person
        conn: Any = await _app_conn(migrated)
        try:
            api = BotApi(TOKEN)
            await handlers.handle_update(conn, api, message(1, 999, f"/start {code}x"), NOW)
            await handlers.handle_update(conn, api, message(2, 555, f"/start {code}"), datetime.now(UTC))
        finally:
            await conn.close()
        after = (await client.get(URL, headers=headers)).json()
        assert after["paired"] is True and after["pairing_open"] is False

        sample = await client.post(f"{URL}/sample", headers=headers)
        assert sample.status_code == 200, sample.text
        assert (await client.post(f"{URL}/sample", headers=headers)).status_code == 429
        assert "ÖRNEK" in fake.texts()[-1] and fake.sent()[-1]["chat_id"] == 555

        gone = await client.delete(URL, headers=headers)
        assert gone.status_code == 200 and gone.json()["configured"] is False and gone.json()["paired"] is False
    await redis.delete("kaptan:telegram:sample")
    await redis.aclose()


async def _app_conn(settings: Settings) -> Any:
    from kaptan.db import connect

    return await connect(settings.database_url.get_secret_value())
