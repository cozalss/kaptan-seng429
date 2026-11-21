"""The daily digest picks only what its subject names say, and says what happened in one plain line (agent INFO)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from kaptan.digest import store
from kaptan.digest.kinds import classify


def row(subject: str, route: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "disclosure_index": 1,
        "primary_ticker": "ABCDE",
        "stock_codes": ["ABCDE"],
        "company_name": "Deneme A.Ş.",
        "subject": subject,
        "summary": "",
        "subject_route": route,
        "is_noise": False,
        "published_at": datetime(2026, 11, 20, 9, 0, tzinfo=UTC),
        "fin_year": None,
        "fin_period": None,
        "parsed": {},
    }
    return {**base, **kw}


def test_buyback_names_the_price_only_when_it_was_parsed() -> None:
    parsed = {"status": "ok", "latest": {"date": "2026-11-20", "price_try": "33.76"}}
    kind, line = classify(row("Payların Geri Alınmasına İlişkin Bildirim", "E1", parsed=parsed)) or ("", "")
    assert kind == "buyback"
    assert "20 Kasım" in line and "33,76 ₺" in line
    bare = classify(row("Payların Geri Alınmasına İlişkin Bildirim", "E1"))
    assert bare is not None and "₺" not in bare[1]


def test_insider_trade_needs_a_known_direction() -> None:
    parsed = {"status": "ok", "direction": "buy", "price_low_try": "2.84", "price_high_try": "3.1"}
    kind, line = classify(row("Pay Alım Satım Bildirimi", "E2", parsed=parsed)) or ("", "")
    assert kind == "insider" and "hisse aldı" in line and "2,84–3,10 ₺" in line
    sold = classify(row("Pay Alım Satım Bildirimi", "E2", parsed={"status": "ok", "direction": "sell"}))
    assert sold is not None and "hisse sattı" in sold[1]


def test_insider_direction_can_come_from_the_companys_own_title() -> None:
    got = classify(row("Pay Alım Satım Bildirimi", "E2", summary="IZMDC Paylarının Alımı Hakkında"))
    assert got is not None and "hisse aldı" in got[1]


@pytest.mark.parametrize("summary", ["Pay Alım Satım Bildirimi", ""])
def test_an_insider_trade_of_unknown_direction_is_left_out(summary: str) -> None:
    assert classify(row("Pay Alım Satım Bildirimi", "E2", summary=summary)) is None


def test_a_fund_notice_is_not_an_insider_trade() -> None:
    parsed = {"status": "ok", "direction": "buy", "mentions_fund": True}
    assert classify(row("Pay Alım Satım Bildirimi", "E2", parsed=parsed)) is None


def test_contract_and_tender_say_what_they_are_and_one_amount() -> None:
    parsed = {"status": "ok", "amounts": [{"value": "11364379.71", "currency": "USD"}]}
    kind, line = classify(row("Yeni İş İlişkisi", "E3", parsed=parsed)) or ("", "")
    assert kind == "contract" and "11,36 milyon USD" in line
    tender = classify(row("İhale Süreci / Sonucu", "E3"))
    assert tender is not None and "ihale" in tender[1] and "Tutar" not in tender[1]
    two = {"status": "ok", "amounts": [{"value": "1", "currency": "TRY"}, {"value": "2", "currency": "TRY"}]}
    many = classify(row("Yeni İş İlişkisi", "E3", parsed=two))
    assert many is not None and "Tutar" not in many[1]


def test_earnings_names_the_period_without_inventing_figures() -> None:
    got = classify(row("Finansal Rapor", "E4", fin_year=2026, fin_period="3"))
    assert got == ("earnings", "2026 üçüncü çeyrek finansal tablolarını açıkladı.")
    unknown = classify(row("Finansal Rapor", "E4"))
    assert unknown is not None and unknown[1] == "Finansal tablolarını açıkladı."


@pytest.mark.parametrize(
    ("subject", "kind"),
    [
        ("Kar Payı Dağıtım İşlemlerine İlişkin Bildirim", "dividend"),
        ("Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim", "capital"),
        ("Birleşme İşlemlerine İlişkin Bildirim", "merger"),
        ("Bölünme  İşlemlerine İlişkin Bildirim", "merger"),  # KAP doubles spaces
    ],
)
def test_the_subject_allowlist_names_what_no_route_does(subject: str, kind: str) -> None:
    got = classify(row(subject, "archive_only"))
    assert got is not None and got[0] == kind


def test_an_spk_measure_is_a_restriction() -> None:
    got = classify(row("Sermaye Piyasası Kurulu Tedbir Kararı", "avoid:spk_tedbir"))
    assert got is not None and got[0] == "restriction"


@pytest.mark.parametrize(
    "r",
    [
        row("Pay Bazında Devre Kesici Bildirimi", "noise"),
        row("Finansal Rapor", "E4", is_noise=True),
        row("Sorumluluk Beyanı (Konsolide)", "archive_only"),
        row("Özel Durum Açıklaması (Genel)", "llm"),
    ],
)
def test_noise_archive_and_unknown_are_never_in(r: dict[str, Any]) -> None:
    assert classify(r) is None


def test_held_first_then_watched_then_kind_then_newest() -> None:
    def mk(index: int, ticker: str, route: str, hour: int, subject: str) -> dict[str, Any]:
        return row(
            subject,
            route,
            disclosure_index=index,
            primary_ticker=ticker,
            stock_codes=[ticker],
            published_at=datetime(2026, 11, 20, hour, 0, tzinfo=UTC),
        )

    rows = [
        mk(1, "AAAAA", "E1", 12, "Payların Geri Alınmasına İlişkin Bildirim"),
        mk(2, "BBBBB", "E4", 10, "Finansal Rapor"),
        mk(3, "CCCCC", "E4", 9, "Finansal Rapor"),
        mk(4, "DDDDD", "E3", 8, "Yeni İş İlişkisi"),
        mk(5, "EEEEE", "E1", 7, "Payların Geri Alınmasına İlişkin Bildirim"),
    ]
    items = store.build_items(rows, held={"EEEEE"}, watched={"CCCCC"}, universe={"AAAAA", "BBBBB"})
    assert [i["disclosure_index"] for i in items] == [5, 3, 4, 2, 1]
    assert [i["why"] for i in items] == ["held", "watched", None, None, None]


def test_the_outside_tag_says_no_suggestion_unless_the_company_is_watched() -> None:
    rows = [row("Finansal Rapor", "E4", fin_year=2026, fin_period="3")]
    plain = store.build_items(rows, set(), set(), set())[0]
    assert plain["outside_list"] and plain["outside_note"] == "KAPtan bu hisseye öneri vermez (işlem hacmi düşük)"
    watched = store.build_items(rows, set(), {"ABCDE"}, set())[0]
    assert watched["outside_list"] and "izleme listende" in (watched["outside_note"] or "")
    inside = store.build_items(rows, set(), set(), {"ABCDE"})[0]
    assert not inside["outside_list"] and inside["outside_note"] is None


def test_a_disclosure_without_a_usable_ticker_is_left_out() -> None:
    r = row("Finansal Rapor", "E4", primary_ticker=None, stock_codes=["TRXYZ1234567"])
    assert store.build_items([r], set(), set(), set()) == []


def test_default_day_is_today_on_a_trading_day_and_the_last_one_at_the_weekend() -> None:
    assert store.default_day(date(2026, 11, 20)) == (date(2026, 11, 20), False)  # Friday
    assert store.default_day(date(2026, 11, 21)) == (date(2026, 11, 20), True)  # Saturday
    assert store.default_day(date(2026, 11, 22)) == (date(2026, 11, 20), True)  # Sunday


def test_neighbour_days_skip_the_weekend_and_stop_at_today() -> None:
    assert store.previous_trading_day(date(2026, 11, 23)) == date(2026, 11, 20)
    assert store.next_trading_day_until(date(2026, 11, 20), date(2026, 11, 21)) is None
    assert store.next_trading_day_until(date(2026, 11, 20), date(2026, 11, 24)) == date(2026, 11, 23)
