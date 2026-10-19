"""A SELL exit is still decided while stopped (06 X5: X1–X4 keep managing positions); a BUY is not."""

from __future__ import annotations

from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.approvals.service import _check_decision
from kaptan.domain.schemas import ApprovalDecision

APPROVE = ApprovalDecision(decision="approve", approved_notional_try=None, comment="")


def _card(side: str | None) -> dict[str, Any]:
    card: dict[str, Any] = {"status": "pending", "final_notional_try": 10_000.0}
    if side is not None:
        card["side"] = side
    return card


@pytest.mark.parametrize("side", ["buy", None])
def test_a_buy_is_refused_under_the_kill_switch_and_the_daily_halt(side: str | None) -> None:
    with pytest.raises(ApiError) as kill:
        _check_decision(_card(side), APPROVE, kill_on=True, halted=False)
    assert kill.value.code == "kill_switch"
    with pytest.raises(ApiError) as halt:
        _check_decision(_card(side), APPROVE, kill_on=False, halted=True)
    assert halt.value.code == "halted"


def test_a_sell_exit_is_still_approvable_while_stopped() -> None:
    _check_decision(_card("sell"), APPROVE, kill_on=True, halted=True)


def test_a_decided_sell_card_is_still_a_conflict() -> None:
    card = {**_card("sell"), "status": "approved"}
    with pytest.raises(ApiError) as exc:
        _check_decision(card, APPROVE, kill_on=True, halted=False)
    assert exc.value.code == "conflict"
