"""A decision depends on the card only: a buy or a sell is approvable while pending, whatever the book's losses."""

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


@pytest.mark.parametrize("side", ["buy", "sell", None])
def test_a_pending_card_is_approvable_whatever_the_side(side: str | None) -> None:
    _check_decision(_card(side), APPROVE)


def test_a_decided_sell_card_is_still_a_conflict() -> None:
    card = {**_card("sell"), "status": "approved"}
    with pytest.raises(ApiError) as exc:
        _check_decision(card, APPROVE)
    assert exc.value.code == "conflict"
