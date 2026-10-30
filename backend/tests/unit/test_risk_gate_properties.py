"""Property tests of the risk gate (06 §10.1, 05 §5.1, US-19/20, T-53) over seeded random orders and desks
(no hypothesis dependency; 2 000 cases, reproducible):

- monotone: the final quantity never exceeds the requested one;
- a pass/resize verdict always ends with R15 (a human approves), a reject/hold has qty 0;
- deterministic: the same input gives the same verdict;
- a SELL is never stopped by R01, R02, R04, R08, R10 or R13 (exits are never blocked by entry rules).
"""

from __future__ import annotations

import random
from dataclasses import replace
from decimal import Decimal

from kaptan.risk.gate import GateContext, GateOrder, evaluate

N_CASES = 2_000
ENTRY_ONLY = ("R01", "R02", "R04", "R08", "R10", "R13")


def _case(rng: random.Random) -> tuple[GateOrder, GateContext]:
    last = Decimal(str(round(rng.uniform(2, 400), 2)))
    side = rng.choice(("buy", "sell"))
    limit = (last * Decimal(str(round(rng.uniform(0.88, 1.03), 4)))).quantize(Decimal("0.01"))
    ids = tuple(f"e{i}" for i in range(rng.randint(0, 12)))
    amount = Decimal(rng.randint(1, 10**9))
    order = GateOrder(
        ticker="TSTAA",
        event_type=rng.choice(("E1", "E2", "E3", "E4")),
        qty=rng.randint(1, 50_000),
        limit_price=max(limit, Decimal("0.01")),
        stop_pct=Decimal(str(round(rng.uniform(0, 0.15), 4))),
        side=side,  # type: ignore[arg-type]
        reader_amount=rng.choice((None, amount)),
        regex_amounts=rng.choice(((), (amount,), (amount * 10,))),
        evidence_ids=ids,
        retrieved_ids=ids + rng.choice(((), ("x",))),
        expected_edge_bps=Decimal(rng.randint(0, 200)),
        est_cost_bps=Decimal(rng.randint(0, 80)),
        escalate_required=rng.random() < 0.2,
        degraded=rng.random() < 0.1,
        regime_applied=rng.random() < 0.3,
        cost_side=Decimal(str(round(rng.uniform(0, 0.004), 5))),
    )
    equity = Decimal(rng.randint(50_000, 5_000_000))
    held = rng.randint(0, 60_000)
    ctx = GateContext(
        equity_try=equity,
        last_price=last,
        adv20_try=Decimal(rng.randint(100_000, 500_000_000)),
        cash_free_try=equity * Decimal(str(round(rng.uniform(0, 1), 3))),
        upper_limit=(last * Decimal("1.1")).quantize(Decimal("0.01")),
        lower_limit=(last * Decimal("0.9")).quantize(Decimal("0.01")),
        kill_switch_on=rng.random() < 0.2,
        drawdown_pct=Decimal(str(round(rng.uniform(-0.08, 0), 4))),
        daily_pnl_pct=Decimal(str(round(rng.uniform(-0.03, 0.02), 4))),
        halted_today=rng.random() < 0.2,
        restrictions=rng.choice(((), ("spk_tedbir",), ("vbts_brut_takas", "team_insider"))),
        restrictions_age_h=rng.choice((1.0, 30.0)),
        team_blocklisted=rng.random() < 0.2,
        n_open_positions=rng.randint(0, 10),
        holds_ticker=side == "sell" or rng.random() < 0.2,
        held_qty=held if side == "sell" else None,
        daily_entries=rng.randint(0, 3),
        in_cooldown=rng.random() < 0.1,
        reset_active=rng.random() < 0.1,
        sector_exposure_pct=Decimal(str(round(rng.uniform(0, 0.3), 3))),
        group_exposure_pct=Decimal(str(round(rng.uniform(0, 0.25), 3))),
        gross_exposure_pct=Decimal(str(round(rng.uniform(0, 1.1), 3))),
        regime=rng.choice(("normal", "crisis")),
        compliance_decision=rng.choice(("pass", "escalate")),
    )
    return order, ctx


def _healthy(order: GateOrder, ctx: GateContext) -> tuple[GateOrder, GateContext]:
    """Half the cases clear the hard stops, so the resize and pass paths are exercised too."""
    ids = tuple(f"e{i}" for i in range(8))
    amount = Decimal(1_000_000)
    o = replace(order, reader_amount=amount, regex_amounts=(amount,), evidence_ids=ids, retrieved_ids=ids,
                expected_edge_bps=Decimal(100), est_cost_bps=Decimal(30), limit_price=ctx.last_price)  # fmt: skip
    c = replace(ctx, kill_switch_on=False, drawdown_pct=Decimal(0), halted_today=False, daily_pnl_pct=Decimal(0),
                restrictions=(), restrictions_age_h=1.0, team_blocklisted=False, in_cooldown=False,
                holds_ticker=order.side == "sell", n_open_positions=2, daily_entries=0,
                gross_exposure_pct=Decimal("0.3"))  # fmt: skip
    return o, c


def test_gate_properties() -> None:
    rng = random.Random(429)  # noqa: S311 - reproducible test data
    seen = {"pass": 0, "resize": 0, "reject": 0, "hold": 0}
    for i in range(N_CASES):
        order, ctx = _case(rng)
        if i % 2:
            order, ctx = _healthy(order, ctx)
        verdict = evaluate(order, ctx)
        seen[verdict.verdict] += 1
        assert 0 <= verdict.final_qty <= order.qty  # monotone
        assert evaluate(order, ctx) == verdict  # deterministic
        if verdict.approved:
            assert verdict.results[-1].rule_code == "R15"
            assert verdict.final_qty > 0
        else:
            assert verdict.final_qty == 0
        if order.side == "sell":
            stops = [r.rule_code for r in verdict.results if r.outcome in ("reject", "hold", "resize")]
            assert not set(stops) & set(ENTRY_ONLY), (order, ctx, stops)
    assert seen["pass"] and seen["resize"] and seen["reject"], seen  # the generator reaches every path
