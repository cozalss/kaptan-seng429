"""06 §3.2 and 05 Ö-4 on real attachments: an institution's threshold notice is not an E2; a manager or a controlling
shareholder buying is. The holder comes from the form and the stake from the verified table, never from a model."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any, Final

import pytest

from kaptan.agents.reader_facts import THRESHOLD_STEP_NOTE, AttachmentFacts, ground_insider, is_threshold_notice
from kaptan.ingest.attachments import AttachmentRef, StoredAttachment, clean_extracted, compose_text, extract_attachment
from kaptan.ingest.parsers.insider_holder import holder_kind
from kaptan.llm.provider import fingerprint
from kaptan.rules.engine import decide
from kaptan.rules.events import Check, RuleInput, e2_insider_role
from kaptan.rules.params import DEFAULT_PARAMS
from tests.harness.replay import Cassette, ReplayProvider, recording_of
from tests.harness.scenario import run_graph
from tests.unit.agent_fixtures import context_for, fixture_run

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


def rule_input(doc: dict[str, Any]) -> RuleInput:
    """The fields `agents.nodes.decide.rule_input` takes from the Reader's document for an E2."""
    return RuleInput(
        event_type="E2",
        ticker="TSTEB",
        insider_role=doc["role"],
        insider_threshold_notice=bool(doc.get("holder_threshold_notice")),
        insider_open_market=True,
        insider_net_buy_value_try=5_000_000.0,
    )


def role_check(doc: dict[str, Any]) -> Check:
    return e2_insider_role(rule_input(doc), DEFAULT_PARAMS)


@pytest.mark.parametrize("index", STOPPED)
def test_an_institutions_threshold_notice_stops_with_the_reason(index: str) -> None:
    # "executive" is the trap: these forms print the signatory's title ("Senior Manager", "Vice President")
    check = role_check(ground(index, "executive"))
    assert check.passed is False
    assert check.detail_tr == "Kurumsal yatırımcının pay eşiği bildirimi E2 değildir."


@pytest.mark.parametrize("index", STOPPED)
def test_the_rule_engine_ends_the_run_there_and_the_trace_says_why(index: str) -> None:
    result = decide(rule_input(ground(index, "executive")), DEFAULT_PARAMS)
    assert (result.outcome, result.reason_codes) == ("NO_TRADE", ("E2_RULE_NOT_MET",))
    last = result.as_document()["trace"][-1]  # type: ignore[index]
    assert (last["rule"], last["passed"], last["observed"]) == ("E2.insider_role", False, "kurumsal yatırımcı")
    assert last["detail_tr"] == "Kurumsal yatırımcının pay eşiği bildirimi E2 değildir."


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


# -- the whole graph ------------------------------------------------------
E2_RUN: Final = "run-day-e2-orncm"  # a recorded E2 whose Reader says "board_member" and that ends in a proposal


async def graph_state(index: str) -> dict[str, Any]:
    """The recorded E2 run again, reading a real attachment: same model answers, the form and its table changed."""
    ctx = context_for(E2_RUN)
    text = run_text(index)
    recorded = replace(recording_of(fixture_run(E2_RUN)), fingerprint=fingerprint(ctx.disclosure.ticker, text))
    disclosure = replace(ctx.disclosure, text_tr=text, attachment=AttachmentFacts("read", rows=rows_of(index)))
    ctx = replace(ctx, provider=ReplayProvider(Cassette([recorded])), disclosure=disclosure)
    return dict(await run_graph(ctx, f"e2-holder-{index}"))


@pytest.mark.parametrize("index", STOPPED)
async def test_through_the_graph_an_institutions_notice_is_no_trade_and_the_trace_says_why(index: str) -> None:
    state = await graph_state(index)
    assert state["reader"]["role"] == "other_5pct_holder" and state["reader"]["holder_threshold_notice"] is True
    reader_step = next(s for s in state["steps"] if s["node"] == "reader")
    assert reader_step["note_tr"] == THRESHOLD_STEP_NOTE
    rules = state["rules"]
    assert (rules["outcome"], rules["reason_codes"]) == ("NO_TRADE", ["E2_RULE_NOT_MET"])
    assert rules["trace"][-1]["rule"] == "E2.insider_role" and rules["trace"][-1]["passed"] is False
    assert state["outcome"] == "NO_TRADE" and state.get("proposal") is None and state.get("approval_card") is None


async def test_through_the_graph_a_chairmans_notice_passes_the_role_rule_without_the_note() -> None:
    state = await graph_state("1683269")
    assert state["reader"]["role"] == "board_member" and "holder_threshold_notice" not in state["reader"]
    assert next(s for s in state["steps"] if s["node"] == "reader")["note_tr"] is None
    role = next(c for c in state["rules"]["trace"] if c["rule"] == "E2.insider_role")
    assert role["passed"] is True
