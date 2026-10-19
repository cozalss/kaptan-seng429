"""Active limits → GateLimits (FR-33) and R07's tolerance as a limit key."""

from __future__ import annotations

from decimal import Decimal

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
        "daily_loss_halt_pct": -0.01,
        "kill_drawdown_pct": -0.05,
        "min_edge_cost_ratio": 2,
        "crisis_exposure_mult": 0.5,
        "max_sector_pct": 0.25,
        "max_group_pct": 0.2,
    }
    assert to_gate_limits(v1) == GateLimits()


def test_risk_tolerance_is_a_limit_key_with_default_1_05() -> None:
    assert GateLimits().risk_tolerance == Decimal("1.05")
    order = GateOrder(ticker="ABCDE", event_type="E1", qty=10_000, limit_price=Decimal(40), stop_pct=Decimal("0.0875"))
    ctx = GateContext(
        equity_try=Decimal(1_000_000), last_price=Decimal(40), adv20_try=Decimal(10**9), cash_free_try=Decimal(10**7)
    )
    default = r07(order, ctx, GateLimits(), "pre_trade")
    strict = r07(order, ctx, to_gate_limits({"risk_tolerance": 1.0}), "pre_trade")
    assert default.new_qty == 1500  # 1 000 000 × 0.005 × 1.05 / (40 × 0.0875)
    assert strict.new_qty == 1428
