"""The one meaning of "important": rule-made lines, tones, the model line's checks, the suggestion words (pure)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from kaptan.signal.lines import fallback
from kaptan.signal.llm import cache_version, validate
from kaptan.signal.store import mine_of, panel_path, signal_of, suggestion_of

NOW = datetime(2026, 11, 24, 9, 0, tzinfo=UTC)


def row(subject: str, route: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "disclosure_index": 5,
        "primary_ticker": "ABCDE",
        "stock_codes": ["ABCDE"],
        "company_name": "Deneme A.Ş.",
        "subject": subject,
        "summary": "",
        "subject_route": route,
        "is_noise": False,
        "origin": "kap",
        "reason": "NEW",
        "published_at": datetime(2026, 11, 24, 6, 0, tzinfo=UTC),
        "fin_year": None,
        "fin_period": None,
        "parsed": {},
    }
    return {**base, **kw}


def make(r: dict[str, Any], held: set[str] | None = None, watched: set[str] | None = None, **kw: Any) -> Any:
    extra = {"revenue": None, "model": None, "run": None, "now": NOW, **kw}
    return signal_of(r, held or set(), watched or set(), **extra)


def test_buyback_says_who_how_much_and_at_what_price_only_when_parsed() -> None:
    latest = {"date": "2026-11-20", "price_try": "33.76", "nominal_try": "12000"}
    sig, _ = make(row("Pay Geri Alım", "E1", parsed={"status": "ok", "latest": latest}))
    assert sig.important and sig.kind == "buyback" and sig.tone == "olumlu"
    assert "12.000 adet" in sig.line_tr and "33,76 ₺" in sig.line_tr and len(sig.line_tr) <= 140
    bare, _ = make(row("Pay Geri Alım", "E1", parsed={"status": "partial"}))
    assert "₺" not in bare.line_tr and not any(c.isdigit() for c in bare.line_tr)


def test_insider_direction_decides_the_tone() -> None:
    buy, _ = make(row("Pay Alım Satım Bildirimi", "E2", parsed={"status": "ok", "direction": "buy"}))
    sell, _ = make(row("Pay Alım Satım Bildirimi", "E2", parsed={"status": "ok", "direction": "sell"}), held={"ABCDE"})
    assert (buy.tone, sell.tone) == ("olumlu", "olumsuz")
    assert "aldı" in buy.line_tr and "sattı" in sell.line_tr
    assert sell.so_what_tr is not None and "Elindeki" in sell.so_what_tr


def test_contract_compares_the_amount_with_the_company_size_when_known() -> None:
    parsed = {"status": "ok", "amounts": [{"value": 50_000_000, "currency": "TRY"}]}
    sig, _ = make(row("Yeni İş İlişkisi", "E3", parsed=parsed), revenue=1_000_000_000.0)
    assert "50 milyon" in sig.line_tr.replace(",00", "") and "%5,0" in sig.line_tr
    plain, reading = make(row("Yeni İş İlişkisi", "E3", parsed=parsed))
    assert "cirosunun" not in plain.line_tr and not reading.thin
    unknown, thin = make(row("Yeni İş İlişkisi", "E3"))
    assert thin.thin and unknown.tone == "belirsiz"


def test_earnings_name_only_the_period() -> None:
    sig, thin = make(row("Finansal Rapor", "E4", fin_year=2026, fin_period="3"))
    assert sig.line_tr == "2026 üçüncü çeyrek finansal tablolarını açıkladı." and thin.thin and sig.tone == "belirsiz"


def test_capital_tells_bedelli_from_bedelsiz() -> None:
    free, _ = make(row("Sermaye Artırımı veya Azaltımı Bildirimi", "llm", summary="Bedelsiz Sermaye Artırımı"))
    paid, _ = make(row("Sermaye Artırımı veya Azaltımı Bildirimi", "llm", summary="Bedelli sermaye artırımı"))
    assert "Bedelsiz" in free.line_tr and "Bedelli" in paid.line_tr


def test_spk_restriction_is_negative() -> None:
    sig, _ = make(row("Tedbir", "avoid:spk_tedbir"))
    assert sig.kind == "restriction" and sig.tone == "olumsuz"


def test_noise_corrections_and_unknown_subjects_are_not_important() -> None:
    for r in (
        row("Devre Kesici", "noise", is_noise=True),
        row("Finansal Rapor", "E4", reason="CORR"),
        row("Sorumluluk Beyanı", "archive_only"),
        row("Finansal Rapor", "E4", primary_ticker=None, stock_codes=[]),
    ):
        sig, _ = make(r)
        assert sig.important is False and sig.kind is None and sig.tone == "belirsiz" and sig.suggestion_tr is None


def test_held_wins_over_watched_and_other_codes_count() -> None:
    r = row("x", "E4", stock_codes=["ABCDE", "OTHER"])
    assert mine_of(r, {"ABCDE"}, {"ABCDE"}) == "held"
    assert mine_of(r, set(), {"ABCDE"}) == "watched"
    assert mine_of(r, {"OTHER"}, set()) == "held"
    assert mine_of(r, set(), set()) is None


def test_a_stored_model_line_replaces_only_a_thin_rule_line() -> None:
    model = {"line": "Yıllık kâr arttı.", "tone": "olumlu", "so_what": None}
    thin, _ = make(row("Finansal Rapor", "E4", fin_year=2026, fin_period="4"), watched={"ABCDE"}, model=model)
    assert thin.line_tr == "Yıllık kâr arttı."
    not_mine, _ = make(row("Finansal Rapor", "E4", fin_year=2026, fin_period="4"), model=model)
    assert "finansal tablolarını" in not_mine.line_tr
    sure, _ = make(
        row("Pay Alım Satım Bildirimi", "E2", parsed={"status": "ok", "direction": "buy"}), held={"ABCDE"}, model=model
    )
    assert "aldı" in sure.line_tr


def test_the_fallback_is_the_subject_with_unknown_tone() -> None:
    sig = fallback("Özel Durum Açıklaması (Genel)")
    assert sig.line == "Özel Durum Açıklaması (Genel)" and sig.tone == "belirsiz" and sig.so_what is None
    assert len(fallback("a" * 500).line) <= 140


def test_the_deep_link_opens_that_disclosure_on_its_istanbul_day() -> None:
    late = datetime(2026, 11, 23, 22, 30, tzinfo=UTC)  # 01:30 on the 24th in Istanbul
    assert panel_path(77, late) == "/bildirimler?gun=2026-11-24&bildirim=77"


@pytest.mark.parametrize(
    ("run", "held", "want"),
    [
        (None, False, None),
        ({"outcome": "PROPOSE", "approval": "pending", "side": "buy", "expires_at": NOW + timedelta(hours=1)}, False,
         "KAPtan: al önerisi hazır"),
        ({"outcome": "PROPOSE", "approval": "pending", "side": "sell", "expires_at": NOW + timedelta(hours=1)}, True,
         "KAPtan: sat önerisi hazır"),
        ({"outcome": "PROPOSE", "approval": "pending", "side": "buy", "expires_at": NOW - timedelta(hours=1)}, False,
         "KAPtan: önerinin süresi geçti"),
        ({"outcome": "PROPOSE", "approval": "approved", "side": "buy", "expires_at": None}, False,
         "KAPtan: önerini onayladın"),
        ({"outcome": "NO_TRADE"}, True, "KAPtan: tut"),
        ({"outcome": "NO_TRADE"}, False, "KAPtan: işlem önermiyor"),
        ({"outcome": "HOLD"}, True, None),
    ],
)  # fmt: skip
def test_the_suggestion_comes_from_the_latest_run(run: dict[str, Any] | None, held: bool, want: str | None) -> None:
    assert suggestion_of(run, is_held=held, now=NOW) == want


GOOD = {"line": "Şirket 2025 yılı kârını açıkladı.", "tone": "olumlu", "so_what": "Kâr artmış görünüyor."}
TEXT = "Şirketimizin 2025 yılı net dönem kârı 120.000 TL olarak gerçekleşmiştir."


def test_a_model_answer_is_kept_only_when_it_is_checked() -> None:
    kept = validate(GOOD, TEXT)
    assert kept is not None and kept.tone == "olumlu" and not kept.thin
    assert validate({**GOOD, "line": "x" * 141}, TEXT) is None  # too long
    assert validate({**GOOD, "tone": "harika"}, TEXT) is None  # not in the list
    assert validate({**GOOD, "line": "Kâr 999 milyon oldu."}, TEXT) is None  # a number the text does not have
    assert validate({**GOOD, "line": "Kâr 120.000 TL oldu."}, TEXT) is not None  # a number it does have
    assert validate({**GOOD, "so_what": "Hemen al."}, TEXT) is None  # advice
    assert validate({**GOOD, "so_what": "y" * 201}, TEXT) is None
    assert validate({**GOOD, "line": "  "}, TEXT) is None


def test_the_cache_key_carries_the_prompt_version_and_hash() -> None:
    assert cache_version().startswith("liner@1.1.0:") and len(cache_version().split(":")[1]) == 8


def test_the_missed_note_says_the_gap_and_the_carried_messages() -> None:
    from kaptan.brief.missed import carried_sentence, gap_sentence
    from kaptan.text.turkish import IST

    gap = {
        "from": datetime(2026, 11, 23, 22, 10, tzinfo=IST),
        "to": datetime(2026, 11, 24, 7, 40, tzinfo=IST),
        "hours": 9.5,
    }
    said = gap_sentence(gap, datetime(2026, 11, 24, 8, 45, tzinfo=IST))
    assert said is not None and "dün 22:10'dan 07:40'a kadar kapalıydı" in said
    assert gap_sentence({**gap, "hours": 0.2}, datetime(2026, 11, 24, 8, 45, tzinfo=IST)) is None  # a blink is not news
    assert gap_sentence(gap, datetime(2026, 11, 27, 8, 45, tzinfo=IST)) is None  # too old
    assert gap_sentence(None, NOW) is None
    assert carried_sentence(0) is None and "3 bildirim" in (carried_sentence(3) or "")
