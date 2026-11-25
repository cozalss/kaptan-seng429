"""The reports' pure parts: what the person did, the plain sentences, the replay of the ledger, the periods."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest

from kaptan.prices.calendar import IST
from kaptan.reports.karne import parse_period, replay
from kaptan.reports.quiet import reason_of, sentence
from kaptan.reports.track import Outcome, decision_of, result_text, summarize
from kaptan.reports.words import day_locative, moved, signed

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=IST)
FUTURE = datetime(2026, 11, 21, 9, 50, tzinfo=IST)
PAST = datetime(2026, 11, 19, 9, 50, tzinfo=IST)


@pytest.mark.parametrize(
    ("status", "ticket", "skipped", "expires", "want"),
    [
        ("approved", "entered", False, PAST, "took"),
        ("approved", "awaiting", False, PAST, "approved_open"),
        ("approved", "unfilled", False, PAST, "not_bought"),
        ("rejected", None, False, PAST, "declined"),
        ("pending", None, True, FUTURE, "skipped"),
        ("pending", None, False, PAST, "expired"),
        ("expired", None, False, PAST, "expired"),
        ("pending", None, False, FUTURE, "waiting"),
        ("cancelled", None, False, PAST, "cancelled"),
    ],
)
def test_what_the_person_did(status: str, ticket: str | None, skipped: bool, expires: datetime, want: str) -> None:
    assert decision_of(status, ticket, skipped, expires, NOW) == want


def item(
    ratio: float | None, decision: str = "took", index: float | None = 0.01, status: str = "done"
) -> dict[str, object]:
    return {
        "ticker": "AAAA",
        "company_name": "A",
        "decision": decision,
        "status": status,
        "return_ratio": ratio,
        "index_ratio": index,
    }


def test_no_suggestion_is_said_plainly() -> None:
    s = summarize([])
    assert s["headline_tr"] == "KAPtan henüz sana öneri vermedi." and s["caveat_tr"] is None and s["best"] is None


def test_open_periods_are_not_results() -> None:
    s = summarize([item(None, status="open"), item(None, status="open")])
    assert (s["count"], s["done"], s["open"], s["avg_ratio"]) == (2, 0, 2, None)
    assert "süresi henüz dolmadı" in s["headline_tr"] and s["caveat_tr"] is None


def test_few_results_get_the_honest_caveat_and_the_comparison() -> None:
    s = summarize([item(0.05), item(-0.02, "skipped"), item(0.0001, "declined"), item(0.03, "took")])
    assert (s["up"], s["down"], s["flat"]) == (2, 1, 1)
    assert s["avg_ratio"] == pytest.approx(0.015025)
    assert s["best"]["ratio"] == 0.05 and s["worst"]["ratio"] == -0.02
    assert "Henüz 4 öneri sonuçlandı; bu kadar azla bir şey söylemek erken." in s["caveat_tr"]
    assert "komisyon yok" in s["caveat_tr"]
    assert s["you_took"] == {"n": 2, "avg_ratio": pytest.approx(0.04)}
    assert s["you_skipped"]["n"] == 2 and "Her öneriyi izleseydin" in s["compare_tr"]


def test_nothing_taken_says_so() -> None:
    s = summarize([item(0.01, "skipped")])
    assert "hiçbir öneriyi almadın" in s["compare_tr"]


def test_a_period_without_prices_is_left_out_of_every_average() -> None:
    s = summarize([item(0.04), item(None, status="no_data")])
    assert (s["done"], s["no_data"], s["avg_ratio"]) == (1, 1, 0.04)


def test_the_result_text_never_invents() -> None:
    open_ = Outcome(date(2026, 11, 24), date(2026, 12, 6), 6, "open")
    assert result_text(open_) == "Sonuç 6 Aralık'ta belli olur"
    assert "fiyat kaydı bulunamadı" in result_text(Outcome(date(2026, 11, 2), date(2026, 11, 9), 6, "no_data"))
    done = Outcome(date(2026, 11, 2), date(2026, 11, 9), 6, "done", 0.032, 0.01)
    assert result_text(done) == "2 Kasım – 9 Kasım arasında +%3,2 (aynı günlerde BIST 100 +%1)"


def test_words() -> None:
    assert day_locative(date(2026, 9, 3)) == "3 Eylül'de" and day_locative(date(2026, 11, 3)) == "3 Kasım'da"
    assert signed(-0.011) == "−%1,1" and moved(0.032, "BIST 100") == "BIST 100 %3,2 arttı"
    assert moved(0.0001, "paran") == "paran değişmedi"


def test_the_quiet_sentence_follows_the_numbers() -> None:
    assert sentence(0, 0, 0, [], None) == "Bugün KAP'tan henüz yeni bildirim gelmedi."
    assert sentence(312, 9, 0, [("olay KAPtan'ın aradığı ölçülere uymadı", 7)], None).startswith(
        "Bugün 312 bildirim okundu; 9 tanesine yakından bakıldı, hiçbiri öneriye dönüşmedi. En sık neden:"
    )
    assert sentence(40, 0, 0, [], None) == "Bugün 40 bildirim okundu; hiçbiri senin için ilgili değildi."
    assert sentence(40, 3, 1, [], None) == "Bugün 40 bildirim okundu; 1 öneri çıktı."
    assert (
        sentence(40, 0, 0, [], "Günlük okuma sınırı doldu.") == "Bugün 40 bildirim okundu; günlük okuma sınırı doldu."
    )


def test_the_reason_of_a_run() -> None:
    row = {"checks": None, "compliance": None, "rule_decision": {"reason_codes": ["E3_RULE_NOT_MET"]}}
    assert reason_of(row) == "olay KAPtan'ın aradığı ölçülere uymadı"
    gate = {"checks": [{"outcome": "reject", "rule_code": "R02"}], "compliance": None, "rule_decision": None}
    assert "günlük zarar sınırı" in reason_of(gate)
    # No rule code: never the circular "kurallar geçmedi"; an IGNORE reading says what it really was.
    assert (
        reason_of({"checks": None, "compliance": None, "rule_decision": None})
        == "olay KAPtan'ın öneri ölçülerine uymadı"
    )
    ignored = {"event_type": "IGNORE", "checks": None, "compliance": None, "rule_decision": None}
    assert reason_of(ignored) == "duyuru KAPtan'ın öneri verdiği olay türlerinden değildi"
    assert "kurallar" not in sentence(373, 7, 0, [(reason_of(ignored), 3)], None)


def ledger_row(kind: str, day: int, **kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "kind": kind, "occurred_at": datetime(2026, 11, day, 11, 0, tzinfo=IST), "amount_try": Decimal(1),
        "cash_delta": Decimal(0), "capital_delta": Decimal(0), "flow_try": Decimal(0), "ticker": None,
        "qty_delta": 0, "price": None, "commission_try": Decimal(0),
    }  # fmt: skip
    return {**base, **kw}


def test_the_replay_books_realized_costs_and_flows() -> None:
    rows = [
        ledger_row("start", 1, capital_delta=Decimal(1000), flow_try=Decimal(1000)),
        ledger_row("buy", 2, ticker="AAAA", qty_delta=10, price=Decimal(10), commission_try=Decimal(2)),
        ledger_row("sell", 5, ticker="AAAA", qty_delta=-4, price=Decimal(12), commission_try=Decimal(1)),
        ledger_row("buy", 25, ticker="AAAA", qty_delta=1, price=Decimal(9)),
    ]
    rep = replay(rows, datetime(2026, 11, 1, tzinfo=IST), datetime(2026, 12, 1, tzinfo=IST))
    # avg cost (100 + 2) / 10 = 10.2; sold 4 at 12 less 1 fee: 47 - 40.8
    assert rep.realized == Decimal("6.2") and rep.commissions == Decimal(3)
    assert (rep.put_in, rep.flow, rep.dividends) == (Decimal(1000), Decimal(1000), None)
    assert rep.cost is not None and rep.cost["AAAA"][0] == 7
    later = replay(rows, datetime(2026, 11, 5, tzinfo=IST), datetime(2026, 12, 1, tzinfo=IST))
    assert later.seen_before and later.put_in == 0 and later.realized == Decimal("6.2")


def test_periods() -> None:
    m = parse_period("month", "2026-02")
    assert (m.start, m.end, m.label) == (date(2026, 2, 1), date(2026, 2, 28), "Şubat 2026")
    y = parse_period("year", "2026")
    assert (y.start, y.end, y.label) == (date(2026, 1, 1), date(2026, 12, 31), "2026")
    with pytest.raises(ValueError):
        parse_period("month", "2026")
