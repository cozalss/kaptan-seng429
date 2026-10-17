"""kaptan.text.turkish: the i/ı pair, NFC, numbers, KAP dates, encodings, HTML (07 §8)."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from kaptan.text import (
    clean_multiline,
    clean_text,
    decode_bytes,
    join_key,
    nfc,
    norm_key,
    parse_kap_datetime,
    parse_tr_decimal,
    strip_html,
    tr_lower,
    tr_upper,
)


def test_tr_lower_maps_the_i_pair_without_a_combining_dot() -> None:
    assert tr_lower("İSTANBUL IĞDIR ŞİRKET") == "istanbul ığdır şirket"
    assert len(tr_lower("İSTANBUL")) == len("İSTANBUL")
    assert "̇" not in tr_lower("DİYARBAKIR İZMİR")
    assert tr_lower("IŞIK") == "ışık"


def test_tr_upper_round_trips() -> None:
    assert tr_upper("ışık") == "IŞIK"
    assert tr_upper("şişli") == "ŞİŞLİ"


def test_nfc_composes_decomposed_letters() -> None:
    decomposed = unicodedata.normalize("NFD", "Özel Durum Açıklaması")
    assert decomposed != "Özel Durum Açıklaması"
    assert nfc(decomposed) == "Özel Durum Açıklaması"
    assert tr_lower(decomposed) == "özel durum açıklaması"


def test_clean_text_drops_invisible_and_bidi_characters() -> None:
    assert clean_text("  Pay​  Geri‮Alım﻿ \n ") == "Pay GeriAlım"
    assert clean_multiline("a \t b\r\n\r\n  c\xa0d ") == "a b\nc d"


def test_norm_and_join_keys() -> None:
    assert norm_key("İhale Süreci / Sonucu") == "ihale süreci sonucu"
    assert norm_key("Pay  Satış Bilgi Formu") == norm_key("Pay Satış Bilgi Formu")
    assert join_key("DİYARBAKIR") == join_key("Diyarbakir") == "diyarbakir"


@pytest.mark.parametrize(
    ("raw", "value"),
    [
        ("1.234.567,89", Decimal("1234567.89")),
        ("12,5 milyon TL", Decimal("12500000")),
        ("%0,25", Decimal("0.25")),
        ("% 12,47", Decimal("12.47")),
        ("8.628.000", Decimal("8628000")),
        ("1.153.896.940,00TL", Decimal("1153896940")),
        ("13.19", Decimal("13.19")),
        ("-77.884", Decimal("-77884")),
        ("2 milyar", Decimal("2000000000")),
        ("-", None),
        ("", None),
        (None, None),
        ("yok", None),
    ],
)
def test_parse_tr_decimal(raw: str | None, value: Decimal | None) -> None:
    assert parse_tr_decimal(raw) == value


def test_parse_kap_datetime_is_istanbul_local() -> None:
    dt = parse_kap_datetime("28.09.2026 21:49:46")
    offset = dt.utcoffset()
    assert offset is not None and offset.total_seconds() == 3 * 3600
    assert dt.astimezone(UTC) == datetime(2026, 9, 28, 18, 49, 46, tzinfo=UTC)
    assert parse_kap_datetime("2026.10.16 22:07:06").day == 16
    assert parse_kap_datetime("16/10/2026").month == 10
    with pytest.raises(ValueError, match="unrecognised"):
        parse_kap_datetime("dün akşam")


def test_decode_bytes_tries_utf8_before_cp1254() -> None:
    assert decode_bytes("Özel Durum Açıklaması".encode("cp1254")) == ("Özel Durum Açıklaması", "cp1254")
    assert decode_bytes("İşlem".encode()) == ("İşlem", "utf-8")
    assert decode_bytes(b"\xef\xbb\xbfKAP") == ("KAP", "utf-8-sig")


def test_strip_html_keeps_blocks_and_drops_scripts() -> None:
    page = "<div>Şirketimiz&#160;sipariş</div><script>alert(1)</script><p>aldı</p><br/>Kamuoyuna &amp; duyurulur"
    assert strip_html(page) == "Şirketimiz sipariş\naldı\nKamuoyuna & duyurulur"
