"""position_view: a real price mark (PRICES_LIVE) wins over the replay mark."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from kaptan.portfolio.positions import position_view
from kaptan.prices.models import Mark

NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)


def _row(**over: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "book": "paper",
        "ticker": "THYAO",
        "company_name": "Örnek",
        "qty": 100,
        "avg_cost": Decimal("300"),
        "opened_at": datetime(2027, 1, 5, 7, 16, tzinfo=UTC),
        "planned_exit_date": "2027-01-20",
        "source_proposal": "prop-1",
        "run_id": "run-1",
        "event_type": "E3",
        "strategy_version": "v1.1-fwd",
        "realized_pnl": Decimal("0"),
        "issuer_price": None,
        "disclosure_index": 1,
        "managed": False,
    }
    row.update(over)
    return row


def test_a_live_mark_sets_last_price_and_pnl() -> None:
    mark = Mark("THYAO", Decimal("312.5"), date(2027, 1, 8), "close", NOW, "isyatirim")
    view = position_view(_row(), NOW, mark)
    assert view["last_price"] == 312.5
    assert view["unrealized_pnl"] == 1250


def test_without_a_mark_or_issuer_price_the_position_sits_at_cost() -> None:
    view = position_view(_row(), NOW)
    assert view["last_price"] == 300
    assert view["unrealized_pnl"] == 0
