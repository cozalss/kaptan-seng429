"""The pure parts of the company page, search, watchlist and disclosure reading (no database)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from kaptan.alerts.messages import message_for
from kaptan.alerts.watch import feed_hits_watchlist
from kaptan.companies.profile import decision_of, following_sentence, position_view
from kaptan.companies.search import clean_query, rank_company
from kaptan.companies.watch import change_pct
from kaptan.disclosures.reading import numbers_of

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


def test_search_ignores_turkish_letter_variants() -> None:
    assert rank_company("turk hava", "THYAO", "Türk Hava Yolları A.O.") == 2
    assert rank_company("TÜRK HAVA", "THYAO", "Türk Hava Yolları A.O.") == 2
    assert rank_company("isbank", "ISCTR", "İş Bankası") is None  # "is bankasi" is two words, not "isbank"
    assert rank_company("iş", "ISCTR", "İş Bankası") == 1  # "is" is also the start of the code
    assert rank_company("bankası", "ISCTR", "İş Bankası") == 3


def test_search_ranks_exact_ticker_first_and_rejects_noise() -> None:
    assert rank_company("thyao", "THYAO", "Türk Hava Yolları") == 0
    assert rank_company("hava", "THYAO", "Türk Hava Yolları") == 3
    assert rank_company("yolla", "THYAO", "Türk Hava Yolları") == 3
    assert rank_company("zzz", "THYAO", "Türk Hava Yolları") is None
    assert rank_company("   ", "THYAO", "Türk Hava Yolları") is None


def test_query_is_trimmed_and_capped() -> None:
    assert clean_query("  aselsan ") == "aselsan"
    assert len(clean_query("a" * 500)) == 60


def test_change_needs_two_closes() -> None:
    assert change_pct(None) is None
    assert change_pct([Decimal("10")]) is None
    assert change_pct([Decimal("11"), Decimal("10")]) == 10.0
    assert change_pct([Decimal("9"), Decimal("10")]) == -10.0


def test_following_says_why_in_plain_words() -> None:
    inside = following_sentence(True, None, [])
    assert inside == {"in_universe": True, "known": True, "reasons_tr": []}
    out = following_sentence(False, None, ["U2", "U9"])
    assert out["in_universe"] is False and len(out["reasons_tr"]) == 1 and "hacmi" in out["reasons_tr"][0]
    assert following_sentence(False, "include", ["U2"])["in_universe"] is True
    excluded = following_sentence(True, "exclude", [])
    assert excluded["in_universe"] is False and excluded["reasons_tr"] == ["Sen bu şirketi dışarıda bıraktın."]
    assert following_sentence(None, None, [])["known"] is False


def test_decisions_are_said_plainly() -> None:
    base = {"run_id": "r1", "disclosure_index": 5, "event_type": "E1", "started_at": NOW, "proposal_id": None}
    held = decision_of({**base, "kind": "hold", "approval_status": None, "side": None})
    assert held is not None and held["decision"] == "held" and held["proposal_id"] is None
    assert decision_of({**base, "kind": "archived", "approval_status": None, "side": None}) is None
    sug = decision_of({**base, "kind": "propose", "proposal_id": "p1", "approval_status": "approved", "side": "sell"})
    assert sug is not None and sug["why_tr"] == "Satmanı önerdim, onayladın." and sug["proposal_id"] == "p1"
    veto = decision_of({**base, "kind": "pregate_veto", "approval_status": None, "side": None})
    assert veto is not None and veto["decision"] == "vetoed"


def test_position_gain_follows_the_last_close() -> None:
    assert position_view(None, Decimal("10")) is None
    row = {"qty": 100, "avg_cost": Decimal("10"), "since": NOW}
    held = position_view(row, Decimal("11"))
    assert held is not None and held["gain_try"] == 100.0 and held["gain_pct"] == 10.0
    unpriced = position_view(row, None)
    assert unpriced is not None and unpriced["gain_try"] is None


def test_numbers_come_from_the_stored_document() -> None:
    doc = {
        "denominator": {"name": "Yıllık satış", "value": 1000, "ref_id": "a"},
        "market_cap": None,
        "secondary": [
            {"name": "Yıllık satış", "value": 5, "ref_id": "b"},
            {"name": "Kur", "value": 30.5, "ref_id": "c"},
        ],
        "e4_lines": [{"name": 1}],
    }
    assert numbers_of(doc) == [{"name": "Yıllık satış", "value": 1000.0}, {"name": "Kur", "value": 30.5}]
    assert numbers_of(None) == []


def _entry(offset: timedelta, codes: list[str], event: str = "disclosure") -> tuple[str, dict[str, str]]:
    ms = int((NOW - offset).timestamp() * 1000)
    data = {"primary_ticker": codes[0] if codes else None, "stock_codes": codes}
    return f"{ms}-0", {"event": event, "data": json.dumps(data)}


def test_feed_alert_fires_only_for_a_recent_watched_company() -> None:
    watched = frozenset({"THYAO"})
    assert feed_hits_watchlist([_entry(timedelta(minutes=1), ["THYAO"])], watched, NOW)
    assert feed_hits_watchlist([_entry(timedelta(minutes=1), ["ASELS", "THYAO"])], watched, NOW)
    assert not feed_hits_watchlist([_entry(timedelta(minutes=1), ["ASELS"])], watched, NOW)
    assert not feed_hits_watchlist([_entry(timedelta(hours=2), ["THYAO"])], watched, NOW)
    assert not feed_hits_watchlist([_entry(timedelta(minutes=1), ["THYAO"], event="counters")], watched, NOW)
    assert not feed_hits_watchlist([_entry(timedelta(minutes=1), ["THYAO"])], frozenset(), NOW)


def test_the_watch_alert_names_no_company() -> None:
    text = message_for("watch")
    assert text == "KAPtan: izlediğin bir şirketten yeni bildirim var."
