"""A live-shaped E1 through the whole graph: the path no real run has shown yet.

`run_disclosure` is the live worker's call. The notice is a real KAP buyback form (844786, recorded 2026-11-03) with
its table moved to the decision days, so the deterministic parser, the point-in-time features and the sizer read what
they would read in production. The tools are the live ones (provider named "live": real SQL, real sizer, real desk);
only the models' answers are recorded. Prices and returns are synthetic and known by construction: nothing here says
anything about real buybacks.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from itertools import count
from pathlib import Path
from typing import Any, Final

import pytest
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.feed_run import LiveDeps, LiveResult, run_disclosure
from kaptan.db import DictConn, create_pool
from kaptan.ingest.parsers import parse_detail
from kaptan.ingest.repo import classification_for
from kaptan.llm.provider import LLMRequest, LLMResult, fingerprint
from kaptan.prices.calendar import add_sessions, sessions_between
from kaptan.risk.desk import mark_restrictions_refreshed
from kaptan.settings import Settings
from tests.conftest import reseed_test_db
from tests.harness.replay import Cassette, ReplayProvider, ReplayToolbox, recording_of
from tests.harness.seed import SeedResult
from tests.unit.agent_fixtures import fixture_run
from tests.unit.test_evidence_study import at

pytestmark = pytest.mark.integration

TICKER: Final = "TSTEB"
SUBJECT: Final = "Payların Geri Alınmasına İlişkin Bildirim"
FORM: Final = (Path(__file__).resolve().parents[1] / "fixtures" / "archive" / "844786.txt").read_text("utf-8")
DAYS: Final = sessions_between(date(2022, 6, 1), date(2026, 11, 2))
DECISION_DAY: Final = date(2026, 11, 2)
NOW: Final = at(DECISION_DAY, 19) + timedelta(seconds=30)
#: A fresh disclosure per run: the graph checkpoints by run id, and a run id is the disclosure's.
LIVE_INDEXES: Final = count(992_500_000)
FIRST_PAST: Final = 992_000_001
PAST_DAYS: Final = sessions_between(date(2023, 3, 1), date(2024, 11, 15))[::11][:36]
SEALED_DAYS: Final = sessions_between(date(2025, 2, 3), date(2025, 12, 1))[::11][:12]
CAPITAL: Final = Decimal(100_000_000)
#: Two rows of 0.15 %: 0.30 % of the capital in the last 10 sessions, above the E1 trigger of 06 §3.1 (0.25 %).
NOMINAL_ROW: Final = 150_000


def _rb(i: int) -> float:
    return 0.008 * (((i * 7) % 11) - 5) / 5


def _noise(i: int) -> float:
    return 0.006 * (((i * 13) % 7) - 3) / 3


def _dec(x: float) -> Decimal:
    return Decimal(str(round(x, 6)))


def _ar(k: int, level: float) -> float:
    """A known abnormal return with dispersion: the statistics must not divide by zero."""
    return level * (1 + 0.5 * (((k * 3) % 5) - 2) / 2)


def _rows(ars: dict[date, float]) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    stock, bench, s, b = [], [], 50.0, 10_000.0
    for i, d in enumerate(DAYS):
        if i:
            s, b = s * (1 + 0.0002 + 1.1 * _rb(i) + _noise(i)), b * (1 + _rb(i))
        open_ = s / (1 + ars.get(d, 0.0) + 0.0002)
        stock.append((TICKER, d, _dec(open_), _dec(max(open_, s) * 1.004), _dec(min(open_, s) * 0.996), _dec(s),
                      Decimal(10_000_000), _dec(s) * CAPITAL, _dec(s) * 30_000_000, CAPITAL))  # fmt: skip
        bench.append(("XU100", d, _dec(b / 1.001), _dec(b)))
    return stock, bench


def _real_form() -> str:
    """The real form, its transaction table replaced by two rows inside the last 10 sessions."""
    rows = [
        f"{TICKER}, TRETAVH00018 {d:%d.%m.%Y} 150.000 0,150 54,10 -"
        for d in (add_sessions(DECISION_DAY, -1), DECISION_DAY)
    ]
    out: list[str] = []
    for line in FORM.splitlines():
        if line.startswith("TAVHL, "):
            out.extend(rows)
            rows = []
        elif "adet hisse alımı" not in line:
            out.append(line)
    return "\n".join(out)


#: The real form has no "<amount> TL" for a trade: the column header says (TL), the cells are bare numbers.
REAL_FORM: Final = _real_form()
#: The same form with one free-text sentence that happens to write the amount the way R14's regex reads it.
WITH_TL_SENTENCE: Final = REAL_FORM.replace(
    "Ek Açıklamalar\n", "Ek Açıklamalar\nToplam 300.000 TL nominal geri alındı.\n"
)


def _reader_answer(text: str) -> dict[str, Any]:
    trades = [
        {"trade_date": d.isoformat(), "nominal_tl": NOMINAL_ROW, "capital_pct": 0.0015, "price_tl": 54.1,
         "price_raw": "54,10", "prior_nominal_in_program_tl": None}
        for d in (add_sessions(DECISION_DAY, -1), DECISION_DAY)
    ]  # fmt: skip
    quote = next(line for line in text.splitlines() if line.startswith(f"{TICKER}, "))
    return {
        **recording_of(fixture_run("run-day-e1-krgcl")).outputs["reader"],
        "board_decision_date": "2020-03-12",
        "programme_max_nominal_tl": 36_328_125,
        "transactions": trades,
        "cumulative_nominal_tl": 2 * NOMINAL_ROW,
        "cumulative_capital_pct": 0.003,
        "quotes": [{"field": "amount", "quote": quote}],
    }


class RecordedLive:
    """The live wiring (`name == "live"`) with recorded answers: never a network call."""

    name = "live"

    def __init__(self, cited: list[str], text: str) -> None:
        rec = recording_of(fixture_run("run-day-e1-krgcl"))
        outputs = {**rec.outputs, "reader": _reader_answer(text)}
        recorded = replace(rec, ticker=TICKER, fingerprint=fingerprint(TICKER, text), outputs=outputs)
        self.base = ReplayProvider(Cassette([recorded]))
        self.cited = cited

    async def complete(self, request: LLMRequest) -> LLMResult:
        res = await self.base.complete(request)
        if request.agent != "evidence":
            return res
        selected = [
            {"ref_id": ref, "relevance": "high", "why_similar_tr": "Aynı tür geri alım."} for ref in self.cited[:12]
        ]
        return replace(res, output={**res.output, "selected": selected})


World = Callable[..., Awaitable[LiveResult]]


async def _clean_prices(conn: DictConn) -> None:
    await conn.execute("DELETE FROM core.prices_daily WHERE ticker = %s OR ticker = 'XU100'", (TICKER,))


async def _seed_prices(conn: DictConn, ars: dict[date, float]) -> None:
    stock, bench = _rows(ars)
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, high, low, close, turnover_try, mcap_try,"
            " free_float_mcap_try, capital_try, price_basis, source)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'raw', 'isyatirim')",
            stock,
        )
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, price_basis, source)"
            " VALUES (%s, %s, %s, %s, 'adjusted', 'yfinance')",
            bench,
        )


async def _seed_notices(conn: DictConn, live_index: int, past: list[date], text: str) -> None:
    published = at(DECISION_DAY, 19)
    parsed = parse_detail(SUBJECT, text)
    assert parsed is not None and parsed["status"] == "ok"
    await conn.execute(
        "INSERT INTO core.issuers (ticker, name, sector, group_name, free_float, adv20_try, price, in_universe, origin)"
        " VALUES (%s, 'TEST A.Ş.', 'Test', '', 0.3, 50000000, 50, true, 'kap')"
        " ON CONFLICT (ticker) DO UPDATE SET in_universe = true",
        (TICKER,),
    )
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
            " disclosure_type, subject, summary, reason, subject_route, subject_map_version, parsed, published_at,"
            " available_at, ingest_source, origin, visible)"
            " VALUES (%s, %s, 'TEST A.Ş.', 'ODA', 'ODA', %s, '', 'UPD', 'E1', 'test', %s, %s, %s,"
            " 'backfill', 'kap', false)",
            [
                (FIRST_PAST + k, TICKER, SUBJECT, Jsonb({"status": "ok"}), at(d, 11), at(d, 11) + timedelta(seconds=60))
                for k, d in enumerate(past)
            ],
        )
    await conn.execute(
        "INSERT INTO core.disclosures (disclosure_index, primary_ticker, stock_codes, company_name, disclosure_class,"
        " disclosure_type, subject, summary, reason, subject_route, subject_map_version, classification, parsed,"
        " published_at, first_seen_at, available_at, ingest_source, origin, visible)"
        " VALUES (%s, %s, %s, 'TEST A.Ş.', 'ODA', 'ODA', %s, %s, 'UPD', 'E1', 'test', %s, %s, %s, %s, %s, 'live',"
        " 'kap',"
        " true)",
        (
            live_index,
            TICKER,
            [TICKER],
            SUBJECT,
            SUBJECT,
            Jsonb(classification_for("E1")),
            Jsonb(parsed),
            published,
            published,
            published + timedelta(seconds=21),
        ),
    )
    await conn.execute(
        "INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)", (live_index, text)
    )


@pytest.fixture
async def world(seeded: SeedResult, migrated: Settings) -> AsyncIterator[World]:
    pool: AsyncConnectionPool[DictConn] = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)

    async def build(
        level: float,
        past: list[date],
        sealed: tuple[date, ...] | list[date] = SEALED_DAYS,
        text: str = WITH_TL_SENTENCE,
    ) -> LiveResult:
        ars = {add_sessions(d, 1): _ar(k, level) for k, d in enumerate(past)}
        ars |= {add_sessions(d, 1): 0.25 for d in sealed}  # the sealed period screams: it must not be heard
        provider = RecordedLive([f"evt:kap:{FIRST_PAST + k}" for k in range(len(past))], text)
        live_index = next(LIVE_INDEXES)
        async with pool.connection() as conn:
            await _clean_prices(conn)
            await _seed_prices(conn, ars)
            await _seed_notices(conn, live_index, [*past, *sealed], text)
            await mark_restrictions_refreshed(conn, "test", NOW, 0)
            await conn.commit()
            result = await run_disclosure(conn, live_index, NOW, LiveDeps(provider=provider, tools=ReplayToolbox()))
            await conn.commit()
        return result

    try:
        yield build
    finally:
        await reseed_test_db(migrated)  # disclosures, runs, cards and audit rows are the seed's tables
        async with pool.connection() as conn:
            await _clean_prices(conn)
            await conn.commit()
        await pool.close()


def _nodes(result: LiveResult) -> set[str]:
    return {n["node"] for n in result.explain["trace"]["nodes"]}


async def test_an_e1_reaches_the_rules_with_evidence_and_passes_the_risk_gate(world: World) -> None:
    result = await world(0.04, PAST_DAYS)
    explain = result.explain
    assert explain["run"]["event_type"] == "E1" and explain["disclosure"]["classification"]["method"] == "subject_map"
    merged = explain["merged"]
    # the whole graph ran; the classifier cost no model call (the subject map typed it, as the archive does)
    assert {"route", "pre_gate", "guard", "reader", "materiality", "evidence", "merge", "skeptic"} <= _nodes(result)
    assert {"rule_engine", "compliance", "risk_gate", "request_approval"} <= _nodes(result)
    # evidence: the 36 dev-period events only; the 12 loud sealed ones (AR = 25 %) are invisible
    assert merged["evidence_n"] == len(PAST_DAYS)
    assert all(int(r.split(":")[2]) < FIRST_PAST + len(PAST_DAYS) for r in merged["retrieved_ids"])
    # the trigger comes from the deterministic parse of the real form
    assert merged["buyback_10d_capital_pct"] == pytest.approx(0.003) and merged["e1_nature"] == "execution"
    assert explain["rule_decision"]["outcome"] == "PROPOSE", explain["rule_decision"]
    assert explain["risk_checks"], "the gate ran"
    assert result.outcome == "PROPOSE" and result.feed_status == "waiting_approval", explain["risk_checks"]
    p = explain["proposal"]
    assert p["holding_days_min"] == 20 and p["expected_edge_bps"] >= 2 * p["est_cost_bps"]
    assert p["evidence_ids"] and set(p["evidence_ids"]) <= set(p["retrieved_ids"])


async def test_the_real_form_today_stops_at_r14(world: World) -> None:
    """THE BLOCKER: a real E1 form writes no "<amount> TL" for its trades, so merge's regex finds nothing to confirm the
    Reader's nominal and R14 rejects, after every rule before it passed. When merge reads the table this test changes.
    """
    result = await world(0.04, PAST_DAYS, text=REAL_FORM)
    explain = result.explain
    assert explain["rule_decision"]["outcome"] == "PROPOSE" and "risk_gate" in _nodes(result)
    assert explain["merged"]["reader_amount"] == 2 * NOMINAL_ROW
    assert 2 * NOMINAL_ROW not in explain["merged"]["regex_amounts"] and explain["merged"]["amount_in_text"] is False
    last = explain["risk_checks"][-1]
    assert (last["rule_code"], last["outcome"]) == ("R14", "reject"), explain["risk_checks"]
    assert result.outcome != "PROPOSE" and explain["approval"] is None


async def test_no_abnormal_return_means_no_trade_for_lack_of_edge(world: World) -> None:
    result = await world(0.0, PAST_DAYS)
    assert result.explain["merged"]["evidence_n"] == len(PAST_DAYS)
    assert result.outcome == "NO_TRADE" and "EDGE_BELOW_COST" in result.explain["rule_decision"]["reason_codes"]
    assert result.explain["proposal"] is None


async def test_too_few_events_is_not_a_trade(world: World) -> None:
    result = await world(0.04, PAST_DAYS[:4], sealed=[])
    assert result.explain["merged"]["evidence_n"] == 4
    assert result.outcome in ("NO_TRADE", "HOLD") and result.explain["proposal"] is None


async def test_only_sealed_events_are_no_evidence(world: World) -> None:
    result = await world(0.04, [])
    assert not result.explain["merged"]["evidence_n"]
    assert result.outcome == "HOLD" and result.explain["proposal"] is None
