"""06 §3.2 and 05 Ö-4 on real attachments: an institution's threshold notice is not an E2; a manager or a controlling
shareholder buying is. The holder comes from the form and the stake from the verified table, never from a model."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

import pytest

from kaptan.agents.reader_facts import AttachmentFacts, ground_insider, is_threshold_notice
from kaptan.ingest.attachments import AttachmentRef, StoredAttachment, clean_extracted, compose_text, extract_attachment
from kaptan.ingest.parsers.insider_holder import holder_kind
from kaptan.rules.events import RuleInput, e2_insider_role
from kaptan.rules.params import DEFAULT_PARAMS

ATT: Final = Path(__file__).resolve().parents[1] / "fixtures" / "kap_attachments"
SAMPLES: Final[dict[str, dict[str, Any]]] = json.loads((ATT / "manifest.json").read_text("utf-8"))["disclosures"]
STOPPED: Final = ("1690390", "1690912", "1688643", "1690404")  # FMR, BofA twice, CVI
PASSING: Final = ("1683269", "1690388", "1690392", "1688677", "1689652")
KEYS: Final = (
    "date",
    "buy_nominal_try",
    "sell_nominal_try",
    "net_nominal_try",
    "start_nominal_try",
    "end_nominal_try",
    "start_capital_pct",
    "start_vote_pct",
    "end_capital_pct",
    "end_vote_pct",
)
PERSON_FORM: Final = (
    "Ad Soyad / Ticaret Ünvanı : KİŞİ_1\nTüzel Kişi Adına Bildirimi Yapanın Adı Soyadı :\nGörevi : Genel Müdür\n"
)
ENTITY_FORM: Final = (
    "Ad Soyad / Ticaret Ünvanı : ÖRNEK HOLDİNG AŞ\nTüzel Kişi Adına Bildirimi Yapanın Adı Soyadı : KİŞİ_1\n"
    "Görevi : Genel Koordinatör\n"
)


def sample_text(index: str) -> str:
    name: str = SAMPLES[index]["file"]
    path = ATT / name
    if name.endswith(".txt"):
        return clean_extracted(path.read_text(encoding="utf-8"))
    return extract_attachment(AttachmentRef("0" * 32, "a.pdf", "pdf"), path.read_bytes()).text


def run_text(index: str) -> str:
    """The text a run really gets: the notice body with the attachment in its fenced block."""
    return compose_text("Pay Alım Satım Bildirimi", [StoredAttachment("read", None, sample_text(index))])


def rows_of(index: str) -> tuple[dict[str, Any], ...]:
    return tuple(dict(zip(KEYS, row, strict=True)) for row in SAMPLES[index]["rows"])


def stake(start: str, end: str) -> tuple[dict[str, Any], ...]:
    return ({"start_capital_pct": start, "start_vote_pct": start, "end_capital_pct": end, "end_vote_pct": end},)


def answer(role: str) -> dict[str, Any]:
    return {"kind": "E2", "status": "ok", "role": role, "filer_kind": "person", "notes_tr": "Okundu.", "trades": []}


def ground(index: str, role: str) -> dict[str, Any]:
    return ground_insider(answer(role), AttachmentFacts("read", rows=rows_of(index)), run_text(index))


def role_check(doc: dict[str, Any]) -> Any:
    x = RuleInput(insider_role=doc["role"], insider_threshold_notice=bool(doc.get("holder_threshold_notice")))
    return e2_insider_role(x, DEFAULT_PARAMS)


@pytest.mark.parametrize("index", STOPPED)
def test_an_institutions_threshold_notice_stops_with_the_reason(index: str) -> None:
    # "executive" is the trap: these forms print the signatory's title ("Senior Manager", "Vice President")
    check = role_check(ground(index, "executive"))
    assert check.passed is False
    assert check.detail == "Kurumsal yatırımcının pay eşiği bildirimi E2 değildir."


@pytest.mark.parametrize("index", STOPPED)
def test_the_reader_document_no_longer_claims_the_insider_role(index: str) -> None:
    doc = ground(index, "board_member")
    assert doc["role"] == "other_5pct_holder" and doc["filer_kind"] == "entity"
    assert "eşiği" in doc["notes_tr"]


def test_an_institutions_own_label_is_kept_when_it_is_already_not_an_insider() -> None:
    assert ground("1690390", "investment_fund")["role"] == "investment_fund"


@pytest.mark.parametrize(
    ("index", "role"),
    [
        ("1683269", "board_member"),  # chairman, 67 %
        ("1690392", "board_member"),
        ("1689652", "board_member"),  # chairman, 64 %
        ("1690388", "controlling_shareholder"),  # a person, 17 %
        ("1688677", "controlling_shareholder"),  # a holding company, 48 %, no threshold crossed
    ],
)
def test_a_manager_or_a_controlling_shareholder_still_passes(index: str, role: str) -> None:
    doc = ground(index, role)
    assert doc["role"] == role and "holder_threshold_notice" not in doc
    assert role_check(doc).passed is True


@pytest.mark.parametrize("index", PASSING)
def test_samples_that_are_not_threshold_notices_are_left_alone(index: str) -> None:
    assert is_threshold_notice(run_text(index), rows_of(index)) is False


@pytest.mark.parametrize(
    ("index", "kind"),
    [
        ("1690390", "entity"),
        ("1690912", "entity"),
        ("1688643", "entity"),
        ("1690404", "entity"),
        ("1688677", "entity"),
        ("1683269", "person"),
        ("1690388", "person"),
        ("1690392", "person"),
        ("1689652", "person"),
    ],
)
def test_the_holder_kind_comes_from_the_form(index: str, kind: str) -> None:
    assert holder_kind(run_text(index)) == kind


def test_a_notice_without_an_attachment_names_no_holder() -> None:
    assert holder_kind("Pay Alım Satım Bildirimi") is None


def test_the_signatorys_title_does_not_make_a_person_of_an_institution() -> None:
    text = sample_text("1690390")
    assert "Kıdemli Yöneticisi" in text and holder_kind(text) == "entity"


def test_a_person_crossing_a_threshold_is_not_this_filter() -> None:
    assert is_threshold_notice(PERSON_FORM, stake("4.9", "5.1")) is False


def test_a_company_crossing_a_threshold_stops() -> None:
    assert is_threshold_notice(ENTITY_FORM, stake("4.9", "5.1")) is True


def test_a_company_inside_a_band_is_not_this_filter() -> None:
    assert is_threshold_notice(ENTITY_FORM, stake("6.0", "6.4")) is False


def test_a_company_taking_the_majority_is_a_controlling_shareholder_not_a_threshold_notice() -> None:
    assert is_threshold_notice(ENTITY_FORM, stake("49.9", "50.2")) is False


def test_a_company_with_the_majority_of_votes_is_not_this_filter() -> None:
    row = {"start_capital_pct": "9.9", "start_vote_pct": "60", "end_capital_pct": "10.1", "end_vote_pct": "61"}
    assert is_threshold_notice(ENTITY_FORM, (row,)) is False


def test_no_verified_table_means_no_verdict_from_this_check() -> None:
    assert is_threshold_notice(ENTITY_FORM, ()) is False
    assert is_threshold_notice(ENTITY_FORM, ({"start_capital_pct": None, "end_capital_pct": None},)) is False


def test_an_abstain_stays_an_abstain() -> None:
    doc = ground_insider(
        {**answer("unknown"), "status": "abstain"},
        AttachmentFacts("read", rows=rows_of("1690390")),
        run_text("1690390"),
    )
    assert doc["status"] == "abstain" and "holder_threshold_notice" not in doc
