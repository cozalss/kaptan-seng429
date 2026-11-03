"""R14's side of the comparison on real recorded forms: what the source document itself says the amount is.

The gate compares a Reader figure with these amounts and nothing here touches the gate. So every test is about reading
the document: a real table counts, a price or a holding does not, and a figure the document does not hold still fails.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest

from kaptan.agents.nodes.merge import amount_in_text, e2_stated_value, reader_amount, regex_amounts
from kaptan.agents.reader_facts import AttachmentFacts
from kaptan.agents.source_amounts import SourceAmounts, amount_basis, read_source, text_amounts
from kaptan.risk.gate import r14
from tests.unit.test_risk_gate_spec_cases import BUY, CTX, LIM

ARCHIVE: Final = Path(__file__).resolve().parents[1] / "fixtures" / "archive"
ROW_844786: Final = (424_530, 427_000, 180_686, 54_115, 156_000, 125_000, 115_000, 120_000, 60_000)


def form(index: int) -> str:
    return (ARCHIVE / f"{index}.txt").read_text("utf-8")


def source(event: str, index: int, ticker: str) -> SourceAmounts:
    return read_source(event, form(index), ticker)


def confirmed(figure: str | int, amounts: SourceAmounts) -> bool | None:
    return amount_in_text(Decimal(str(figure)), list(amounts.values))


def gate_outcome(figure: str | int, amounts: SourceAmounts) -> str:
    order = replace(BUY, reader_amount=Decimal(str(figure)), regex_amounts=amounts.values)
    return str(r14(order, CTX, LIM, "pre_trade").outcome)


# ── the real forms ───────────────────────────────────────────────────────
def test_844786_reads_the_nominal_cells_under_the_tl_header() -> None:
    amounts = source("E1", 844786, "TAVHL")
    assert {Decimal(n) for n in ROW_844786} <= set(amounts.written)
    assert amounts.derived == ((Decimal(sum(ROW_844786)), "table_sum"),)


def test_844786_price_ratio_and_programme_cap_do_not_confirm() -> None:
    amounts = source("E1", 844786, "TAVHL")
    for figure in ("17.2858", "17.09", "0.117", "200000000", "36328125"):
        assert confirmed(figure, amounts) is False, figure


def test_1010940_reads_the_wrapped_rows_and_the_cumulative_column() -> None:
    amounts = source("E1", 1010940, "LKMNH")
    basis = {str(value): how for value, how in amounts.derived}
    assert Decimal(1_000) in amounts.written and Decimal(20_000) in amounts.written
    assert basis["798892"] == "table_cumulative"  # 797.892 earlier in the programme + the last row's 1.000
    assert "table_sum" in basis.values()
    for figure in ("15.56", "0.004", "30000000", "3600000", "797892"):
        assert confirmed(figure, amounts) is False, figure


def test_844819_reads_the_nominal_and_derives_the_value_at_the_midpoint() -> None:
    amounts = source("E2", 844819, "MEPET")
    assert Decimal(1_000_000) in amounts.written
    assert amounts.derived == ((Decimal(1_840_000), "nominal_x_price"),)  # 1.000.000 × (1,83 + 1,85) / 2 (06 §3.2)
    assert amount_basis(Decimal(1_840_000), amounts) == "nominal_x_price"
    for figure in ("1.85", "1.83", "1.33", "1300000"):
        assert confirmed(figure, amounts) is False, figure


def test_668586_reads_the_older_column_layout_and_not_the_holding() -> None:
    amounts = source("E2", 668586, "DGZTE")
    assert set(amounts.written) == {Decimal(5_000), Decimal(14_500)}
    assert not amounts.derived  # the value is written in the table, there is nothing to compute
    for figure in ("2.9", "92.733", "97369242.772", "97364242.772"):
        assert confirmed(figure, amounts) is False, figure


def test_a_form_whose_trade_table_is_only_in_the_attachment_gives_no_table_amount() -> None:
    assert not source("E2", 976850, "PAGYO").values


# ── number formats ───────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1.480,50 TL ödendi", "1480.50"),
        ("1480,5 TL ödendi", "1480.5"),
        ("1480.5 TL ödendi", "1480.5"),
        ("1,480.50 TL ödendi", "1480.50"),
        ("1,160,980 TL ödendi", "1160980"),
        ("1.000.000-TL tutarında", "1000000"),
        ("1.000.000 ₺ tutarında", "1000000"),
    ],
)
def test_turkish_and_english_number_formats_read_as_one_value(text: str, expected: str) -> None:
    assert text_amounts(text, skip_prices=True) == [Decimal(expected)]


@pytest.mark.parametrize(
    "text",
    [
        "ağırlıklı ortalama 17,2858 TL fiyattan alındı",
        "1,83-1,85 TL fiyat aralığından",
        "1,83 TL - 1,85 TL fiyat aralığından",
        "işlem fiyatı 17,29 TL olarak gerçekleşti",
        "ortalama 17,29 TL ile alındı",
        "fiyat aralığı 1,83-1,85 TL",
        "12,50 TL/adet",
        "60.000 adet pay 17,29 TL'den alındı",
        "pay başına 12,50 TL",
    ],
)
def test_a_price_written_with_tl_is_not_an_amount(text: str) -> None:
    assert text_amounts(text, skip_prices=True) == []


def test_an_amount_next_to_a_price_range_still_counts() -> None:
    text = "17,41 - 18,60 TL fiyat aralığından 1.000.000 TL toplam nominal tutarlı alış"
    assert text_amounts(text, skip_prices=True) == [Decimal(1_000_000)]


def test_words_that_start_with_tl_and_dates_are_not_amounts() -> None:
    assert text_amounts("Faiz 100 TLREF üzerinden, 30.10.2026 TL", skip_prices=True) == []


def test_e3_keeps_a_tender_figure_called_a_price() -> None:
    assert regex_amounts("En düşük fiyat teklifi 125.000.000 TL") == [Decimal(125_000_000)]
    assert regex_amounts("125.000.000 TL fiyat teklifi verildi") == [Decimal(125_000_000)]


def test_e3_reads_only_the_text_not_a_table() -> None:
    amounts = read_source("E3", "Sözleşme bedeli 1.200.000 TL", "TSTEB", duration_months=24)
    assert set(amounts.written) == {Decimal(1_200_000), Decimal(50_000)} and not amounts.derived


# ── the Reader's figure ──────────────────────────────────────────────────
def test_e1_uses_the_stated_cumulative_first() -> None:
    doc = {"kind": "E1", "cumulative_nominal_tl": 500.0, "transactions": [{"nominal_tl": 1.0}]}
    assert reader_amount(doc) == Decimal(500)


def test_e1_without_a_stated_cumulative_is_the_sum_of_its_own_rows() -> None:
    doc = {"kind": "E1", "cumulative_nominal_tl": None, "transactions": [{"nominal_tl": 100.0}, {"nominal_tl": 50.0}]}
    assert reader_amount(doc) == Decimal(150)


def test_e1_with_no_figure_at_all_stays_unread() -> None:
    assert reader_amount({"kind": "E1", "cumulative_nominal_tl": None, "transactions": []}) is None


def test_e2_uses_a_stated_value_first() -> None:
    doc = {"kind": "E2", "trades": [{"qty": 1000.0, "value_tl": 5000.0}]}
    assert reader_amount(doc) == Decimal(5000) and e2_stated_value(doc) == Decimal(5000)


def test_e2_without_a_value_is_its_nominal_as_06_r14_defines_but_never_a_value() -> None:
    doc = {"kind": "E2", "trades": [{"qty": 1000.0, "value_tl": None}, {"qty": 500.0, "value_tl": None}]}
    assert reader_amount(doc) == Decimal(1500)
    assert e2_stated_value(doc) is None  # a nominal must not reach E2.min_value as if it were TL paid


def test_real_844786_with_no_cumulative_confirms_only_the_true_sum() -> None:
    amounts = source("E1", 844786, "TAVHL")
    true_rows = [{"nominal_tl": float(n)} for n in ROW_844786]
    made_up = [{"nominal_tl": float(n + 1_000)} for n in ROW_844786]
    assert amount_in_text(reader_amount({"kind": "E1", "transactions": true_rows}), list(amounts.values)) is True
    assert amount_in_text(reader_amount({"kind": "E1", "transactions": made_up}), list(amounts.values)) is False


# ── adversarial ──────────────────────────────────────────────────────────
@pytest.mark.parametrize("figure", ["999999", "1662332000", "1800000", "12345"])
def test_a_reader_amount_that_appears_nowhere_is_rejected_at_the_gate(figure: str) -> None:
    assert gate_outcome(figure, source("E1", 844786, "TAVHL")) == "reject"


@pytest.mark.parametrize(
    ("event", "index", "ticker", "price"),
    [
        ("E1", 844786, "TAVHL", "17.2858"),
        ("E1", 844786, "TAVHL", "17.09"),
        ("E1", 1010940, "LKMNH", "15.46"),
        ("E2", 844819, "MEPET", "1.85"),
        ("E2", 668586, "DGZTE", "2.9"),
    ],
)
def test_a_reader_amount_equal_to_a_price_is_rejected_at_the_gate(
    event: str, index: int, ticker: str, price: str
) -> None:
    assert gate_outcome(price, source(event, index, ticker)) == "reject"


def test_the_gate_accepts_a_derived_value_and_refuses_one_just_outside_the_tolerance() -> None:
    amounts = source("E2", 844819, "MEPET")
    assert gate_outcome(1_840_000, amounts) == "pass"
    assert gate_outcome(1_849_500, amounts) == "reject"  # 0.51 % away


def test_a_wide_price_range_does_not_widen_what_a_derived_value_confirms() -> None:
    text = form(844819).replace("1,83-1,85", "1,00-3,00")
    amounts = read_source("E2", text, "MEPET")
    assert amounts.derived == ((Decimal(2_000_000), "nominal_x_price"),)
    assert gate_outcome(1_500_000, amounts) == "reject"  # inside the range, still not the midpoint


PLANTED_ROW: Final = "TAVHL, TRETAVH00018 13.05.2020 999.999 0,117 17,09 -"


@pytest.mark.parametrize(
    "plant",
    [
        "Ek Açıklamalar\n999.999\n",
        "Ek Açıklamalar\nİşleme Konu Payların Nominal Tutarı (TL) 999.999\n",
        f"Ek Açıklamalar\n{PLANTED_ROW}\n",
        f"Ek Açıklamalar\nGeri Alım İşlemlerinin Detayları\n{PLANTED_ROW}\n",
        "Ek Açıklamalar\n999.999 TL fiyattan alındı\n",
    ],
)
def test_a_figure_planted_in_free_text_does_not_confirm(plant: str) -> None:
    amounts = read_source("E1", form(844786).replace("Ek Açıklamalar\n", plant), "TAVHL")
    assert confirmed(999_999, amounts) is False


def test_a_table_heading_planted_before_the_real_one_turns_the_table_off_it_does_not_add_to_it() -> None:
    plant = f"Söz Konusu Geri Alımın Amacı\nGeri Alım İşlemlerinin Detayları\n{PLANTED_ROW}\n"
    amounts = read_source("E1", form(844786).replace("Söz Konusu Geri Alımın Amacı\n", plant), "TAVHL")
    assert confirmed(999_999, amounts) is False and not amounts.derived


def test_a_row_of_another_company_does_not_count() -> None:
    amounts = read_source("E1", form(844786), "TSTEB")
    assert confirmed(60_000, amounts) is False and not amounts.derived


def test_a_plain_tl_sentence_passes_exactly_as_it_did_before_and_not_more() -> None:
    """The known limit of R14, unchanged: a written "<amount> TL" counts. The guard and R11 stand in front of it."""
    planted = form(844786).replace("Ek Açıklamalar\n", "Ek Açıklamalar\nToplam 999.999 TL nominal geri alındı.\n")
    assert Decimal(999_999) in regex_amounts(planted)
    assert confirmed(999_999, read_source("E1", planted, "TAVHL")) is True


def test_a_second_price_written_in_the_text_turns_the_derived_value_off() -> None:
    plant = form(844819).replace("Açıklamalar\n", "Açıklamalar\n50,00-50,00 TL fiyat aralığından\n", 1)
    assert not read_source("E2", plant, "MEPET").derived


def test_an_e2_row_whose_sums_do_not_hold_gives_no_table_amount() -> None:
    broken = form(844819).replace("1.000.000 0 1.000.000 0 1.000.000", "1.000.000 0 1.000.000 0 7.000.000")
    assert Decimal(1_000_000) not in read_source("E2", broken.replace("1.000.000-TL", "x"), "MEPET").values


# ── the attachment path ──────────────────────────────────────────────────
VERIFIED: Final = AttachmentFacts(
    "read",
    rows=(
        {
            "date": "2026-10-30",
            "buy_nominal_try": "111110",
            "sell_nominal_try": "12180",
            "net_nominal_try": "98930",
            "start_nominal_try": "1707513",
            "end_nominal_try": "1806443",
        },
    ),
    price_low=Decimal("9.79"),
    price_high=Decimal("9.94"),
)


def test_verified_attachment_rows_are_read_without_the_holding_columns() -> None:
    amounts = read_source("E2", "Pay Alım Satım Bildirimi", "ETYAT", attachment=VERIFIED)
    assert {Decimal(111_110), Decimal(12_180), Decimal(98_930)} <= set(amounts.written)
    assert Decimal(1_806_443) not in amounts.values and Decimal(1_707_513) not in amounts.values
    assert (Decimal(123_290), "table_sum") in amounts.derived  # bought + sold


def test_derived_values_use_the_verified_price_range() -> None:
    amounts = read_source("E2", "Pay Alım Satım Bildirimi", "ETYAT", attachment=VERIFIED)
    assert (Decimal(111_110) * Decimal("9.865"), "nominal_x_price") in amounts.derived


def test_amount_basis_says_where_a_match_came_from() -> None:
    amounts = source("E1", 844786, "TAVHL")
    assert amount_basis(Decimal(60_000), amounts) == "written"
    assert amount_basis(Decimal(sum(ROW_844786)), amounts) == "table_sum"
    assert amount_basis(Decimal(1), amounts) is None and amount_basis(None, amounts) is None
