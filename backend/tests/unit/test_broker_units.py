"""Broker layer, pure parts (M3 A3): ticks and price limits, the commission estimate,
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
    commission_of,
)
from kaptan.brokers.guarded import GuardedBroker
from kaptan.brokers.ticket import OrderTicketBroker

D = Decimal
COSTS = Costs()


def test_commission_includes_fees_and_bsmv_is_on_the_broker_part() -> None:
    commission, bsmv = commission_of(D(100_000), COSTS)
    assert commission == D("52.54")  # 50 + 2.54 exchange/Takasbank
    assert bsmv == D("2.50")


def test_parse_trading_limit_table() -> None:
    cfg = parse_trading({"costs": {"price_limit_pct_by_market": {"Ana": 0.12}, "price_limit_pct_fallback": 0.05}})
    assert cfg.costs.limit_pct("ana") == D("0.12")
    assert cfg.costs.limit_pct("yildiz") == D("0.05")  # not in the configured table → fallback
    assert parse_trading({}).costs.limit_pct("yildiz") == D("0.20")
    with pytest.raises(ValueError, match="price_limit_pct_by_market"):
        parse_trading({"costs": {"price_limit_pct_by_market": [0.1]}})


def test_parse_trading_and_the_repo_file(tmp_path: Path) -> None:
    cfg = parse_trading({"mode": "live", "costs": {"c_broker": 0.002}, "hard_cap_try": 50_000})
    assert (cfg.mode, cfg.costs.c_broker, cfg.hard_cap_try) == ("live", D("0.002"), D(50_000))
    assert parse_trading({}).mode == "paper"
    with pytest.raises(ValueError, match="mode"):
        parse_trading({"mode": "yolo"})
    repo = bc.load_trading()
    assert repo.mode == "paper" and repo.costs == Costs() and repo.hard_cap_try is None
    assert dict(repo.costs.price_limit_pct_by_market) == dict(Costs().price_limit_pct_by_market)  # yaml = code
    assert bc.load_trading(tmp_path / "missing.yaml") == TradingConfig()


def test_install_current_and_reset() -> None:
    bc.reset()
    try:
        cfg = bc.install(ExecConfig())
        assert bc.current() is cfg
        assert bc.with_overrides(live_env_enabled=True).live_env_enabled is True
        assert bc.current().live_env_enabled is False
    finally:
        bc.reset()


def test_from_settings_reads_the_new_settings() -> None:
    from kaptan.settings import get_settings

    s = get_settings().model_copy(update={"kaptan_live_enabled": True})
    cfg = bc.from_settings(s)
    assert cfg.live_env_enabled is True
    assert cfg.live_requested is cfg.mode_live


NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)  # 13:40 Istanbul


def _state(ui: bool, expires: datetime | None = None) -> live_arm.LiveState:
    return live_arm.LiveState(False, False, ui, False, expires, None, None)


def test_missing_keys_in_order_and_real_broker_always_missing() -> None:
    cfg = ExecConfig()
    assert live_arm.missing_keys(cfg, _state(False), NOW) == [
        "config",
        "env",
        "ui_armed",
        "real_broker",
    ]
    live = ExecConfig(trading=TradingConfig(mode="live"), live_env_enabled=True)
    armed = _state(True, live_arm.arm_expiry(NOW))
    assert live_arm.missing_keys(live, armed, NOW) == ["real_broker"]
    assert live_arm.arm_expiry(NOW) == datetime(2027, 1, 11, 15, 30, tzinfo=UTC)
    late = datetime(2027, 1, 11, 16, 0, tzinfo=UTC)
    assert not armed.ui_armed(late)  # dropped at 18:30 Istanbul
    view = live_arm.view(live, armed, NOW)
    assert (view["armed"], view["effective_mode"], view["missing"]) == (False, "paper", ["real_broker"])
    assert view["expires_at"] == "2027-01-11T15:30:00.000Z"


def test_adapters_satisfy_the_broker_protocol() -> None:
    conn: object = object()
    ticket = OrderTicketBroker(conn, NOW, ExecConfig())  # type: ignore[arg-type]
    guarded = GuardedBroker(ticket, conn, NOW, ExecConfig())  # type: ignore[arg-type]
    for broker in (ticket, guarded):
        assert isinstance(broker, Broker)
    assert (guarded.name, guarded.mode) == ("guarded:order_ticket", ticket.mode)
    assert OrderRefused("hard_cap", "x").code == "hard_cap"
    intent = OrderIntent("c", "KRGCL", "buy", "limit", "opg", 10, D("2.5"))
    assert intent.notional == D(25)
    assert OrderIntent("c", "KRGCL", "buy", "market", "day", 10).notional == 0
