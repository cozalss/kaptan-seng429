"""Price alerts, alert history, backup list, weekly summary and the muted companies (agent ALERTS, wave 5)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis
from pydantic import SecretStr

from kaptan.alerts.announce import announce
from kaptan.alerts.config import alert_config
from kaptan.alerts.price import check_alerts
from kaptan.alerts.service import RATE_PREFIX, STATE_KEY
from kaptan.db import DictConn, create_pool
from kaptan.settings import Settings
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

API = "/api/v1"
TICKER = "ZZALR"
NO_PRICE = "ZZNOP"
#: The fixture day's clock starts at 10:40Z on 2027-01-11.
NOW = datetime(2027, 1, 11, 10, 45, tzinfo=UTC)
BAR = "INSERT INTO core.prices_intraday (ticker, ts, interval, close, source) VALUES (%s, %s, '1m', %s, 'yfinance')"


@pytest.fixture
async def data(owner_pg: DictConn) -> AsyncIterator[None]:
    await owner_pg.execute("DELETE FROM core.price_alerts")
    await owner_pg.execute("DELETE FROM core.prices_intraday WHERE ticker LIKE 'ZZ%'")
    await owner_pg.execute("DELETE FROM core.issuer_profiles WHERE ticker LIKE 'ZZ%'")
    for t, name in ((TICKER, "Deneme Uyarı Sanayi"), (NO_PRICE, "Fiyatsız Deneme")):
        await owner_pg.execute(
            "INSERT INTO core.issuer_profiles (ticker, name, sector, source) VALUES (%s, %s, 'Deneme', 'manual')",
            (t, name),
        )
    await owner_pg.execute(BAR, (TICKER, datetime(2027, 1, 11, 9, 0, tzinfo=UTC), 100))
    await owner_pg.commit()
    try:
        yield
    finally:
        await owner_pg.execute("DELETE FROM core.price_alerts")
        await owner_pg.execute("DELETE FROM ops.alert_history")
        await owner_pg.execute("DELETE FROM core.prices_intraday WHERE ticker LIKE 'ZZ%'")
        await owner_pg.execute("DELETE FROM core.issuer_profiles WHERE ticker LIKE 'ZZ%'")
        await owner_pg.execute("UPDATE ops.preferences SET alerts = NULL")
        await owner_pg.commit()


async def _headers(client: httpx.AsyncClient) -> dict[str, str]:
    return bearer((await login(client))["access_token"])


async def _actions(owner: DictConn) -> list[str]:
    async with owner.cursor() as cur:
        await cur.execute("SELECT action FROM audit.audit_log ORDER BY chain_pos")
        return [str(r["action"]) for r in await cur.fetchall()]


def _body(**kw: Any) -> dict[str, Any]:
    return {"ticker": TICKER, "direction": "above", **kw}


async def test_everything_needs_a_session(client: httpx.AsyncClient) -> None:
    for method, path in (
        ("GET", "/me/price-alerts"),
        ("POST", "/me/price-alerts"),
        ("DELETE", "/me/price-alerts/1"),
        ("GET", "/me/alerts/history"),
        ("GET", "/me/backup/list"),
        ("GET", "/me/weekly"),
    ):
        assert (await client.request(method, f"{API}{path}")).status_code == 401, path


async def test_make_list_and_remove_an_alert_is_audited(
    client: httpx.AsyncClient, data: None, owner_pg: DictConn
) -> None:
    h = await _headers(client)
    res = await client.post(f"{API}/me/price-alerts", json=_body(level=120), headers=h)
    assert res.status_code == 200, res.text
    (alert,) = res.json()
    assert_matches("PriceAlert", alert)
    assert alert["level"] == 120 and alert["preset_pct"] is None and alert["triggered_at"] is None
    assert alert["name"] == "Deneme Uyarı Sanayi" and alert["current_price"] == 100
    gone = await client.delete(f"{API}/me/price-alerts/{alert['id']}", headers=h)
    assert gone.status_code == 200 and gone.json() == []
    assert (await client.delete(f"{API}/me/price-alerts/{alert['id']}", headers=h)).status_code == 404
    actions = await _actions(owner_pg)
    assert "price_alert.created" in actions and "price_alert.removed" in actions


async def test_presets_become_a_level_and_wrong_input_is_refused(client: httpx.AsyncClient, data: None) -> None:
    h = await _headers(client)
    up = (await client.post(f"{API}/me/price-alerts", json=_body(preset_pct=5), headers=h)).json()
    down = (await client.post(f"{API}/me/price-alerts", json=_body(direction="below", preset_pct=10), headers=h)).json()
    levels = {(a["direction"], a["preset_pct"]): a["level"] for a in down}
    assert levels == {("above", 5): 105, ("below", 10): 90}
    assert len(up) == 1
    post = lambda body: client.post(f"{API}/me/price-alerts", json=body, headers=h)  # noqa: E731
    assert (await post(_body())).status_code == 422  # neither
    assert (await post(_body(level=130, preset_pct=5))).status_code == 422  # both
    passed = await post(_body(level=90))
    assert passed.status_code == 422 and passed.json()["code"] == "already_passed"
    assert (await post(_body(direction="below", level=110))).status_code == 422
    assert (await post({**_body(level=120), "ticker": "ZZUNK"})).status_code == 404
    nop = await post({**_body(preset_pct=5), "ticker": NO_PRICE})
    assert nop.status_code == 409 and nop.json()["code"] == "no_price"
    assert (await post({**_body(level=50), "ticker": NO_PRICE})).status_code == 200  # a typed level may wait


async def test_a_reached_price_fires_once_and_the_phone_text_is_generic(
    client: httpx.AsyncClient, data: None, pg: DictConn, owner_pg: DictConn, migrated: Settings
) -> None:
    h = await _headers(client)
    await client.post(f"{API}/me/price-alerts", json=_body(level=120), headers=h)
    quiet = alert_config(migrated)  # no channel: the check itself sends nothing
    cfg = alert_config(migrated.model_copy(update={"alert_ntfy_topic": SecretStr("kaptan-test-only-topic-0123")}))
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)
    sent: list[str] = []

    async def fake(text: str) -> None:
        sent.append(text)

    try:
        await redis.delete(STATE_KEY, f"{RATE_PREFIX}price")
        assert await check_alerts(pg, NOW, redis=redis, pool=pool, cfg=quiet) == 0  # 100 < 120: still waiting
        await owner_pg.execute(BAR, (TICKER, datetime(2027, 1, 11, 9, 30, tzinfo=UTC), 121))
        await owner_pg.commit()
        before = await redis.xlen("kaptan:desk")
        assert await check_alerts(pg, NOW, redis=redis, pool=pool, cfg=quiet) == 1
        assert await check_alerts(pg, NOW, redis=redis, pool=pool, cfg=quiet) == 0  # fires once
        entries = await redis.xrange("kaptan:desk", count=1000)
        event = [json.loads(f["data"]) for _i, f in entries[before:] if f.get("event") == "price_alert"]
        assert len(event) == 1 and event[0]["ticker"] == TICKER and event[0]["name"] == "Deneme Uyarı Sanayi"
        await redis.delete(f"{RATE_PREFIX}price")
        await announce(pool, redis, cfg, "price", now=NOW, senders={"ntfy": fake})
    finally:
        await redis.delete(STATE_KEY, f"{RATE_PREFIX}price")
        await redis.aclose()
        await pool.close()
    assert sent == ["KAPtan: bir fiyat uyarın tetiklendi."]
    (alert,) = (await client.get(f"{API}/me/price-alerts", headers=h)).json()
    assert alert["triggered_price"] == 121 and alert["triggered_at"] is not None
    assert "price_alert.triggered" in await _actions(owner_pg)
    history = (await client.get(f"{API}/me/alerts/history", headers=h)).json()
    assert [(i["channel"], i["ok"], i["text"]) for i in history] == [("ntfy", True, sent[0])]
    assert_matches("AlertHistoryItem", history[0])
    assert TICKER not in json.dumps(history) and "Deneme" not in json.dumps(history)


async def test_muted_companies_are_saved_and_an_old_document_still_loads(client: httpx.AsyncClient, data: None) -> None:
    h = await _headers(client)
    first = (await client.get(f"{API}/me/preferences", headers=h)).json()
    assert first["alerts"]["muted"] == [] and first["alerts"]["kinds"]["price"] == {"phone": True, "desktop": True}
    old = {k: v for k, v in first["alerts"].items() if k != "muted"}
    old["kinds"] = {k: v for k, v in old["kinds"].items() if k not in ("price", "weekly")}
    assert (await client.put(f"{API}/me/alerts/preferences", json=old, headers=h)).status_code == 200
    saved = await client.put(
        f"{API}/me/alerts/preferences", json={**first["alerts"], "muted": ["THYAO", "ZZALR"]}, headers=h
    )
    assert saved.status_code == 200 and saved.json()["alerts"]["muted"] == ["THYAO", "ZZALR"]
    assert_matches("Preferences", saved.json())
    bad = await client.put(f"{API}/me/alerts/preferences", json={**first["alerts"], "muted": ["thy ao"]}, headers=h)
    assert bad.status_code == 422


async def test_the_backup_list_says_when_it_cannot_see_the_folder(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API}/me/backup/list", headers=await _headers(client))
    assert res.status_code == 200
    doc = res.json()
    assert_matches("BackupList", doc)
    assert doc["available"] is False and doc["files"] == [] and doc["warning_tr"] is None
    assert any("geri-yukle.ps1" in s for s in doc["steps_tr"])


async def test_the_weekly_summary_is_the_monday_sunday_week(client: httpx.AsyncClient) -> None:
    h = await _headers(client)
    res = await client.get(f"{API}/me/weekly", headers=h)
    assert res.status_code == 200, res.text
    doc = res.json()
    assert_matches("WeeklySummary", doc)
    assert (doc["start"], doc["end"], doc["label_tr"]) == ("2027-01-11", "2027-01-17", "11–17 Ocak 2027")
    assert doc["is_current"] is True and doc["read"] >= 0
    other = (await client.get(f"{API}/me/weekly?at=2027-01-06", headers=h)).json()
    assert (other["start"], other["is_current"]) == ("2027-01-04", False)
    assert (await client.get(f"{API}/me/weekly?at=yarin", headers=h)).status_code == 422
