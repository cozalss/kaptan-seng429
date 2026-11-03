"""The DayCounters document from its aggregate row."""

from __future__ import annotations

from datetime import UTC, datetime

from kaptan.disclosures.counters import counters_from_row


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
    assert out["as_of"] == "2027-01-11T10:40:00.000Z"
    assert (out["llm_calls"], out["llm_tokens"]) == (0, 10)  # the real count, no floor
