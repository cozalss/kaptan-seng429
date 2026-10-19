"""The morning brief's plain Turkish text and warnings (FR-35): deterministic, no model."""

from __future__ import annotations

from datetime import date
from typing import Any

from kaptan.brief.build import date_tr, last_close, risk_warnings, summary_text


def _doc(**counts: int) -> dict[str, Any]:
    keys = ("open_positions", "expiring_today", "orders_for_open", "pending_approvals", "restriction_changes",
            "important_disclosures")  # fmt: skip
    return {k: [{}] * counts.get(k, 0) for k in keys}


def test_date_and_last_close() -> None:
    assert date_tr(date(2026, 10, 20)) == "20 Ekim 2026 Salı"
    assert last_close(date(2026, 10, 30)).isoformat() == "2026-10-28T13:00:00+03:00"  # half day before 29 Oct
    assert last_close(date(2031, 1, 6)).isoformat() == "2031-01-05T18:30:00+03:00"  # outside the calendar


def test_warnings_from_the_risk_state_and_yesterday() -> None:
    risk = {"kill_switch": "on", "kill_reason": "Zirveden %5 düşüş (R01)", "halted_today": True, "regime": "crisis"}
    pnl = {"d": date(2026, 10, 19), "equity": 990_000, "daily_return": -0.012, "drawdown": -0.03}
    levels = [w["level"] for w in risk_warnings(risk, pnl)]
    assert levels == ["critical", "warn", "warn", "warn"]
    calm = {"kill_switch": "off", "kill_reason": None, "halted_today": False, "regime": "normal"}
    assert risk_warnings(calm, {**pnl, "daily_return": 0.004}) == []
    assert risk_warnings(None, {**pnl, "drawdown": -0.01})[0]["level"] == "info"


def test_summary_text_is_plain_and_stable() -> None:
    risk = {"kill_switch": "off", "kill_reason": None, "halted_today": False, "regime": "normal"}
    pnl = {"d": date(2026, 10, 19), "equity": 1_004_200, "daily_return": 0.0042, "drawdown": -0.011}
    text = summary_text(date(2026, 10, 20), _doc(open_positions=3, expiring_today=1, pending_approvals=2), risk, pnl)
    assert text == (
        "20 Ekim 2026 Salı sabah özeti. Açık pozisyon: 3, bugün çıkış tarihi gelen: 1. "
        "Açılışta gerçekleşecek emir: 0. Onay bekleyen öneri: 2. Risk: acil durdurma kapalı, rejim normal. "
        "Önceki seans (19 Ekim 2026 Pazartesi): getiri +%0,42, özsermaye 1.004.200 TL, zirveden düşüş −%1,1. "
        "Yeni kısıtlama değişikliği yok. Son kapanıştan bu yana KAP bildirimi: 0."
    )
    bare = summary_text(date(2026, 10, 20), _doc(restriction_changes=2), None, None)
    assert "bugün çıkış tarihi gelen yok" in bare and "gün sonu kâr/zarar kaydı yok" in bare
    assert "Yeni kısıtlama değişikliği: 2." in bare
