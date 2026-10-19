"""Live tools inside the graph: the models only cite, the code supplies every number (no Postgres)."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from typing import Any

import pytest

from kaptan.agents.scenario import run_graph
from kaptan.agents.tools import ReplayToolbox
from kaptan.evidence import LiveToolbox, live_tools, toolbox_for
from kaptan.evidence.card import evidence_store, ground_materiality, ground_selection
from kaptan.evidence.market import MaterialityInputs, PriceContext
from kaptan.evidence.service import ScopedStudy
from kaptan.evidence.study import study
from tests.unit.agent_fixtures import context_for, fixture_run
from tests.unit.test_evidence_study import AS_OF, BENCH, DAYS, STOCK, at, event

RUN = "run-demo-e3-ornek"
RECORDED = fixture_run(RUN)["explain"]


def _price(ticker: str = "ORNEK") -> tuple[PriceContext, MaterialityInputs]:
    pc = PriceContext(
        ticker=ticker,
        as_of=AS_OF,
        session=DAYS[20],
        last_close_try=Decimal("50.25"),
        returns={1: 0.01, 5: 0.02, 20: None},
        ret_3m=None,
        vol_20d=0.021,
        adv20_try=Decimal(30_000_000),
        ret_5d_mkt_adj=0.0123,
        ret_10d_mkt_adj=-0.004,
    )
    mi = MaterialityInputs(Decimal(6_000_000_000), Decimal(2_000_000_000), Decimal(120_000_000), unknown=("x",))
    return pc, mi


def _scoped(n: int, ticker: str = "ORNEK") -> ScopedStudy:
    evs = [event(f"kap:{900 + i}", f"TST{chr(65 + i)}", at(DAYS[10], 11)) for i in range(n)]
    return ScopedStudy("market", ticker, "E3", study(evs, {e.ticker: STOCK for e in evs}, BENCH, AS_OF, (1, 5, 20)))


def _prepared(ctx: Any, n: int = 6) -> LiveToolbox:
    """A live toolbox whose SQL already ran (prepare() then touches no connection)."""
    live = LiveToolbox(conn=None, disclosure=ctx.disclosure, base=ReplayToolbox())  # type: ignore[arg-type]
    live._price_loaded = True
    live.price = _price(ctx.disclosure.ticker)
    live.studies["E3"] = _scoped(n, ctx.disclosure.ticker)
    return live


def test_ground_materiality_overwrites_numbers_and_drops_uncited() -> None:
    out = {
        **RECORDED["materiality"],
        "secondary": [
            {"name": "adv20", "value": 1.0, "ref_id": "feat:ORNEK:adv20_try"},
            {"name": "made_up", "value": 9e9, "ref_id": "px:ORNEK:imaginary"},
        ],
        "fx_rates": [{"name": "fx_usd", "value": 41.0, "ref_id": "fx:USD"}],
    }
    facts = {"last_close_try": 50.25, "market_cap_try": 6e9, "adv20_try": 3e7, "paid_in_capital_try": 1.2e8}
    allowed = {f"feat:ORNEK:{k}": v for k, v in facts.items()}
    got = ground_materiality(out, "E3", "ORNEK", facts, allowed)
    # E3 wants annual revenue, which the tools do not have → no denominator, the code falls back to mcap
    assert (got["denominator_kind"], got["denominator"], got["revenue_available_at_as_of"]) == ("none", None, False)
    assert got["market_cap"] == {"name": "market_cap", "value": 6e9, "ref_id": "feat:ORNEK:market_cap_try"}
    assert got["trade_day_close"]["value"] == 50.25
    assert got["secondary"] == [{"name": "adv20", "value": 3e7, "ref_id": "feat:ORNEK:adv20_try"}]
    assert got["fx_rates"] == [] and got["financials_period_end"] is None
    assert {"annual_revenue_try", "uncited:made_up", "uncited:fx_usd"} <= set(got["data_gaps"])
    e1 = ground_materiality(out, "E1", "ORNEK", facts, allowed)
    assert e1["denominator_kind"] == "paid_in_capital" and e1["denominator"]["value"] == 1.2e8
    e4 = ground_materiality({**out, "event_type": "E4"}, "E4", "ORNEK", {}, {})
    assert e4["denominator_kind"] == "none" and e4["market_cap"] is None and e4["trade_day_close"] is None


def test_ground_selection_keeps_only_offered_events() -> None:
    store = evidence_store(_scoped(3))
    assert store is not None
    first = store["events"][0]["ref_id"]
    out = {
        **RECORDED["evidence_card"]["selection"],
        "selected": [
            {"ref_id": first, "relevance": "high", "why_similar_tr": "aynı tür"},
            {"ref_id": "evt:E3-2019-0100", "relevance": "high", "why_similar_tr": "uydurma"},
        ],
        "proposed_strength": "strong",
        "already_announced_ref": "evt:nowhere",
    }
    got = ground_selection(out, store, store["events"][0]["ticker"])
    assert [s["ref_id"] for s in got["selected"]] == [first]
    assert got["candidates_considered"] == 3 and got["same_ticker_selected"] == 1
    assert got["proposed_strength"] == "insufficient"  # capped by n = 3
    assert "uncited_ids:1" in got["exclusion_reasons"] and got["already_announced_ref"] is None
    assert ground_selection(out, None, "TSTA")["selected"] == []


def test_toolbox_for_gates_on_live_mode_and_real_disclosures() -> None:
    ctx = context_for(RUN)
    base = ReplayToolbox()
    assert toolbox_for(None, ctx.disclosure, "replay", base) is base  # type: ignore[arg-type]
    assert toolbox_for(None, ctx.disclosure, "live", base) is base  # type: ignore[arg-type]  # demo fixture
    real = replace(ctx.disclosure, is_fixture=False)
    live = toolbox_for(None, real, "live", base)  # type: ignore[arg-type]
    assert isinstance(live, LiveToolbox) and live_tools(live) is live and live_tools(base) is None
    assert isinstance(toolbox_for(None, ctx.disclosure, "replay"), ReplayToolbox)  # type: ignore[arg-type]


def test_live_toolbox_delegates_what_it_does_not_compute() -> None:
    ctx = context_for(RUN)
    live = _prepared(ctx)
    fp, other = ctx.disclosure.fingerprint, context_for("run-day-e1-krgcl").disclosure.fingerprint
    base = ReplayToolbox()
    assert live.sizing(fp) == base.sizing(fp) and live.sub_type_label(fp) == base.sub_type_label(fp)
    assert live.source_phrases(fp) == base.source_phrases(fp) and live.run_usage(fp) == base.run_usage(fp)
    assert live.node_latency_ms(fp, "merge") == base.node_latency_ms(fp, "merge")
    assert live.features(other) == base.features(other) and live.evidence_store(other) == base.evidence_store(other)
    assert live.features(fp) == {"leakage_5d_mkt_adj": 0.0123, "ret_10d_mkt_adj": -0.004, "ret_3m": None}
    view = live.prompt_view()
    facts = view.features(fp)
    assert facts is not None and facts["market_cap_try"] == 6e9 and facts["vol_20d"] == 0.021
    assert view.features(other) == base.features(other) and view.evidence_store(fp) == live.evidence_store(fp)
    assert view.sizing(fp) == live.sizing(fp) and view.sub_type_label(fp) == live.sub_type_label(fp)
    assert view.source_phrases(fp) == live.source_phrases(fp) and view.run_usage(fp) == live.run_usage(fp)
    assert view.node_latency_ms(fp, "merge") == live.node_latency_ms(fp, "merge")
    assert live.study is None  # nothing prepared for an event type yet
    empty = LiveToolbox(None, ctx.disclosure)  # type: ignore[arg-type]
    assert empty.market_facts() == {} and empty.features(fp) == {} and empty.evidence_store(fp) is None


async def test_live_graph_takes_every_evidence_number_from_the_tools() -> None:
    ctx = context_for(RUN)
    live = _prepared(ctx)
    state = await run_graph(replace(ctx, tools=live), "evidence-live-e3")
    mat = state["materiality"]
    assert mat is not None
    # the recorded answer cited fin:ORNEK:2026-Q3 / px:ORNEK:mcap: never offered → replaced by tool facts
    assert mat["denominator_kind"] == "none" and mat["market_cap"]["value"] == 6e9
    assert mat["trade_day_close"] == {"name": "close_prev", "value": 50.25, "ref_id": "feat:ORNEK:last_close_try"}
    card, merged = state["evidence_card"], state["merged"]
    assert card is not None and merged is not None
    store = live.evidence_store(ctx.disclosure.fingerprint)
    assert store is not None
    assert card["stats"] == store["stats"] and card["strength"] == "weak"  # n = 6
    assert card["selection"]["selected"] == []  # the recorded ids are not among the offered events
    assert state["evidence_events"] == store["events"]
    assert (merged["evidence_n"], merged["evidence_median_car_5d"]) == (6, 0.055)
    assert merged["leakage_5d_mkt_adj"] == 0.0123 and merged["last_price"] == 50.25
    assert merged["amount_to_mcap"] == pytest.approx(432_000_000 / 6e9)  # Decimal in merge, over the tool mcap
    assert merged["e3_denominator"] == "market_cap"


async def test_prepare_failure_is_unknown_not_a_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Info:
        transaction_status = 0  # psycopg TransactionStatus.IDLE

    class _Conn:
        info = _Info()
        rollbacks = 0

        async def rollback(self) -> None:
            self.rollbacks += 1

    async def boom(*_a: Any, **_k: Any) -> Any:
        raise RuntimeError("db down")

    monkeypatch.setattr("kaptan.evidence.toolbox.load_price_context", boom)
    monkeypatch.setattr("kaptan.evidence.toolbox.scoped_study", boom)
    ctx = context_for(RUN)
    conn = _Conn()
    live = LiveToolbox(conn, ctx.disclosure)  # type: ignore[arg-type]
    await live.prepare("E3")
    await live.prepare("E3")  # idempotent: no second attempt
    await live.prepare("IGNORE")  # not an event type: price context only
    assert live.price is None and live.studies == {"E3": None} and conn.rollbacks == 2
    assert live.evidence_store(ctx.disclosure.fingerprint) is None
    assert live.features(ctx.disclosure.fingerprint) == {}
