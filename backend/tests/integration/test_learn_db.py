"""kaptan.learn on Postgres: the sealed holdout is never learned from, versioned thresholds with audit and "Geri al",
calibration from matured decisions, the weekly pass and GET /me/learning.

The synthetic world is test_holdout_db's: E3 events before, inside and after the seal on one company whose CARs are
known by hand. Inside the seal every stored return is a tripwire (CAR = 5.0 = +500 %): if any learning read touched
it, a number below would show it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest

from kaptan.db import DictConn
from kaptan.evidence.holdout import HOLDOUT_END, HOLDOUT_START
from kaptan.learn import calibration, dataset, rules_store, weekly
from kaptan.learn.dataset import load_pool, sealed_day
from kaptan.learn.tunables import BY_KEY
from kaptan.prices.calendar import IST
from kaptan.reference.event_returns import run_event_returns
from kaptan.rules.params import DEFAULT_PARAMS
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer
from tests.contract.harness import assert_matches
from tests.integration.test_holdout_db import AR_DEV, DEV_DAYS, NOW, POST_DAY, SEALED_DAYS, TICKER, _world
from tests.unit.test_learn_pure import _world as leak_world

pytestmark = pytest.mark.integration

URL = "/api/v1/me/learning"
TRIPWIRE = 5.0
LATER = datetime(2026, 12, 15, 20, 0, tzinfo=IST)  # the live event's window closed


async def _sealed_tripwires(conn: DictConn) -> None:
    """Returns stored for the sealed events (as if the one holdout run had happened) and a sealed prediction."""
    await conn.execute(
        "INSERT INTO core.event_returns (event_id, horizon, model, t0, t_end, raw_ret, bench_ret, car, alpha, beta,"
        " n_obs, available_at, computed_at)"
        " SELECT e.event_id, h, 'market_adj', e.t0_session, e.t0_session, 0, 0, %s, 0, 1, 0, %s, %s"
        "   FROM core.events e CROSS JOIN unnest(ARRAY[1, 5, 20, 60]) AS h"
        "  WHERE e.ticker = %s AND e.event_time >= %s AND e.event_time < %s"
        " ON CONFLICT DO NOTHING",
        (TRIPWIRE, NOW - timedelta(days=30), NOW, TICKER, HOLDOUT_START, HOLDOUT_END),
    )
    await conn.execute(
        "INSERT INTO learn.predictions (run_id, disclosure_index, ticker, event_type, decided_at, published_at,"
        " horizon, predicted_bps, est_cost_bps, outcome, rules_hash)"
        " SELECT 'run-sealed-' || d.disclosure_index, d.disclosure_index, %s, 'E3', d.published_at, d.published_at,"
        " 5, 10, 30, 'NO_TRADE', 'x' FROM core.disclosures d"
        "  WHERE d.primary_ticker = %s AND d.published_at >= %s AND d.published_at < %s",
        (TICKER, TICKER, HOLDOUT_START, HOLDOUT_END),
    )


@pytest.fixture
async def world(pg: DictConn, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[dict[str, list[Any]]]:
    """The world with every learning read's date range recorded (prices and notices)."""
    await _world(pg)
    await run_event_returns(pg, date(2026, 12, 15))
    await _sealed_tripwires(pg)
    seen: dict[str, list[Any]] = {"series": [], "hlc": [], "notices": []}
    real_series, real_hlc = dataset.repo.series, dataset._hlc

    async def series(conn: Any, ticker: str, start: date, end: date) -> Any:
        seen["series"].append((ticker, start, end))
        return await real_series(conn, ticker, start, end)

    async def hlc(conn: Any, ticker: str, start: date, end: date) -> Any:
        seen["hlc"].append((ticker, start, end))
        return await real_hlc(conn, ticker, start, end)

    monkeypatch.setattr(dataset.repo, "series", series)
    monkeypatch.setattr(dataset, "_hlc", hlc)
    yield seen


def _overlaps_seal(start: date, end: date) -> bool:
    return not (end < HOLDOUT_START.date() or start >= HOLDOUT_END.date())


async def test_no_learning_read_touches_the_sealed_holdout(pg: DictConn, world: dict[str, list[Any]]) -> None:
    pool = await load_pool(pg, LATER)
    assert pool, "the world has learnable events"
    assert all(not (HOLDOUT_START <= s.published_at < HOLDOUT_END) for s in pool)
    assert all(abs(s.car) < 1 for s in pool)  # the +500 % tripwire never came in
    assert {s.published_at.astimezone(IST).date() for s in pool} == {*DEV_DAYS, POST_DAY}
    assert all(s.car == pytest.approx(AR_DEV, abs=3e-3) for s in pool if s.source == "archive")
    for _ticker, start, end in world["series"] + world["hlc"]:
        assert not _overlaps_seal(start, end), (start, end)
    live = next(s for s in pool if s.source == "live")
    assert live.features["leak_5d"] is None  # too early after the seal to have 5 unsealed sessions before it
    # the nightly maturity never fills a sealed decision, and the weekly report shows no sealed number
    await calibration.mature(pg, LATER)
    async with pg.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM learn.predictions WHERE realised_car IS NOT NULL")
        assert (await cur.fetchone())["n"] == 0
    doc = await weekly.run_pass(pg, LATER, mode="report")
    e3 = next(k for k in doc["kinds"] if k["kind"] == "E3")
    assert e3["n"] == len(DEV_DAYS) + 1 and e3["mean_net"] is not None and abs(e3["mean_net"]) < 0.05
    assert len(SEALED_DAYS) > 0  # the tripwires existed


async def test_every_learning_sql_names_the_seal() -> None:
    """A learning query on events, returns or predictions without the seal bounds is a bug, even if no test hits it."""
    for sql in (dataset.POOL_SQL, calibration.MATURE_SQL, calibration.MATURED_SQL):
        assert "seal" in sql or "%(s0)s" in sql, sql
    for sql in (dataset.HLC_SQL, dataset.CAPITAL_SQL):
        assert "d <" in sql and "d >" in sql, sql
    assert sealed_day(HOLDOUT_START.date()) and not sealed_day(HOLDOUT_END.date())


# ── versioned thresholds ─────────────────────────────────────────────────────


async def _audit(conn: DictConn, action: str) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM audit.audit_log WHERE action = %s ORDER BY chain_pos", (action,))
        return list(await cur.fetchall())


async def test_a_change_is_a_new_audited_version_and_geri_al_is_another(pg: DictConn) -> None:
    assert (await rules_store.active_rule_params(pg)) is DEFAULT_PARAMS
    change = rules_store.Change("e1_capital_10d_min", 0.0025, 0.002, "neden", {"gain_bps": 41.0, "n": 80})
    v = await rules_store.record_change(pg, change, NOW, apply=True)
    params = await rules_store.active_rule_params(pg)
    assert params.e1_capital_10d_min == 0.002 and params.rules_hash != DEFAULT_PARAMS.rules_hash
    assert params.leak_ret5d_max == DEFAULT_PARAMS.leak_ret5d_max
    [changed] = await _audit(pg, "learn.rule_changed")
    assert changed["entity_id"] == str(v) and changed["payload"]["to"] == 0.002 and changed["payload"]["applied"]
    back = await rules_store.revert_change(pg, v, NOW + timedelta(hours=1), actor="user:u1")
    assert (await rules_store.active_rule_params(pg)).rules_hash == DEFAULT_PARAMS.rules_hash
    [reverted] = await _audit(pg, "learn.rule_reverted")
    assert reverted["entity_id"] == str(back) and reverted["actor"] == "user:u1"
    with pytest.raises(rules_store.RevertError) as again:
        await rules_store.revert_change(pg, v, NOW, actor="user:u1")
    assert again.value.code == "not_revertable"
    assert await rules_store.reverted_steps(pg) == {("e1_capital_10d_min", 0.002)}
    proposed = await rules_store.record_change(pg, change, NOW, apply=False)
    assert (await rules_store.active_rule_params(pg)).rules_hash == DEFAULT_PARAMS.rules_hash  # proposals never apply
    with pytest.raises(rules_store.RevertError):
        await rules_store.revert_change(pg, proposed, NOW, actor="user:u1")
    with pytest.raises(rules_store.RevertError) as missing:
        await rules_store.revert_change(pg, 9999, NOW, actor="user:u1")
    assert missing.value.code == "not_found"


# ── the weekly pass ──────────────────────────────────────────────────────────


async def test_the_weekly_pass_applies_once_per_week_and_respects_geri_al_and_the_switch(
    pg: DictConn, monkeypatch: pytest.MonkeyPatch
) -> None:
    samples = leak_world((2022, 2023, 2024))

    async def pool(_conn: Any, _now: datetime) -> Any:
        return samples

    monkeypatch.setattr(weekly, "load_pool", pool)
    first = await weekly.run_pass(pg, NOW, mode="report")
    assert first["applied"] == [] and (await rules_store.active_rule_params(pg)) is DEFAULT_PARAMS  # report only
    done = await weekly.run_pass(pg, NOW, mode="apply")
    [applied] = done["applied"]
    assert applied["rule"] == "leak_ret5d_max" and applied["applied"] is True
    assert (await rules_store.active_rule_params(pg)).leak_ret5d_max == pytest.approx(0.07)
    assert done["telegram_tr"] is not None and "indirdi" in done["telegram_tr"] and "TL" not in done["telegram_tr"]
    assert await weekly.telegram_line(pg, NOW + timedelta(hours=1)) is not None
    again = await weekly.run_pass(pg, NOW + timedelta(days=2), mode="apply")
    assert again["applied"] == []  # one change per rule per week
    leak = next(r for r in again["rejected"] if r["rule"] == "leak_ret5d_max")
    assert "son bir haftada" in leak["reason_tr"]
    await rules_store.revert_change(pg, int(applied["version"]), NOW + timedelta(days=3), actor="user:u1")
    later = await weekly.run_pass(pg, NOW + timedelta(days=11), mode="apply")  # a week after the undo too
    assert later["applied"] == []  # a step the person took back is not re-applied by itself
    assert "geri almıştın" in next(r for r in later["rejected"] if r["rule"] == "leak_ret5d_max")["reason_tr"]


async def test_with_the_switch_off_a_step_is_only_proposed(pg: DictConn, monkeypatch: pytest.MonkeyPatch) -> None:
    async def pool(_conn: Any, _now: datetime) -> Any:
        return leak_world((2022, 2023, 2024))

    monkeypatch.setattr(weekly, "load_pool", pool)
    await weekly.set_auto_apply(pg, False, NOW, "user:u1")
    doc = await weekly.run_pass(pg, NOW, mode="apply")
    assert [c["applied"] for c in doc["applied"]] == [False]
    assert (await rules_store.active_rule_params(pg)) is DEFAULT_PARAMS
    assert "önerdi" in (doc["telegram_tr"] or "")
    report = await weekly.learning_report(pg)
    assert report["auto_apply"] is False and [c["status"] for c in report["changes"]] == ["proposed"]
    assert report["changes"][0]["can_revert"] is False
    assert len(await _audit(pg, "learn.settings_changed")) == 1


# ── calibration ──────────────────────────────────────────────────────────────


async def test_matured_decisions_calibrate_their_kind_after_thirty(pg: DictConn) -> None:
    await _world(pg)
    await run_event_returns(pg, date(2026, 12, 15))
    live_index = 993_000_001 + len(DEV_DAYS) + len(SEALED_DAYS) + 1  # POST_DAY, published 2026-11-02
    ok = await calibration.record_prediction(
        pg, run_id="run-live-1", disclosure_index=live_index, ticker=TICKER, event_type="E3", decided_at=NOW,
        published_at=datetime(2026, 11, 2, 11, 0, tzinfo=IST), expected_edge_bps=40, correction=Decimal(1),
        est_cost_bps=30, outcome="NO_TRADE", rules_hash=DEFAULT_PARAMS.rules_hash,
    )  # fmt: skip
    assert ok
    sealed = await calibration.record_prediction(
        pg, run_id="run-sealed", disclosure_index=1, ticker=TICKER, event_type="E3", decided_at=NOW,
        published_at=datetime(2025, 3, 1, 11, 0, tzinfo=IST), expected_edge_bps=40, correction=Decimal(1),
        est_cost_bps=30, outcome="NO_TRADE", rules_hash="x",
    )  # fmt: skip
    assert not sealed  # a sealed decision is never recorded
    summary = await calibration.mature(pg, LATER)
    assert summary["filled"] == 1 and summary["matured"]["E3"] == 1 and summary["active"] == []
    assert await calibration.correction_for(pg, "E3") == Decimal(1)  # one decision is not enough
    async with pg.cursor() as cur:
        for i in range(calibration.MIN_MATURED):
            await cur.execute(
                "INSERT INTO learn.predictions (run_id, disclosure_index, ticker, event_type, decided_at,"
                " published_at, horizon, predicted_bps, est_cost_bps, outcome, rules_hash, realised_car, matured_at)"
                " VALUES (%s, %s, 'X', 'E1', %s, %s, 20, 100, 30, 'NO_TRADE', 'x', 0.006, %s)",
                (f"run-c-{i}", 990_000 + i, NOW, NOW, NOW),
            )
    await calibration.mature(pg, LATER)
    assert await calibration.correction_for(pg, "E1") == Decimal("0.6")  # realised 60 bp on predicted 100 bp


# ── the API ──────────────────────────────────────────────────────────────────


@pytest.fixture
async def clean_learn(owner_pg: DictConn) -> AsyncIterator[DictConn]:
    async def wipe() -> None:
        await owner_pg.execute("TRUNCATE learn.rule_versions, learn.reports, learn.predictions, learn.calibration")
        await owner_pg.execute("UPDATE learn.settings SET auto_apply = true, updated_at = NULL WHERE id = 1")
        await owner_pg.commit()

    await wipe()
    yield owner_pg
    await wipe()


async def test_the_learning_api(client: httpx.AsyncClient, migrated: Settings, clean_learn: DictConn) -> None:
    assert (await client.get(URL)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    headers = bearer(login.json()["access_token"])
    empty = (await client.get(URL, headers=headers)).json()
    assert_matches("LearningReport", empty)
    assert empty["generated_at"] is None and empty["auto_apply"] is True and len(empty["kinds"]) == 4
    assert empty["changes"] == [] and empty["kinds"][0]["calibration"]["needed"] == 30
    t = BY_KEY["e1_capital_10d_min"]
    change = rules_store.Change(t.key, 0.0025, 0.002, "KAPtan bu hafta ...", {"gain_bps": 41.0, "ci_low_bps": 6.0,
                                "ci_high_bps": 77.0, "n": 80})  # fmt: skip
    version = await rules_store.record_change(clean_learn, change, NOW, apply=True)
    await clean_learn.commit()
    shown = (await client.get(URL, headers=headers)).json()
    assert_matches("LearningReport", shown)
    assert [(c["version"], c["status"], c["can_revert"]) for c in shown["changes"]] == [(version, "applied", True)]
    off = await client.put(f"{URL}/settings", headers=headers, json={"auto_apply": False})
    assert off.status_code == 200 and off.json()["auto_apply"] is False
    undone = await client.post(f"{URL}/changes/{version}/revert", headers=headers)
    assert undone.status_code == 200
    assert_matches("LearningReport", undone.json())
    assert [c["status"] for c in undone.json()["changes"]] == ["reverted"]
    twice = await client.post(f"{URL}/changes/{version}/revert", headers=headers)
    assert twice.status_code == 409 and "geri alınamaz" in twice.json()["detail"]
    assert (await client.post(f"{URL}/changes/9999/revert", headers=headers)).status_code == 404
