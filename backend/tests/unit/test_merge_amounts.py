"""regex_amounts: TL amounts in a disclosure, plus monthly equivalents for a stated duration."""

from decimal import Decimal

from kaptan.agents.nodes.merge import amount_in_text, regex_amounts


def test_finds_turkish_formatted_amounts_once() -> None:
    assert regex_amounts("Bedel 1.200.000 TL; tekrar 1.200.000 TL.") == [Decimal("1200000")]


def test_adds_monthly_equivalents_for_an_integer_duration() -> None:
    assert Decimal("50000") in regex_amounts("Toplam 1.200.000 TL", duration_months=24)


def test_accepts_a_float_duration_from_a_model() -> None:
    # A live model may answer 24.0 or 24.5; this used to raise TypeError (Decimal / float).
    assert Decimal("50000") in regex_amounts("Toplam 1.200.000 TL", duration_months=24.0)
    assert Decimal("48980") in regex_amounts("Toplam 1.200.000 TL", duration_months=24.5)


def test_amount_in_text_uses_a_half_percent_tolerance() -> None:
    assert amount_in_text(Decimal("1205000"), [Decimal("1200000")]) is True
    assert amount_in_text(Decimal("1300000"), [Decimal("1200000")]) is False
    assert amount_in_text(None, [Decimal("1200000")]) is None
