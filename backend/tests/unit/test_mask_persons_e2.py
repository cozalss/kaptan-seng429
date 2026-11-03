"""Person masking on the real E2 shapes the live run leaked (2026-11-02: "Nevhan Gündüz" reached the Reader)."""

from __future__ import annotations

import pytest

from kaptan.llm.mask_persons import mask_persons

NOTICE = (
    "Sermaye Piyasası Kurulu'nun Seri: II, No:15.1 Sayılı Tebliği kapsamında {who}\n"
    "tarafından Kuruluşumuza gönderilen pay alım satım işlemlerine ilişkin açıklama ekte yer almaktadır."
)


@pytest.mark.parametrize(
    "person",
    [
        "Nevhan Gündüz",
        "Feyzi Kıraç",
        "Macit Aydın",
        "Mehmed Nureddin Çevik",
        "Hasan İnanç Kabadayı",
        "Mustafa Latif Topbaş",
        "Mehmet Sinan Tara",
        "Erhan Topaç",
    ],
)
def test_the_person_named_in_a_forwarded_notice_is_masked(person: str) -> None:
    out = mask_persons(NOTICE.format(who=person))
    assert person.split()[0] not in out.text and "KİŞİ_1" in out.text and out.names_masked == 1


@pytest.mark.parametrize(
    "entity",
    [
        "Akça Holding A.Ş.",
        "FMR LLC",
        "FIL Limited",
        "Bank Of America Corporation",
        "CVI Investments Inc.",
        "The Goldman Sachs Group, Inc.",
        "Ordu Yardımlaşma Kurumu Oyak Genel Müdürlüğü",
        "Cevahir Taahhüt İnşaat ve Ticaret A.Ş.",
        "Şekerbank T.A.Ş. Pers. Mun. Sos. Güv. Yard. San. Vakfı",
    ],
)
def test_the_entity_named_in_a_forwarded_notice_stays(entity: str) -> None:
    out = mask_persons(NOTICE.format(who=entity))
    assert entity in out.text and out.names_masked == 0


def test_a_name_broken_across_lines_is_masked_like_any_other() -> None:
    out = mask_persons("Sayın Mustafa Latif\nTopbaş açıkladı. Mustafa Latif Topbaş imzaladı.")
    assert "Topbaş" not in out.text and out.names_masked == 1


@pytest.mark.parametrize(
    ("line", "name"),
    [
        ("Ad Soyad / Ticaret Ünvanı : NEVHAN GÜNDÜZ", "NEVHAN GÜNDÜZ"),
        ("Tüzel Kişi Adına Bildirimi Yapanın Adı Soyadı : Cemal İpekoğlu", "Cemal İpekoğlu"),
        ("Varsa Birlikte Hareket Eden Diğer Gerçek-Tüzel Kişiler : Ayla Kuzu, Veli Kuzu", "Ayla Kuzu"),
        ("Temsil Eden Kişinin\nAdı Soyadı: Aaron Watson", "Aaron Watson"),
        ("İsim Soyisim: James Todd", "James Todd"),
        ("Full Name: David Bradley", "David Bradley"),
    ],
)
def test_the_form_labels_of_an_attachment_anchor_a_name(line: str, name: str) -> None:
    out = mask_persons(line)
    assert name not in out.text and "KİŞİ_1" in out.text


def test_every_person_on_the_acting_in_concert_line_is_masked() -> None:
    out = mask_persons("Varsa Birlikte Hareket Eden Diğer Gerçek-Tüzel Kişiler : Ayla Kuzu, Veli Kuzu")
    assert "Kuzu" not in out.text and out.names_masked == 2


@pytest.mark.parametrize(
    "line",
    ["Ad Soyad / Ticaret Ünvanı : AKÇA HOLDİNG AŞ", "Ad Soyad / Ticaret Ünvanı : FMR LLC"],
)
def test_an_entity_on_the_name_line_is_not_a_person(line: str) -> None:
    assert mask_persons(line).text == line


def test_the_form_labels_themselves_are_not_masked() -> None:
    text = (
        "Görevi : Yönetim Kurulu Başkanı\n"
        "Varsa Birlikte Hareket Eden Diğer Gerçek-Tüzel Kişiler :\n"
        "Tüzel Kişi Adına Bildirimi Yapanın Adı Soyadı :\n"
    )
    assert mask_persons(text).text == text


def test_the_same_person_in_body_and_attachment_gets_one_token() -> None:
    body = NOTICE.format(who="Nevhan Gündüz")
    out = mask_persons(f"{body}\n\nAd Soyad / Ticaret Ünvanı : NEVHAN GÜNDÜZ")
    assert out.names_masked == 1 and out.text.count("KİŞİ_1") == 2
