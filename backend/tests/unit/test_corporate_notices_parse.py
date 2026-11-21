"""KAP notices about dividends, bonus issues and splits: the deterministic reader.

The subjects and summaries are the recorded ones (tests/fixtures/kap_json, 15-16.10.2026). No dividend full text was
recorded, so the fact readers are tested on text written with the form's field labels (marked as such below).
"""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.ingest.corporate_actions import detect, is_corporate_subject, parse_tr_number
from kaptan.portfolio.corporate_notices import headline
from tests.ingest_support import list_main

CAPITAL = "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim"
DIVIDEND = "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim"
#: Written to look like the form's labels; NOT a recording.
FORM_TEXT = """Kar Payı Dağıtım İşlemlerine İlişkin Bildirim
Hak Kullanım Tarihi 01.12.2026
Ödeme Tarihi 03.12.2026
Pay Başına Brüt Kar Payı (TL) 12,500000
Pay Başına Net Kar Payı (TL) 10,625000
"""


def _recorded(index: int) -> dict[str, str]:
    for row in list_main(date(2026, 10, 15)) + list_main(date(2026, 10, 16)):
        basic = row["disclosureBasic"]
        if basic["disclosureIndex"] == index:
            return {"subject": basic["title"], "summary": basic["summary"] or ""}
    raise AssertionError(index)


def test_the_recorded_dividend_notice_is_a_dividend_with_no_facts() -> None:
    found = detect(**_recorded(1682772))  # SUMAS, "Kar Payı Dağıtımı"
    assert found is not None and found.kind == "dividend"
    assert (found.per_share_gross, found.pay_date) == (None, None)  # nothing to read: left empty


def test_the_recorded_bonus_registration_is_a_bonus_and_the_applications_are_not() -> None:
    registered = detect(**_recorded(1682658))  # AYES, "Bedelsiz Sermaye Artırımı Tescili"
    assert registered is not None and registered.kind == "bonus" and registered.bonus_pct is None
    for index in (1683234, 1683077, 1683271, 1683360):  # SPK application, application, withdrawn, demerger cancelled
        assert detect(**_recorded(index)) is None


def test_the_facts_are_read_from_the_forms_labels() -> None:
    found = detect(DIVIDEND, "Kar Payı Dağıtımı", FORM_TEXT)
    assert found is not None
    assert (found.per_share_gross, found.per_share_net) == (12.5, 10.625)
    assert (found.pay_date, found.ex_date) == (date(2026, 12, 3), date(2026, 12, 1))
    assert "hisse başı 12,50 ₺ brüt, ödeme 3 Aralık" in headline("TUPRS", found)


def test_a_fact_with_no_label_is_not_guessed() -> None:
    found = detect(DIVIDEND, "Kar Payı Dağıtımı", "Şirket kâr dağıtacak. 12,50 diyor ama etiketi yok.")
    assert found is not None and found.per_share_gross is None and found.pay_date is None
    assert "hisse başı" not in headline("TUPRS", found)


def test_the_bonus_percentage_comes_from_the_summary_or_the_label() -> None:
    assert detect(CAPITAL, "%100 Bedelsiz Sermaye Artırımı Tescili").bonus_pct == 100.0  # type: ignore[union-attr]
    text = "Bedelsiz Sermaye Artırım Oranı (%) 50,5"
    assert detect(CAPITAL, "Bedelsiz Sermaye Artırımı Tescili", text).bonus_pct == 50.5  # type: ignore[union-attr]
    assert detect(CAPITAL, "Bedelsiz Sermaye Artırımı Tescili", "Oran (%) 1e9").bonus_pct is None  # type: ignore[union-attr]


@pytest.mark.parametrize(("raw", "value"), [("1.250,50", 1250.5), ("12,5", 12.5), ("12.5", 12.5), ("abc", None)])
def test_turkish_numbers(raw: str, value: float | None) -> None:
    assert parse_tr_number(raw) == value


def test_which_subjects_get_their_text_fetched() -> None:
    assert is_corporate_subject(DIVIDEND) and is_corporate_subject(CAPITAL)
    assert not is_corporate_subject("Pay Alım Satım Bildirimi")


def test_other_subjects_are_not_actions() -> None:
    assert detect("Özel Durum Açıklaması (Genel)", "Bedelsiz bir şey") is None
    assert detect(CAPITAL, "Fon Kulanım Raporu Hk") is None
