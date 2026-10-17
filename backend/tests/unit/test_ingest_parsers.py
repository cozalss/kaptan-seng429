"""Type-specific parsers on real BildirimPdf texts (tests/fixtures/detail_text, recorded 2026-10-17)."""

from __future__ import annotations

from typing import Any

import pytest

from kaptan.ingest.detail_fetcher import reason_from
from kaptan.ingest.parsers import PARSER_VERSION, parse_detail, parser_for
from kaptan.ingest.parsers.common import flags, form_fields, jsonable, money, parse_date, section, yes_no
from tests.ingest_support import detail_text, manifest, subject_of


def parsed(idx: int) -> dict[str, Any]:
    doc = parse_detail(subject_of(idx), detail_text(idx))
    assert doc is not None
    assert doc["parser_version"] == PARSER_VERSION
    return doc


def test_every_recorded_text_has_a_parser_that_does_not_fail() -> None:
    for idx in manifest()["detail_text"]:
        doc = parsed(int(idx))
        assert doc["status"] in {"ok", "attachment_only"}, (idx, doc)


def test_buyback_with_a_program_and_four_trade_days() -> None:
    doc = parsed(1683376)
    assert doc["kind"] == "buyback"
    assert (doc["is_update"], doc["is_correction"], doc["is_deferred"]) == (True, False, False)
    assert doc["board_decision_date"] == "2026-10-08"
    assert doc["max_nominal_try"] == "100000000" and doc["fund_total_try"] == "1400000000"
    assert doc["plan"] == {
        "start": "2026-10-08",
        "end": "2026-11-07",
        "max_nominal_try": "100000000",
        "capital_ratio_pct": "2.6455",
    }
    txns = doc["transactions"]
    assert [t["date"] for t in txns] == ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-16"]
    assert txns[-1] == {
        "ticker": "CVKMD",
        "isin": "TRECVKM00021",
        "share_group": "B Grubu",
        "date": "2026-10-16",
        "nominal_try": "8628000",
        "capital_ratio_pct": "0.22825",
        "price_try": "12.36",
        "prior_nominal_try": "3988735",
    }
    assert doc["total_nominal_try"] == "12616735"  # matches the text's "12.616.735 TL"
    assert doc["latest"]["date"] == "2026-10-16"


def test_buyback_without_a_planned_period_table() -> None:
    doc = parsed(1683372)
    assert doc["plan"] is None and doc["max_nominal_try"] is None
    assert doc["fund_total_try"] == "250000000"
    assert [(t["ticker"], t["nominal_try"], t["price_try"]) for t in doc["transactions"]] == [
        ("AZTEK", "491234", "2.69")
    ]


def test_insider_trade_table_rows() -> None:
    doc = parsed(1682800)
    assert doc["kind"] == "insider_trade" and doc["direction"] == "sell"
    assert len(doc["rows"]) == 3
    assert doc["rows"][0] == {
        "date": "2026-10-13",
        "buy_nominal_try": "0",
        "sell_nominal_try": "77884",
        "net_nominal_try": "-77884",
        "start_nominal_try": "4216977",
        "end_nominal_try": "4139093",
        "start_capital_pct": "12.47",
        "start_vote_pct": "12.47",
        "end_capital_pct": "12.24",
        "end_vote_pct": "12.24",
    }
    assert (doc["price_low_try"], doc["price_high_try"]) == ("40.12", "53.5")
    assert doc["is_update"] is False


def test_insider_trade_with_empty_cells_and_a_fund() -> None:
    doc = parsed(1683334)
    row = doc["rows"][0]
    assert row["buy_nominal_try"] is None  # empty leading cell: values align from the right
    assert (row["start_nominal_try"], row["end_nominal_try"]) == ("30276281.9", "21416281.9")
    assert row["end_capital_pct"] == "2.97"
    assert doc["related_companies"] == ["AHSGY"] and doc["mentions_fund"] is True


def test_mkk_forwarded_insider_notice_points_to_the_attachment() -> None:
    doc = parsed(1683269)
    assert doc["status"] == "attachment_only" and doc["rows"] == []
    assert doc["related_companies"] == ["BAHKM"] and doc["direction"] is None
    assert doc["is_correction"] is False


def test_new_business_order_in_tl() -> None:
    doc = parsed(1682993)
    assert doc["kind"] == "new_business"
    assert doc["counterparty_role"] == "Müşteri (Customer)" and doc["counterparty"] is None
    assert doc["start_date"] == "2026-10-16"
    assert doc["amounts"] == [{"value": "63576313", "currency": "TRY"}] and doc["amount_try"] == "63576313"
    assert doc["cues"] == ["order_received"]


def test_new_business_contract_with_tl_and_eur() -> None:
    doc = parsed(1682657)
    assert doc["counterparty"] == "SWEET NUTS SP. Z O.O."
    assert doc["amounts"] == [{"value": "555402549", "currency": "TRY"}, {"value": "10077560", "currency": "EUR"}]
    assert "signed" in doc["cues"] and doc["expected_effect"] == "Olumlu"


def test_tender_finalised_with_multi_line_fields() -> None:
    doc = parsed(1683277)
    assert doc["kind"] == "tender" and doc["is_update"] is True
    assert doc["subject"].startswith("Yeşil Alanların Bakım Onarım") and doc["subject"].endswith("Araç Alımı")
    assert doc["awarding_party"].endswith("Genel Müdürlüğü")
    assert doc["result"] == "Toplam 8 kısım Şirketimiz uhdesinde kalmıştır."  # not the title "İhale Sonucu Hakkında"
    assert doc["bid_date"] == "2026-09-17" and doc["result_date"] is None
    assert doc["amount_try"] == "1153896940" and doc["cues"] == ["finalised"]


def test_tender_ranked_first() -> None:
    doc = parsed(1682623)
    assert doc["awarding_party"] == "TEİAŞ Genel Müdürlüğü"
    assert doc["result"] == "İhalede 1. olunmuştur." and doc["bid_date"] is None
    assert doc["amount_try"] == "390931876" and "ranked_first" in doc["cues"]


def test_financial_report_lines() -> None:
    doc = parsed(1683354)
    assert (doc["year"], doc["quarter"], doc["consolidated"]) == (2026, 2, True)
    assert (doc["audit_type"], doc["audit_opinion"], doc["currency"]) == ("Özel", "Olumlu", "TL")
    items = doc["items"]
    assert items["revenue"] == {"current": "2890609078", "prior": "1782637668"}
    assert items["net_profit"] == {"current": "52843146", "prior": "3095411"}
    assert items["total_assets"]["current"] == "7464552966"
    assert items["paid_in_capital"]["current"] == "110000000"


def test_general_oda_explanation() -> None:
    doc = parsed(1683355)
    assert doc["kind"] == "general" and doc["is_update"] is True
    assert doc["explanation"].startswith("Turgutlu Unlu Mamuller Tesisinin ikinci faz")


def test_unknown_subjects_and_broken_texts() -> None:
    assert parser_for("Finansal Takvim") is None
    assert parse_detail("Finansal Takvim", "x") is None
    assert parse_detail("Finansal Rapor", "boş")["status"] == "failed"  # type: ignore[index]
    assert parse_detail("Payların Geri Alınmasına İlişkin Bildirim", "")["status"] == "partial"  # type: ignore[index]


def test_a_parser_exception_becomes_a_failed_document(monkeypatch: pytest.MonkeyPatch) -> None:
    from kaptan.ingest import parsers

    def boom(text: str) -> dict[str, Any]:
        raise RuntimeError("bad table")

    monkeypatch.setitem(parsers._BY_SUBJECT, "finansal rapor", boom)
    doc = parse_detail("Finansal Rapor", "x")
    assert doc is not None and doc["status"] == "failed" and "bad table" in doc["error"]


@pytest.mark.parametrize(
    ("doc", "reason"),
    [
        ({"is_update": True, "is_correction": False}, "UPD"),
        ({"is_update": False, "is_correction": True}, "CORR"),
        ({"is_update": False, "is_correction": False}, "NEW"),
        ({"is_update": None, "is_correction": None}, None),
        (None, None),
    ],
)
def test_reason_from_the_form_questions(doc: dict[str, Any] | None, reason: str | None) -> None:
    assert reason_from(doc) == reason


def test_common_helpers() -> None:
    text = "Başlık\nİhale Konusu Yol\nyapımı\nİhale Bedeli -\nYapılan Açıklama Güncelleme mi ? Evet"
    fields = form_fields(text, ("İhale Konusu", "Eksik Alan", "İhale Bedeli", "Yapılan Açıklama"))
    assert fields == {
        "İhale Konusu": "Yol yapımı",
        "Eksik Alan": None,
        "İhale Bedeli": None,
        "Yapılan Açıklama": "Güncelleme mi ? Evet",
    }
    assert yes_no("yapılan açıklama düzeltme mi? hayır", "Düzeltme mi ?") is False
    assert form_fields(text, ("İhale Konusu", "İhale Bedeli"), after="Yok Böyle")["İhale Konusu"] == "Yol yapımı"
    assert section(text, "Olmayan", "x") == ""
    assert yes_no(text, "Güncelleme mi?") is True and yes_no(text, "Düzeltme mi?") is None
    assert flags(text)["is_update"] is True
    assert parse_date("31/02/2026") is None and parse_date(None) is None and parse_date("x") is None
    assert money("-") is None and money(None) is None
    assert jsonable({"a": [1, ("b",)]}) == {"a": [1, ["b"]]}
