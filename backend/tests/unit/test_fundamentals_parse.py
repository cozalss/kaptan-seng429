"""İş Yatırım MaliTablo parsing and YTD → quarter / TTM (recorded THYAO fixtures, offline)."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from kaptan.fundamentals.isyatirim import derive, parse_statements, recent_periods
from kaptan.fundamentals.store import deadline_stamp, report_months
from kaptan.prices.http import SourceError

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "reference"
P2025 = [(2025, 12), (2025, 9), (2025, 6), (2025, 3)]
P2026 = [(2026, 6), (2026, 3), (2024, 12), (2024, 9)]


def statements() -> dict[tuple[int, int], dict[str, Decimal]]:
    a = parse_statements(json.loads((FIX / "malitablo_THYAO_2025.json").read_text(encoding="utf-8")), P2025)
    b = parse_statements(json.loads((FIX / "malitablo_THYAO_2026_2024.json").read_text(encoding="utf-8")), P2026)
    return {**a, **b}


def test_quarters_and_ttm() -> None:
    items = {(i.period_end, i.item): i.value for i in derive(statements())}
    assert items[(date(2025, 12, 31), "revenue_annual")] == Decimal("1125149219659")
    assert items[(date(2026, 6, 30), "revenue_q")] == Decimal("585069000000") - Decimal("257961000000")
    assert items[(date(2026, 6, 30), "revenue_ttm")] == Decimal("585069000000") + Decimal("1125149219659") - Decimal(
        "408036000000"
    )
    assert items[(date(2025, 3, 31), "revenue_q")] == Decimal("176712000000")
    assert items[(date(2026, 3, 31), "revenue_ttm")] == Decimal("257961000000") + Decimal("1125149219659") - Decimal(
        "176712000000"
    )
    assert items[(date(2025, 12, 31), "paid_in_capital")] == Decimal(1_380_000_000)
    assert (date(2024, 9, 30), "revenue_q") not in items  # 2024/6 missing


def test_bad_answer_and_periods() -> None:
    with pytest.raises(SourceError):
        parse_statements({"ok": False, "errorCode": "x"}, P2025)
    assert recent_periods(date(2026, 10, 20), 3) == [(2026, 9), (2026, 6), (2026, 3)]
    assert recent_periods(date(2026, 2, 1), 2) == [(2025, 12), (2025, 9)]
    assert report_months({"raw": {"disclosureBasic": {"donem": 2}}}) == 6
    assert report_months({"raw": {"period": 4, "ruleType": "Yıllık"}}) == 12
    assert report_months({"raw": {"period": None, "ruleType": "9 Aylık"}}) == 9
    assert report_months({"raw": {}, "fin_period": "3AB"}) is None
    assert deadline_stamp((2025, 12)).available_at.date() == date(2026, 3, 12)
