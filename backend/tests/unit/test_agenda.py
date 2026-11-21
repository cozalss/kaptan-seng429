"""Calendar sources and the market state: pure parts (agent HOME)."""

from __future__ import annotations

from datetime import UTC, date, datetime

from kaptan.agenda import events, macro, market


def test_meeting_day_needs_exactly_one_date_and_no_cancellation() -> None:
    assert events.meeting_day(
        "Genel Kurul İşlemlerine İlişkin Bildirim", "Olağan Genel Kurul 28.03.2027 tarihinde"
    ) == date(2027, 3, 28)
    assert events.meeting_day("Genel Kurul", "Toplantı 28.03.2027, ikinci toplantı 04.04.2027") is None
    assert events.meeting_day("Genel Kurul İptali", "Genel Kurul 28.03.2027 iptal edildi") is None
    assert events.meeting_day("Genel Kurul", "Ertelendi 28.03.2027") is None
    assert events.meeting_day("Yeni İş İlişkisi", "28.03.2027") is None
    assert events.meeting_day("Genel Kurul", "Tarih 31.02.2027") is None


def test_report_window_is_last_years_day_and_marked_approximate() -> None:
    scope = events.Scope(frozenset({"AAAA"}), frozenset())
    rows = [{"ticker": "AAAA", "disclosure_index": 7, "day": date(2026, 3, 4)}]
    out = events._report_events(rows, scope, date(2027, 3, 1), date(2027, 3, 31))
    assert [(e["day"], e["approximate"], e["why"]) for e in out] == [(date(2027, 3, 4), True, "held")]
    assert events._report_events(rows, scope, date(2027, 4, 1), date(2027, 4, 30)) == []


def test_rate_days_come_from_the_published_table_only() -> None:
    out = events._rate_events(date(2026, 11, 21), date(2026, 12, 31))
    assert [e["day"] for e in out] == [date(2026, 12, 10)]
    assert events._rate_events(date(2027, 1, 1), date(2027, 3, 1)) == []
    assert macro.NOTE_NO_NEXT_YEAR in macro.notes_for(date(2027, 1, 5))
    assert macro.NOTE_NO_NEXT_YEAR not in macro.notes_for(date(2026, 12, 1))
    assert macro.NOTE_NO_INFLATION in macro.notes_for(date(2026, 12, 1))


def test_duplicate_notices_make_one_event() -> None:
    a = events._event("x", date(2026, 12, 1), "dividend_pay", "AAAA", "held", "t", "d", None)
    assert (
        len(
            events._dedupe(
                [a, dict(a), events._event("y", date(2026, 11, 30), "general_meeting", None, None, "t", "d", None)]
            )
        )
        == 2
    )


def test_market_open_closed_and_next_opening() -> None:
    mon_noon = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)  # 12:00 Istanbul
    assert market.market_state(mon_noon) == {"open": True, "label": "Borsa açık", "next_open_day": None}
    sat = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
    assert market.market_state(sat)["next_open_day"] == date(2026, 11, 23)
    early = datetime(2026, 11, 23, 5, 0, tzinfo=UTC)  # 08:00
    assert market.market_state(early) == {"open": False, "label": "Borsa kapalı", "next_open_day": date(2026, 11, 23)}
    late = datetime(2026, 11, 23, 16, 0, tzinfo=UTC)  # 19:00
    assert market.market_state(late)["next_open_day"] == date(2026, 11, 24)
