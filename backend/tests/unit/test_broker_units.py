"""Broker layer, pure parts (M3 A3): ticks and price limits, the 06 §8 cost model, the fill decision,
trading.yaml parsing, the three live keys and the Broker protocol."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from kaptan.brokers import config as bc
from kaptan.brokers import live_arm
from kaptan.brokers.base import Broker, OrderIntent, OrderRefused
from kaptan.brokers.config import Costs, ExecConfig, TradingConfig, parse_trading
from kaptan.brokers.costs import (
    FillQuote,
    Liquidity,
    Miss,
    commission_of,
    corwin_schultz,
    daily_sigma,
    decide_fill,
    limit_down,
    limit_up,
    slippage,
    tick_size,
)
from kaptan.brokers.guarded import GuardedBroker
from kaptan.brokers.simbist import SimBistBroker, paper_order
from kaptan.brokers.ticket import OrderTicketBroker

D = Decimal
COSTS = Costs()


@pytest.mark.parametrize(
    ("price", "tick"),
    [(D("19.99"), D("0.01")), (D(20), D("0.02")), (D("99.9"), D("0.05")), (D(300), D("0.25")), (D(3000), D("2.50"))],
)
def test_tick_table(price: Decimal, tick: Decimal) -> None:
    assert tick_size(price) == tick


def test_price_limits_round_inside_the_band() -> None:
    assert limit_up(D("33.48"), D("0.10")) == D("36.82")  # 36.828 → down to the 0.02 tick
    assert limit_down(D("33.48"), D("0.10")) == D("30.14")  # 30.132 → up to the tick
    assert limit_down(D("10.01"), D("0.10")) == D("9.01")


def test_corwin_schultz_and_sigma() -> None:
    assert corwin_schultz([(D(11), D(10))]) is None
    flat = corwin_schultz([(D(11), D(10)), (D(11), D(10)), (D(11), D(10))])
    assert flat is not None and 0 < flat < 0.2
    assert corwin_schultz([(D(11), D(10)), (D(0), D(0))]) is None  # bad bar skipped
    assert daily_sigma([D(10), D(11)]) is None
    sigma = daily_sigma([D(10), D(11), D(10), D(11)])
    assert sigma is not None and sigma > 0


def test_slippage_floor_spread_and_impact() -> None:
    assert slippage(100, Liquidity(half_spread=0.0, sigma_daily=None, adv20_shares=None), COSTS) == D("0.0005")
    assert slippage(100, Liquidity(), COSTS) == COSTS.default_half_spread  # unknown spread: the default
    with_impact = slippage(10_000, Liquidity(half_spread=0.001, sigma_daily=0.02, adv20_shares=1_000_000), COSTS)
    assert with_impact == pytest.approx(D("0.001") + D("0.7") * D("0.02") * D("0.1"), rel=D("1e-9"))


def test_commission_includes_fees_and_bsmv_is_on_the_broker_part() -> None:
    commission, bsmv = commission_of(D(100_000), COSTS)
    assert commission == D("52.54")  # 50 + 2.54 exchange/Takasbank
    assert bsmv == D("2.50")


def _fill(**kw: object) -> FillQuote | Miss:
    args: dict[str, object] = {
        "side": "buy",
        "qty": 100,
        "limit": D("34.15"),
        "observed": D("33.90"),
        "prev_close": D("33.48"),
        "liq": Liquidity(half_spread=0.0005, sigma_daily=None, adv20_shares=None),
        "costs": COSTS,
        "at_open": True,
    }
    args.update(kw)
    return decide_fill(**args)  # type: ignore[arg-type]


def test_buy_fills_at_open_plus_slippage_never_above_the_limit() -> None:
    quote = _fill()
    assert isinstance(quote, FillQuote)
    assert quote.price == D("33.92")  # 33.90 × 1.0005
    assert quote.slippage_bps == D("5.90")
    capped = _fill(observed=D("34.14"), liq=Liquidity(half_spread=0.01))
    assert isinstance(capped, FillQuote) and capped.price == D("34.15")


def test_misses_open_above_limit_tavan_taban_and_no_price() -> None:
    assert _fill(observed=D("34.20")) == Miss("open_above_limit")
    assert _fill(observed=D("36.82"), limit=D("40")) == Miss("limit_up_open")
    assert _fill(observed=None) == Miss("no_price")
    sell = {"side": "sell", "limit": D("30.14")}
    assert _fill(observed=D("30.14"), **sell) == Miss("limit_down_open")
    assert _fill(observed=D("30.00"), at_open=False, **sell) == Miss("open_below_limit")
    quote = _fill(observed=D("31.00"), **sell)
    assert isinstance(quote, FillQuote) and quote.price == D("30.98")  # 31 × (1 − 0.0005)
    intraday = _fill(observed=D("36.90"), limit=D("40"), at_open=False)
    assert isinstance(intraday, FillQuote)  # the tavan check is the opening auction's


def test_parse_trading_and_the_repo_file(tmp_path: Path) -> None:
    cfg = parse_trading({"mode": "live", "costs": {"c_broker": 0.002}, "hard_cap_try": 50_000})
    assert (cfg.mode, cfg.costs.c_broker, cfg.hard_cap_try) == ("live", D("0.002"), D(50_000))
    assert parse_trading({}).mode == "paper"
    with pytest.raises(ValueError, match="mode"):
        parse_trading({"mode": "yolo"})
    repo = bc.load_trading()
    assert repo.mode == "paper" and repo.costs == Costs() and repo.hard_cap_try is None
    assert bc.load_trading(tmp_path / "missing.yaml") == TradingConfig()


def test_install_current_and_reset() -> None:
    bc.reset()
    assert bc.current().demo_mode is True  # without the app: demo behaviour
    try:
        cfg = bc.install(ExecConfig(demo_mode=False))
        assert bc.current() is cfg
        assert bc.with_overrides(live_env_enabled=True).live_env_enabled is True
        assert bc.current().live_env_enabled is False
    finally:
        bc.reset()


def test_from_settings_reads_the_new_settings() -> None:
    from kaptan.settings import get_settings

    s = get_settings().model_copy(update={"personal_account_try": 500_000.0, "kaptan_live_enabled": True})
    cfg = bc.from_settings(s)
    assert (cfg.personal_account_try, cfg.live_env_enabled) == (D(500_000), True)
    assert cfg.live_requested is cfg.mode_live


NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)  # 13:40 Istanbul


def _state(ui: bool, expires: datetime | None = None) -> live_arm.LiveState:
    return live_arm.LiveState(False, False, ui, False, expires, None, None)


def test_missing_keys_in_order_and_real_broker_always_missing() -> None:
    cfg = ExecConfig()
    assert live_arm.missing_keys(cfg, _state(False), NOW, kill=True) == [
        "config",
        "env",
        "ui_armed",
        "kill_switch_off",
        "real_broker",
    ]
    live = ExecConfig(trading=TradingConfig(mode="live"), live_env_enabled=True)
    armed = _state(True, live_arm.arm_expiry(NOW))
    assert live_arm.missing_keys(live, armed, NOW, kill=False) == ["real_broker"]
    assert live_arm.arm_expiry(NOW) == datetime(2027, 1, 11, 15, 30, tzinfo=UTC)
    late = datetime(2027, 1, 11, 16, 0, tzinfo=UTC)
    assert not armed.ui_armed(late)  # dropped at 18:30 Istanbul
    view = live_arm.view(live, armed, NOW, kill=False)
    assert (view["armed"], view["effective_mode"], view["missing"]) == (False, "paper", ["real_broker"])
    assert view["expires_at"] == "2027-01-11T15:30:00.000Z"


def test_adapters_satisfy_the_broker_protocol() -> None:
    conn: object = object()
    sim = SimBistBroker(conn, NOW)  # type: ignore[arg-type]
    ticket = OrderTicketBroker(conn, NOW, ExecConfig())  # type: ignore[arg-type]
    guarded = GuardedBroker(sim, conn, NOW, ExecConfig())  # type: ignore[arg-type]
    for broker in (sim, ticket, guarded):
        assert isinstance(broker, Broker)
    assert (guarded.name, guarded.mode) == ("guarded:simbist", sim.mode)
    assert OrderRefused("hard_cap", "x").code == "hard_cap"
    intent = OrderIntent("c", "KRGCL", "buy", "limit", "opg", 10, D("2.5"))
    assert intent.notional == D(25)
    assert OrderIntent("c", "KRGCL", "buy", "market", "day", 10).notional == 0


def test_paper_order_for_a_sell_never_exceeds_the_holding() -> None:
    card = {
        "run_id": "run-exit-x2-day-e1-krgcl-20270113",
        "proposal_id": "prop-exit-x2-day-e1-krgcl-20270113",
        "ticker": "KRGCL",
        "company_name": "KORU",
        "side": "sell",
        "entry": "next_open_auction",
        "approved_notional_try": None,
        "limit_price": 30.14,
        "qty": 1500,
        "is_fixture": False,
    }
    order = paper_order(card, NOW, held_qty=1480)
    assert (order["side"], order["qty"], order["tif"], order["status"]) == ("sell", 1480, "opg", "pending_open")
    assert order["id"] == "ord-s-exit-x2-day-e1-krgcl-20270113"
