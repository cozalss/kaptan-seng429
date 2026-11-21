"""Active limits → GateLimits (FR-33) and R07's hard per-trade risk ceiling."""

from __future__ import annotations

from decimal import Decimal

import pytest

from kaptan.risk.active_limits import to_gate_limits
from kaptan.risk.gate import GateContext, GateLimits, GateOrder, r07


def test_known_keys_override_and_keep_their_types() -> None:
    lim = to_gate_limits({"max_position_pct": 0.08, "max_concurrent_positions": 7.0, "leak_ret5d_threshold": 0.08})
    assert lim.max_position_pct == Decimal("0.08")
    assert lim.max_concurrent_positions == 7 and isinstance(lim.max_concurrent_positions, int)
    assert lim.risk_per_trade_pct == GateLimits().risk_per_trade_pct  # untouched default


def test_the_canonical_v1_values_are_the_defaults() -> None:
    v1 = {
        "risk_per_trade_pct": 0.005,
        "max_position_pct": 0.1,
        "max_concurrent_positions": 10,
        "target_concurrent_positions": 8,
        "max_adv_share": 0.01,
        "price_band_pct": 0.02,
        "min_edge_cost_ratio": 2,
        "crisis_exposure_mult": 0.5,
        "max_sector_pct": 0.25,
        "max_group_pct": 0.2,
    }
    assert to_gate_limits(v1) == GateLimits()


def test_a_stored_risk_tolerance_key_is_ignored() -> None:
    assert to_gate_limits({"risk_tolerance": 1.05}) == GateLimits()


@pytest.mark.parametrize(
    ("equity", "price", "stop"),
    [
        (1_000_000, "40", "0.0875"),
        (1_016_480, "48.35", "0.087"),
        (1_000_000, "73.4", "0.0813"),
        (250_000, "12.37", "0.061"),
    ],
)
def test_r07_planned_loss_never_exceeds_the_per_trade_limit(equity: int, price: str, stop: str) -> None:
    limit_try = Decimal(equity) * GateLimits().risk_per_trade_pct
    order = GateOrder(ticker="ABCDE", event_type="E1", qty=100_000, limit_price=Decimal(price), stop_pct=Decimal(stop))
    ctx = GateContext(
        equity_try=Decimal(equity), last_price=Decimal(price), adv20_try=Decimal(10**12), cash_free_try=Decimal(10**9)
    )
    res = r07(order, ctx, GateLimits(), "pre_trade")
    qty = res.new_qty
    assert qty is not None and qty > 0
    assert qty * order.limit_price * order.stop_pct <= limit_try
    assert (qty + 1) * order.limit_price * order.stop_pct > limit_try  # rounded DOWN, and only as far as needed


def test_r07_known_case_is_1428_lots() -> None:
    order = GateOrder(ticker="ABCDE", event_type="E1", qty=10_000, limit_price=Decimal(40), stop_pct=Decimal("0.0875"))
    ctx = GateContext(
        equity_try=Decimal(1_000_000), last_price=Decimal(40), adv20_try=Decimal(10**9), cash_free_try=Decimal(10**7)
    )
    assert r07(order, ctx, GateLimits(), "pre_trade").new_qty == 1428  # 5 000 / (40 × 0.0875)
