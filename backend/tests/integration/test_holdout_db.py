"""The seal and the one run on Postgres: nothing reads the holdout before its run, it runs once, the stage repeats it.

Synthetic world as in test_evidence_db: the stock follows the market model exactly on closes and each event carries a
known abnormal return on its entry session, so every CAR below is known by hand. Everything rolls back with `pg`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

import pytest
from psycopg import errors

from kaptan.db import DictConn
from kaptan.evalreports.holdout import HoldoutRefusedError, main_report, readiness_problems, run_holdout, run_of
from kaptan.evalreports.stage import personal_stage
from kaptan.evidence.repo import past_events
from kaptan.evidence.service import scoped_study
from kaptan.prices.calendar import IST, add_sessions, sessions_between
from kaptan.reference.event_returns import run_archive_returns, run_event_returns
from tests.unit.test_evidence_study import at

pytestmark = pytest.mark.integration

ALL_DAYS: Final = sessions_between(date(2023, 6, 1), date(2026, 12, 31))
RB_OC: Final = 0.002
TICKER: Final = "HLDAA"
#: Far enough apart that clustering (10 sessions) keeps each one.
DEV_DAYS: Final = sessions_between(date(2024, 3, 1), date(2024, 11, 1))[::15][:8]
SEALED_DAYS: Final = sessions_between(date(2025, 2, 3), date(2026, 8, 1))[::15][:32]
#: Inside the holdout, its 5-session window closes after it: the completion run's event (06 §12.1).
LATE_DAY: Final = date(2026, 10, 27)
POST_DAY: Final = date(2026, 11, 2)
NOW: Final = datetime(2026, 11, 25, 20, 0, tzinfo=IST)
AR_DEV: Final = 0.01
AR_SEALED: Final = 0.05
SELF: Final = 993_999_999


def _close(i: int) -> float:
    return 100.0 * (1 + 0.0005 * ((i * 7) % 5 - 2))


async def _world(conn: DictConn, *, route: str = "E3", parsed: str | None = None, first: int = 993_000_001) -> None:
    sealed = [*SEALED_DAYS, LATE_DAY]
    ars = {add_sessions(d, 1): AR_DEV for d in DEV_DAYS} | {add_sessions(d, 1): AR_SEALED for d in sealed}
    stock, bench = [], []
    for i, d in enumerate(ALL_DAYS):
        close = _close(i)
        open_ = close / (1 + ars.get(d, 0.0) + RB_OC)
        stock.append(
            (TICKER, d, Decimal(str(round(open_, 6))), Decimal(str(round(close, 6))), close * 1.01, close * 0.99)
        )
        bench.append(("XU100", d, Decimal(str(round(close / (1 + RB_OC), 6))), Decimal(str(round(close, 6)))))
    rows = [
        (first + k, TICKER, route, parsed, at(d, 11), at(d, 11) + timedelta(seconds=60))
        for k, d in enumerate([*DEV_DAYS, *sealed, POST_DAY])
    ]
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, high, low, turnover_try, price_basis, source)"
            " VALUES (%s, %s, %s, %s, %s, %s, 50000000, 'raw', 'isyatirim')",
            stock,
        )
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, price_basis, source)"
            " VALUES (%s, %s, %s, %s, 'adjusted', 'yfinance')",
            bench,
        )
        await cur.executemany(
            "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
            " disclosure_type, subject, summary, reason, subject_route, subject_map_version, parsed, published_at,"
            " available_at, ingest_source, origin, visible)"
            " VALUES (%s, %s, 'HLD A.Ş.', 'ODA', 'ODA', 'Yeni İş İlişkisi', '', 'NEW', %s, 'test', %s, %s, %s,"
            " 'backfill', 'kap', false)",
            rows,
        )


async def _run(conn: DictConn, **kw: Any) -> dict[str, Any]:
    args = {"now": NOW, "actor": "sahip", "rules_hash": "r" * 8, "check_ready": False, **kw}
    return await run_holdout(conn, **args)


async def test_live_evidence_cannot_read_the_sealed_period(pg: DictConn) -> None:
    await _world(pg)
    events = await past_events(pg, "E3", NOW, SELF)
    assert {e.published_at.astimezone(IST).date() for e in events} == {*DEV_DAYS, POST_DAY}
    scoped = await scoped_study(pg, "E3", TICKER, NOW, SELF)
    assert scoped.result.n == len(DEV_DAYS)  # post-holdout event: its 20-session window is still open on the 25th
    assert all(r.cars[20] == pytest.approx(AR_DEV, abs=2e-3) for r in scoped.result.results)


async def test_events_after_the_holdout_count_once_their_window_closed(pg: DictConn) -> None:
    await _world(pg)
    later = datetime(2026, 12, 15, 20, 0, tzinfo=IST)
    scoped = await scoped_study(pg, "E3", TICKER, later, SELF)
    assert scoped.result.n == len(DEV_DAYS) + 1


async def test_nothing_of_the_holdout_is_materialised_before_its_run(pg: DictConn) -> None:
    await _world(pg)
    stats = await run_event_returns(pg, date(2026, 11, 25))
    assert stats.new_events == len(DEV_DAYS) + len(SEALED_DAYS) + 2  # events are typed; their returns are not read
    async with pg.cursor() as cur:
        await cur.execute(
            "SELECT count(*) AS n FROM core.event_returns r JOIN core.events e USING (event_id)"
            " WHERE e.event_time >= timestamptz '2025-01-01 00:00:00+03'"
            " AND e.event_time < timestamptz '2026-11-01 00:00:00+03'"
        )
        assert (await cur.fetchone())["n"] == 0


async def test_the_personal_stage_reads_no_return_of_the_period(pg: DictConn) -> None:
    await _world(pg)
    today = date(2026, 11, 5)
    before = await personal_stage(pg, now=NOW, today=today)
    assert before["criteria"][0]["current_tr"] == "Henüz ölçülmedi"
    await _run(pg)
    after = await personal_stage(pg, now=NOW, today=today)
    assert after["criteria"][0]["current_tr"].startswith("E3")


async def test_the_run_measures_the_period_then_refuses_a_second(pg: DictConn) -> None:
    await _world(pg)
    report = await _run(pg, git_sha="abc", prereg_ref="tag")
    e3 = report["types"]["E3"]
    assert e3["horizon"] == 5 and e3["n"] == len(SEALED_DAYS) + 1
    assert e3["base"]["mean_car"] == pytest.approx(AR_SEALED, abs=2e-3)
    assert (
        e3["base"]["mean_car_net"] < e3["base"]["mean_car"]
        and e3["sensitivity"]["mean_car_net"] < e3["base"]["mean_car_net"]
    )
    assert report["types"]["E1"]["n"] == 0 and report["only_closed_after"] is None
    assert await main_report(pg) == report
    row = await run_of(pg)
    assert row is not None and (row["actor"], row["rules_hash"], row["git_sha"]) == ("sahip", "r" * 8, "abc")
    with pytest.raises(HoldoutRefusedError, match="never runs twice"):
        await _run(pg)
    assert await main_report(pg) == report


async def test_the_run_is_audited_with_the_result(pg: DictConn) -> None:
    await _world(pg)
    await _run(pg)
    async with pg.cursor() as cur:
        await cur.execute("SELECT actor, payload FROM audit.audit_log WHERE action = 'holdout.main.run'")
        rows = await cur.fetchall()
    assert len(rows) == 1 and rows[0]["actor"] == "user:sahip" and "report_sha256" in rows[0]["payload"]


async def test_evidence_opens_only_for_decisions_after_the_run(pg: DictConn) -> None:
    await _world(pg)
    await _run(pg)
    row = await run_of(pg)
    assert row is not None
    before = await past_events(pg, "E3", row["finished_at"] - timedelta(seconds=1), SELF)
    after = await past_events(pg, "E3", row["finished_at"] + timedelta(seconds=1), SELF)
    assert len(before) == len(DEV_DAYS) + 1 and len(after) == len(DEV_DAYS) + len(SEALED_DAYS) + 2


async def test_after_the_run_the_nightly_job_materialises_the_period(pg: DictConn) -> None:
    await _world(pg)
    await _run(pg)
    day = date(2026, 12, 15)
    await run_event_returns(pg, day, now=datetime(2026, 12, 15, 20, 0, tzinfo=IST))
    async with pg.cursor() as cur:
        await cur.execute(
            "SELECT count(DISTINCT r.event_id) AS n FROM core.event_returns r JOIN core.events e USING (event_id)"
            " WHERE r.horizon = 5 AND e.event_time >= timestamptz '2025-01-01 00:00:00+03'"
        )
        assert (await cur.fetchone())["n"] >= len(SEALED_DAYS)


async def test_completion_is_separate_and_also_once(pg: DictConn) -> None:
    await _world(pg)
    with pytest.raises(HoldoutRefusedError, match="main run first"):
        await _run(pg, kind="completion")
    main = await _run(pg, now=datetime(2026, 11, 2, 20, 0, tzinfo=IST))  # LATE_DAY's window is still open
    assert main["types"]["E3"]["n"] == len(SEALED_DAYS)
    later = datetime(2026, 12, 15, 20, 0, tzinfo=IST)
    completion = await _run(pg, kind="completion", now=later)
    assert completion["only_closed_after"] is not None and completion["types"]["E3"]["n"] == 1
    assert await main_report(pg) == main  # the completion never replaces the main result
    with pytest.raises(HoldoutRefusedError, match="never runs twice"):
        await _run(pg, kind="completion", now=later)


async def test_an_incomplete_archive_refuses_and_writes_nothing(pg: DictConn) -> None:
    await _world(pg)
    problems = await readiness_problems(pg, NOW)
    assert any("KAP archive" in p for p in problems) and any("price step" in p for p in problems)
    with pytest.raises(HoldoutRefusedError, match="KAP archive"):
        await _run(pg, check_ready=True)
    assert await run_of(pg) is None
    too_early = await readiness_problems(pg, datetime(2026, 10, 1, tzinfo=IST))
    assert any("has not ended" in p for p in too_early)


async def test_a_run_on_nothing_refuses_rather_than_spending_itself(pg: DictConn) -> None:
    with pytest.raises(HoldoutRefusedError):
        await _run(pg)
    assert await run_of(pg) is None


async def test_the_app_role_cannot_rewrite_or_erase_the_run(pg: DictConn) -> None:
    await _world(pg)
    await _run(pg)
    for sql in ("UPDATE core.holdout_runs SET actor = 'x'", "DELETE FROM core.holdout_runs"):
        with pytest.raises(errors.InsufficientPrivilege):
            async with pg.transaction():
                await pg.execute(sql)


# ── the definition, as evidence reads it ──────────────────────────────────────────────────────────


async def test_an_e1_without_transactions_and_a_correction_are_not_evidence(pg: DictConn) -> None:
    await _world(pg, route="E1", parsed='{"status": "ok"}')
    async with pg.cursor() as cur:
        await cur.execute(
            'UPDATE core.disclosures SET parsed = \'{"status": "partial"}\' WHERE disclosure_index = %s', (993_000_001,)
        )
        await cur.execute("UPDATE core.disclosures SET reason = 'CORR' WHERE disclosure_index = %s", (993_000_002,))
        await cur.execute("UPDATE core.disclosures SET reason = 'UPD' WHERE disclosure_index = %s", (993_000_003,))
    ids = {e.ref_id for e in await past_events(pg, "E1", NOW, SELF)}
    assert "evt:kap:993000001" not in ids and "evt:kap:993000002" not in ids
    assert "evt:kap:993000003" in ids  # "Güncelleme: Evet": every executed buyback says it


async def test_e2_evidence_is_net_purchases_only(pg: DictConn) -> None:
    await _world(pg, route="E2", parsed='{"direction": "buy"}')
    async with pg.cursor() as cur:
        await cur.execute(
            'UPDATE core.disclosures SET parsed = \'{"direction": "sell"}\' WHERE disclosure_index = %s', (993_000_001,)
        )
        await cur.execute("UPDATE core.disclosures SET parsed = NULL WHERE disclosure_index = %s", (993_000_002,))
    ids = {e.ref_id for e in await past_events(pg, "E2", NOW, SELF)}
    assert "evt:kap:993000001" not in ids and "evt:kap:993000002" not in ids and "evt:kap:993000003" in ids


async def test_settled_events_are_not_retried_every_night(pg: DictConn) -> None:
    await pg.execute(
        "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
        " disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,"
        " available_at, ingest_source, origin, visible)"
        " VALUES (993100001, 'NOPRC', 'X', 'ODA', 'ODA', 'Yeni İş İlişkisi', '', 'NEW', 'E3', 'test', %s, %s,"
        " 'backfill', 'kap', false)",
        (at(date(2024, 3, 4), 11), at(date(2024, 3, 4), 11) + timedelta(seconds=60)),
    )
    first = await run_event_returns(pg, date(2024, 12, 2))
    assert first.new_events == 1 and first.pending == 1 and first.no_prices == 1 and first.rows == 0
    again = await run_event_returns(pg, date(2024, 12, 3))
    assert again.pending == 0


async def _erase_world(conn: DictConn) -> None:
    """`run_archive_returns` commits per company, so its test cleans up by hand instead of rolling back."""
    await conn.rollback()
    await conn.execute("DELETE FROM core.events WHERE ticker = %s", (TICKER,))
    await conn.execute("DELETE FROM core.disclosures WHERE primary_ticker = %s", (TICKER,))
    await conn.execute("DELETE FROM core.prices_daily WHERE ticker = %s OR ticker = 'XU100'", (TICKER,))
    await conn.commit()


async def test_the_archive_pass_works_per_company_and_reports_progress(pg: DictConn) -> None:
    await _erase_world(pg)
    await _world(pg)
    seen: list[tuple[int, int, str]] = []
    try:
        stats = await run_archive_returns(pg, date(2026, 11, 25), now=NOW, on_ticker=lambda *a: seen.append(a))
        assert seen == [(1, 1, TICKER)] and stats.rows >= 4 * len(DEV_DAYS) and stats.no_prices == 0
        assert stats.pending == len(DEV_DAYS) + 1  # the sealed events are typed but not worked
    finally:
        await _erase_world(pg)
