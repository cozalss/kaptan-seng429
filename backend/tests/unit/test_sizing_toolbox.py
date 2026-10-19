"""The live sizer and merge inputs behind `LiveToolbox` (no Postgres): failures are unknown, never a
fixture answer; the live merge converts a USD amount at the TCMB rate and puts limits on the tick grid."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from decimal import Decimal
from typing import Any

from kaptan.agents.nodes.merge import build_features
from kaptan.agents.tools import ReplayToolbox
from kaptan.evidence import LiveToolbox
from kaptan.market.features import MergeInputs
from tests.unit.agent_fixtures import context_for
from tests.unit.test_evidence_live_nodes import _price

RUN = "run-demo-e3-ornek"


class _Info:
    transaction_status = 0  # psycopg TransactionStatus.IDLE


class _BrokenConn:
    info = _Info()

    async def rollback(self) -> None:
        return None

    def cursor(self, **_: Any) -> Any:
        raise RuntimeError("db down")


async def test_failed_live_sizing_is_unknown_not_the_fixture() -> None:
    ctx = context_for(RUN)
    live = LiveToolbox(_BrokenConn(), replace(ctx.disclosure, is_fixture=False), ReplayToolbox())  # type: ignore[arg-type]
    fp = live.fp
    assert live.sizing(fp) == ReplayToolbox().sizing(fp)  # not tried yet: the base answers (unit tests, resumes)
    t_dec = ctx.disclosure.available_at + timedelta(seconds=5)
    plan = await live.prepare_sizing("E3", equity_try=Decimal(1_000_000), upper_limit=None, t_dec=t_dec, personal=False)
    assert plan is None and live.sizing(fp) is None  # tried and failed → None (the rule engine HOLDs)
    again = await live.prepare_sizing("E3", equity_try=Decimal(1), upper_limit=None, t_dec=t_dec, personal=False)
    assert again is None  # once per decision
    assert await live.prepare_merge("E1", None) == MergeInputs()  # unknown history, no crash
    assert live.merge_inputs == MergeInputs()


def _e3_state(reader: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": "E3",
        "route": {"sub_type_hint": "sözleşme"},
        "classifier": {"sub_type": "sözleşme", "confidence": 0.95},
        "reader": {
            "kind": "E3",
            "duration_months": None,
            "binding_status": "signed_contract",
            "related_party": False,
            "is_renewal_or_extension": False,
            **reader,
        },
        "materiality": {"denominator_kind": "none", "market_cap": {"value": 6e9}, "trade_day_close": {"value": 47.4}},
    }


def _live_ctx(text: str) -> Any:
    ctx = context_for(RUN)
    disclosure = replace(ctx.disclosure, is_fixture=False, text_tr=text)
    live = LiveToolbox(None, disclosure, ReplayToolbox())  # type: ignore[arg-type]
    live.price = _price("ORNEK")
    return replace(ctx, disclosure=disclosure, tools=live)


def test_live_merge_converts_a_usd_amount_and_uses_the_tick_grid() -> None:
    ctx = _live_ctx("Şirketimiz 12.000.000 USD tutarında bir sözleşme imzalamıştır.")
    state = _e3_state({"amount": 12_000_000, "currency": "USD", "amount_try_stated": None})
    usd = MergeInputs(currency="USD", fx_rate=Decimal("41.80"))
    m = build_features(state, ctx, None, usd)  # type: ignore[arg-type]
    assert (m["lower_limit"], m["upper_limit"]) == (42.66, 52.1)  # replay would say 42.66 / 52.14
    assert m["reader_amount"] == 12_000_000 and m["amount_in_text"] is True  # R14 on the USD figure
    assert m["amount_try"] == 501_600_000 and m["amount_to_mcap"] == 501_600_000 / 6e9
    assert m["e3_denominator"] == "market_cap"
    unknown = build_features(state, ctx, None, MergeInputs(currency="USD"))  # type: ignore[arg-type]
    assert unknown["amount_try"] is None and unknown["amount_to_mcap"] is None and unknown["e3_denominator"] is None
    replay = build_features(state, replace(ctx, tools=ReplayToolbox()), None, usd)  # type: ignore[arg-type]
    assert replay["upper_limit"] == 52.14  # replay path untouched even if inputs are passed


def test_live_merge_e1_reads_the_capital_from_the_price_context() -> None:
    ctx = _live_ctx("Geri alım bildirimi.")
    state = {
        "event_type": "E1",
        "route": {"sub_type_hint": "geri alım"},
        "classifier": {"sub_type": "geri alım"},
        "reader": {
            "kind": "E1",
            "nature": "execution",
            "cumulative_nominal_tl": 600_000,
            "transactions": [{"trade_date": "2027-01-11", "nominal_tl": 600_000, "price_tl": 47.0}],
        },
        "materiality": {"trade_day_close": {"value": 47.4}},
    }
    m = build_features(state, ctx, None, MergeInputs())  # type: ignore[arg-type]
    # capital 120 m (price context) → 600 000 / 120 m; the notice is the only one of its window
    assert m["buyback_10d_capital_pct"] == 0.005 and m["buyback_10d_notice_count"] == 1
    assert m["new_buyback_rows"] == 1 and m["buyback_sale_within_20d"] is False and m["e1_nature"] == "execution"
