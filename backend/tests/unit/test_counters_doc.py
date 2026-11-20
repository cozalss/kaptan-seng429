"""The DayCounters document from its aggregate row."""

from __future__ import annotations

from datetime import UTC, datetime

from kaptan.disclosures.counters import counters_from_row, deferred_reason_tr


def test_counters_from_row() -> None:
    row = {
        "total": 213,
        "noise": 61,
        "processed": 14,
        "e_candidates": 12,
        "proposals": 5,
        "approvals": 1,
        "rejections": 1,
        "llm_calls": None,
        "llm_tokens": 10,
    }
    out = counters_from_row(row, datetime(2027, 1, 11, 10, 40, tzinfo=UTC))
    assert out["archived"] == 213 - 61 - 14
    assert out["deferred_reason_tr"] is None
    assert out["as_of"] == "2027-01-11T10:40:00.000Z"
    assert (out["llm_calls"], out["llm_tokens"]) == (0, 10)  # the real count, no floor


def test_deferred_reason_is_one_known_sentence_or_nothing() -> None:
    hourly = "Saatlik okuma sınırı doldu; sıradakiler bir sonraki saatte okunacak."
    assert deferred_reason_tr(3, "hourly_cap") == hourly == deferred_reason_tr(1, "hourly_reserved")
    assert deferred_reason_tr(2, "daily_cap") == "Günlük okuma sınırı doldu; kalanlar yarın okunacak."
    assert deferred_reason_tr(2, "llm_daily_cap") == "Yapay zekâ sağlayıcılarının bugünkü ücretsiz kotası doldu."
    assert deferred_reason_tr(0, "hourly_cap") is None  # nothing waits: nothing to explain
    assert deferred_reason_tr(2, "something_new") is None  # a reason the code does not know is not guessed
    assert deferred_reason_tr(2, None) is None
