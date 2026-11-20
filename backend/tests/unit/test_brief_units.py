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


BANNED = ("acil durdurma", "özsermaye", "emir", "pozisyon", "rejim", "zirve", "paper", "simbist", "kill", "drawdown")


def test_warnings_from_the_risk_state_and_yesterday() -> None:
    risk = {"kill_switch": "on", "kill_reason": "Zirveden %5 düşüş (R01)", "halted_today": True, "regime": "crisis"}
    pnl = {"d": date(2026, 10, 19), "equity": 990_000, "daily_return": -0.012, "drawdown": -0.03}
    found = risk_warnings(risk, pnl)
    assert [w["level"] for w in found] == ["critical", "warn", "warn", "warn"]
    assert found[0]["text_tr"] == "KAPtan durduruldu: yeni öneri çıkmaz."  # the rule code is not shown
    assert found[3]["text_tr"] == "Önceki borsa gününde paran %1,2 azaldı."
    for w in found:
        assert not any(b in w["text_tr"].lower() for b in BANNED)
    calm = {"kill_switch": "off", "kill_reason": None, "halted_today": False, "regime": "normal"}
    assert risk_warnings(calm, {**pnl, "daily_return": 0.004}) == []
    assert risk_warnings(None, {**pnl, "drawdown": -0.01})[0]["level"] == "info"


def test_summary_text_is_plain_and_stable() -> None:
    risk = {"kill_switch": "off", "kill_reason": None, "halted_today": False, "regime": "normal"}
    pnl = {"d": date(2026, 10, 19), "equity": 1_004_200, "daily_return": 0.0042, "drawdown": -0.011}
    text = summary_text(date(2026, 10, 20), _doc(open_positions=3, expiring_today=1, pending_approvals=2), risk, pnl)
    assert text == (
        "20 Ekim 2026 Salı sabah özeti. Onayını bekleyen 2 öneri var. "
        "Elinde 3 hisse var, bugün satış günü gelen: 1. "
        "Önceki borsa gününde (19 Ekim 2026 Pazartesi) paran %0,42 arttı; "
        "toplam 1.004.200 TL, en yüksek seviyesinden %1,1 aşağıda. "
        "Son kapanıştan bu yana KAPtan'ın önemli bulduğu bildirim gelmedi."
    )
    assert not any(b in text.lower() for b in BANNED)


def test_summary_of_an_empty_install_says_only_what_exists() -> None:
    bare = summary_text(date(2026, 10, 20), _doc(), None, None)
    assert bare == (
        "20 Ekim 2026 Salı sabah özeti. Onayını bekleyen öneri yok. Elinde KAPtan'ın bildiği hisse yok. "
        "Son kapanıştan bu yana KAPtan'ın önemli bulduğu bildirim gelmedi."
    )
    stopped = {"kill_switch": "on", "kill_reason": None, "halted_today": True, "regime": "normal"}
    said = summary_text(date(2026, 10, 20), _doc(restriction_changes=2, important_disclosures=4), stopped, None)
    assert "KAPtan durduruldu, yeni öneri çıkmaz; günlük zarar sınırına gelindi, bugün yeni öneri çıkmaz." in said
    assert "işlem kısıtı: 2." in said and "4 KAP bildirimi geldi." in said
