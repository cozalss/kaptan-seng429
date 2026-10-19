"""The live desk's pure parts: book arithmetic, exposures, the post-reset drawdown, session clock,
the personal-mode restart rule and the gate fields a real run adds."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from kaptan.agents.context import DeskState
from kaptan.agents.nodes.decide import live_gate_fields
from kaptan.demo.fixtures import DemoFixtures
from kaptan.risk.book import BookSnapshot, Exposure, Holding, effective_drawdown
from kaptan.risk.desk import exposure_pct, is_session_open, istanbul_day_bounds
from kaptan.risk.kill_switch import personal_reset_allowed

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)  # Tuesday 12:00 Istanbul


def _book(cash: str, holdings: tuple[Holding, ...] = (), pending: tuple[Exposure, ...] = (), **kw: Any) -> BookSnapshot:
    base: dict[str, Any] = {"day_start_equity": Decimal(1_000_000), "prior_peak": Decimal(1_050_000)}
    return BookSnapshot(
        as_of=NOW,
        capital=Decimal(1_000_000),
        cash=Decimal(cash),
        reserved=sum((p.value for p in pending), Decimal(0)),
        holdings=holdings,
        pending=pending,
        **{**base, **kw},
    )


def _h(ticker: str, qty: int, mark: str, sector: str | None, group: str | None = None) -> Holding:
    return Holding(ticker, qty, Decimal(mark), None, sector, group)


def test_book_equity_cash_peak_and_drawdown() -> None:
    book = _book("900000", (_h("AAAAA", 1000, "50", "banka"),), (Exposure("BBBBB", Decimal(20_000), "banka", None),))
    assert book.market_value == Decimal(50_000)
    assert book.equity == Decimal(950_000)
    assert book.free_cash == Decimal(880_000)  # equity − open notional − reserved
    assert book.peak_equity == Decimal(1_050_000)
    assert book.daily_pnl_pct == Decimal("-0.05")
    assert book.drawdown_pct == Decimal(950_000) / Decimal(1_050_000) - 1
    up = _book("1100000")
    assert up.peak_equity == Decimal(1_100_000) and up.drawdown_pct == 0


def test_exposures_unknown_group_counts_the_sector_unknown_sector_the_book() -> None:
    held = (_h("AAAAA", 1000, "100", "banka", "Koç"), _h("CCCCC", 1000, "50", "enerji"))
    book = _book("850000", held, (Exposure("BBBBB", Decimal(25_000), "banka", None),))
    eq = book.equity
    assert exposure_pct(book, "banka", "Koç") == (Decimal(125_000) / eq, Decimal(100_000) / eq)
    assert exposure_pct(book, "banka", None) == (Decimal(125_000) / eq, Decimal(125_000) / eq)
    assert exposure_pct(book, None, None) == (Decimal(175_000) / eq, Decimal(175_000) / eq)
    broke = _book("-10", ())
    assert exposure_pct(broke, "banka", "Koç") == (Decimal(1), Decimal(1))


def test_effective_drawdown_after_a_restart() -> None:
    book = _book("990000", prior_peak=Decimal(1_050_000))  # real drawdown −5.7 %
    assert effective_drawdown(book, None, reset_active=False) == book.drawdown_pct
    assert effective_drawdown(book, None, reset_active=True) == Decimal("-0.049")
    assert effective_drawdown(book, Decimal(1_000_000), reset_active=True) == Decimal("-0.049")
    deeper = _book("965000", prior_peak=Decimal(1_050_000))  # −3.5 % below the reset level
    assert effective_drawdown(deeper, Decimal(1_000_000), reset_active=True) == deeper.drawdown_pct


def test_session_clock() -> None:
    assert is_session_open(NOW)
    assert not is_session_open(datetime(2026, 10, 20, 6, 30, tzinfo=UTC))  # 09:30 Istanbul
    assert not is_session_open(datetime(2026, 10, 24, 9, 0, tzinfo=UTC))  # Saturday
    assert not is_session_open(datetime(2030, 1, 2, 9, 0, tzinfo=UTC))  # outside the calendar
    start, end = istanbul_day_bounds(datetime(2026, 10, 20, 22, 30, tzinfo=UTC))  # already the 21st
    assert start.isoformat() == "2026-10-21T00:00:00+03:00" and end - start == timedelta(days=1)


def test_personal_restart_needs_24h_and_5_sessions() -> None:
    kill = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)  # Monday
    started = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
    assert not personal_reset_allowed(kill, started, started + timedelta(hours=23))
    assert personal_reset_allowed(kill, started, started + timedelta(hours=24))  # Tue 13 … Mon 19: 5 sessions
    late_kill = datetime(2026, 10, 15, 9, 0, tzinfo=UTC)  # Thursday: Fri, Mon … only 2 by the 19th
    assert not personal_reset_allowed(late_kill, started, started + timedelta(hours=25))
    assert personal_reset_allowed(None, started, started + timedelta(days=1))
    assert not personal_reset_allowed(kill, kill, kill + timedelta(hours=30))  # next day, 1 session


def _desk(**kw: Any) -> DeskState:
    return DeskState(
        in_universe=True,
        last_price=Decimal(40),
        adv20_try=Decimal(10**8),
        free_float=0.4,
        equity_try=Decimal(10**6),
        **kw,
    )


def test_live_gate_fields_only_for_real_runs() -> None:
    assert live_gate_fields({"entry": "intraday_limit"}, _desk()) == {}
    desk = _desk(live=True, price_age_s=1800.0, restrictions_age_h=2.0, kap_delay_s=40.0, daily_entries=2)
    intraday = live_gate_fields({"entry": "intraday_limit"}, desk)
    assert intraday["price_age_s"] == 1800.0 and intraday["schema_ok"] is False  # not a TradeProposal
    assert (intraday["restrictions_age_h"], intraday["kap_delay_s"], intraday["daily_entries"]) == (2.0, 40.0, 2)
    assert live_gate_fields({"entry": "next_open_auction"}, desk)["price_age_s"] == 0.0
    proposal = next(r["explain"]["proposal"] for r in DemoFixtures().runs if r["explain"].get("proposal"))
    assert live_gate_fields(proposal, desk)["schema_ok"] is True
