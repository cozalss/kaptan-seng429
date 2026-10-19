"""SimBIST fill timing and the shadow-signal reason codes, pure (M3 A3)."""

from __future__ import annotations

from datetime import UTC, date, datetime

from kaptan.brokers.fills import at_market, auction_day, intraday_observation
from kaptan.portfolio.closing import cooldown_until, initial_stop
from kaptan.portfolio.shadow import run_reason


def _ist(d: date, h: int, m: int) -> datetime:
    return datetime(d.year, d.month, d.day, h - 3, m, tzinfo=UTC)


MON = date(2027, 1, 11)


def test_auction_day() -> None:
    assert auction_day(_ist(MON, 9, 30)) == MON
    assert auction_day(_ist(MON, 9, 45)) == date(2027, 1, 12)
    assert auction_day(_ist(date(2027, 1, 9), 9, 0)) == MON  # Saturday → Monday
    assert auction_day(_ist(date(2027, 1, 15), 19, 0)) == date(2027, 1, 18)  # Friday evening → Monday


def test_intraday_observation_and_market_time() -> None:
    assert intraday_observation(_ist(MON, 9, 50)) == (MON, "open")
    assert intraday_observation(_ist(MON, 14, 0)) == (MON, "close")
    assert intraday_observation(_ist(MON, 18, 20)) == (date(2027, 1, 12), "open")
    assert intraday_observation(_ist(date(2027, 1, 10), 12, 0)) == (MON, "open")  # Sunday
    assert at_market(MON, "open") == _ist(MON, 10, 0)
    assert at_market(MON, "close") == _ist(MON, 18, 10)


def test_initial_stop_and_cooldown() -> None:
    stop, pct = initial_stop(34.0, 30.57, 33.48)
    assert pct is not None and round(pct, 4) == 0.0869
    assert stop == 31.04
    assert initial_stop(34.0, None, 33.48) == (None, None)
    assert initial_stop(34.0, 40.0, 33.48) == (None, None)
    assert cooldown_until(MON) == date(2027, 1, 25)  # 10 sessions


def test_run_reason_codes() -> None:
    gate = [{"rule_code": "R01", "outcome": "pass"}, {"rule_code": "R06", "outcome": "reject"}]
    assert run_reason(gate, None, None) == ("R06", "risk_gate")
    assert run_reason([], {"decision": "veto"}, None) == ("COMPLIANCE_VETO", "compliance")
    assert run_reason(None, None, {"reason_codes": ["SKEPTIC_VETO"]}) == ("SKEPTIC_VETO", "skeptic")
    assert run_reason(None, None, {"reason_codes": ["SKEPTIC_VETO", "E3_RULE_NOT_MET"]}) is None
    assert run_reason(None, {"decision": "pass"}, {"reason_codes": ["E1_RULE_MET"]}) is None
