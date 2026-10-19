"""tedbir_sync on Postgres: KAP notices → restriction_events → the active list R04 reads."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from kaptan.agents.feed_run import desk_for
from kaptan.db import DictConn
from kaptan.prices.calendar import IST
from kaptan.reference.tedbir import run_tedbir_sync
from kaptan.risk.desk import restrictions_age_h
from tests.integration.a4_support import add_disclosure

pytestmark = pytest.mark.integration
T0 = datetime(2026, 10, 19, 19, 0, tzinfo=IST)
SPK_TEXT = "Paylarda 19.10.2026 tarihinden itibaren 10 gün süreyle tedbir uygulanacaktır."


async def _ids(conn: DictConn) -> dict[str, str]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, kind FROM core.restricted_securities ORDER BY id")
        return {r["id"]: r["kind"] for r in await cur.fetchall()}


async def test_sync_activates_lifts_expires_and_marks_refresh(pg: DictConn) -> None:
    demo_before = await _ids(pg)
    await add_disclosure(pg, 990_100_001, subject="Sermaye Piyasası Kurulu Tedbir Kararı", published=T0,
                         ticker="TSTAA", route="avoid:spk_tedbir", cls="DUY",
                         text=SPK_TEXT)  # fmt: skip
    await add_disclosure(pg, 990_100_002, subject="Borsa İstanbul Duyurusu", summary="VBTS kapsamında brüt takas",
                         published=T0, related=["TSTBB"], cls="DKB")  # fmt: skip
    await add_disclosure(pg, 990_100_003, subject="İşlem Sırasının Durdurulması", published=T0, related=["TSTCC"],
                         cls="DKB")  # fmt: skip
    now = T0 + timedelta(hours=1)
    stats = await run_tedbir_sync(pg, now)
    assert (stats.measures, stats.active) == (3, 3)
    ids = await _ids(pg)
    assert {k: v for k, v in ids.items() if k.startswith("ts:")} == {
        "ts:kap:990100001:TSTAA:spk_tedbir": "spk_tedbir",
        "ts:kap:990100002:TSTBB:vbts_brut_takas": "vbts_brut_takas",
        "ts:kap:990100003:TSTCC:trading_halt": "trading_halt",
    }
    assert {k: v for k, v in ids.items() if not k.startswith("ts:")} == demo_before  # demo rows untouched
    assert await restrictions_age_h(pg, now) == 0.0  # R04 freshness marked (core.restriction_refresh)
    desk = await desk_for(pg, "TSTBB")
    assert [r.kind for r in desk.restrictions] == ["vbts_brut_takas"]
    # idempotent
    again = await run_tedbir_sync(pg, now)
    assert again.active == 3 and again.pruned == 0
    # the halt is lifted, the SPK measure expires after its 10 days
    await add_disclosure(pg, 990_100_004, subject="İşlem Sırasının Açılması", published=T0 + timedelta(hours=14),
                         related=["TSTCC"], cls="DKB")  # fmt: skip
    later = T0 + timedelta(days=12)
    after = await run_tedbir_sync(pg, later)
    assert after.lifts == 1
    assert {k for k in await _ids(pg) if k.startswith("ts:")} == {"ts:kap:990100002:TSTBB:vbts_brut_takas"}
    async with pg.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM core.restriction_events WHERE id LIKE 'kap:9901000%%'")
        assert (await cur.fetchone())["n"] == 3  # history is kept (U7)


async def test_bulletin_source_is_optional_and_marks_its_own_refresh(pg: DictConn) -> None:
    async def bulletin() -> tuple[str, str, datetime]:
        return "Z A.Ş. (TSTDD) paylarında 1 ay süreyle tedbir uygulanmıştır.", "b-1", T0

    stats = await run_tedbir_sync(pg, T0 + timedelta(hours=1), bulletin=bulletin)
    assert stats.bulletin_measures == 1
    assert any(k.startswith("ts:spk:b-1:") and k.endswith(":TSTDD") for k in await _ids(pg))
    async with pg.cursor() as cur:
        await cur.execute("SELECT source FROM core.restriction_refresh ORDER BY source")
        assert {r["source"] for r in await cur.fetchall()} >= {"kap_tedbir", "spk_bulletin"}
