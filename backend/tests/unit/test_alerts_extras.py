"""Pure parts of wave 5 ALERTS: price levels, muted companies, the generic texts, the backup list, the week."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from kaptan.alerts.messages import MESSAGES
from kaptan.alerts.prefs import decide, default_prefs, with_defaults
from kaptan.alerts.price import is_hit, level_for
from kaptan.alerts.watch import feed_hits_watchlist, kinds_in
from kaptan.ops.backup_list import STALE_AFTER_DAYS, backup_list, taken_at, warning_for
from kaptan.reports.weekly import week_of

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


def _entry(event: str, data: dict[str, object], at: datetime = NOW) -> tuple[str, dict[str, str]]:
    return f"{int(at.timestamp() * 1000)}-0", {"event": event, "data": json.dumps(data)}


def test_presets_move_the_price_by_the_percent() -> None:
    assert level_for("above", 5, Decimal("100")) == Decimal("105.0000")
    assert level_for("below", 10, Decimal("250.50")) == Decimal("225.4500")


def test_a_level_is_hit_at_or_past_it_in_its_direction() -> None:
    assert is_hit("above", Decimal(10), Decimal(10)) and not is_hit("above", Decimal(10), Decimal("9.99"))
    assert is_hit("below", Decimal(10), Decimal(10)) and not is_hit("below", Decimal(10), Decimal("10.01"))


def test_the_new_alert_texts_name_nothing() -> None:
    assert MESSAGES["price"] == "KAPtan: bir fiyat uyarın tetiklendi."
    assert MESSAGES["weekly"] == "KAPtan: haftalık özetin hazır."
    for text in (MESSAGES["price"], MESSAGES["weekly"]):
        assert not any(ch.isdigit() for ch in text) and "₺" not in text


def test_a_muted_company_does_not_ring_the_phone_for_its_suggestion() -> None:
    entries = [_entry("approval.requested", {"status": "pending", "ticker": "THYAO"})]
    assert kinds_in(entries, NOW) == ("suggestion",)
    assert kinds_in(entries, NOW, frozenset({"THYAO"})) == ()
    other = [_entry("approval.requested", {"status": "pending", "ticker": "ASELS"})]
    assert kinds_in(other, NOW, frozenset({"THYAO"})) == ("suggestion",)


def test_a_disclosure_of_a_muted_watched_company_is_not_announced() -> None:
    entries = [_entry("disclosure", {"primary_ticker": "THYAO", "stock_codes": ["THYAO"]})]
    assert feed_hits_watchlist(entries, frozenset({"THYAO"}), NOW)
    assert not feed_hits_watchlist(entries, frozenset(), NOW)


def test_old_documents_get_the_new_kinds_and_an_empty_mute_list() -> None:
    old = {"kinds": {"suggestion": {"phone": False, "desktop": True}}, "quiet": {"on": False}}
    full = with_defaults(old)
    assert full["muted"] == [] and full["kinds"]["price"] == {"phone": True, "desktop": True}
    assert full["kinds"]["suggestion"]["phone"] is False
    assert with_defaults({"muted": ["THYAO", 5]})["muted"] == ["THYAO"]


def test_price_and_weekly_follow_their_own_phone_switch_and_the_quiet_hours() -> None:
    prefs = default_prefs()
    assert decide(prefs, "price", NOW) == "send"
    prefs["kinds"]["weekly"]["phone"] = False
    assert decide(prefs, "weekly", NOW) == "skip"
    prefs["quiet"] = {"on": True, "start": "00:00", "end": "23:59"}
    assert decide(prefs, "price", NOW) == "hold"


def test_a_backup_file_says_when_it_was_taken() -> None:
    assert taken_at("kaptan-20261120T000000Z.dump") == datetime(2026, 11, 20, tzinfo=UTC)
    assert taken_at("kaptan-20261120T000000Z.dump.age") is not None
    assert taken_at("audit-anchors.jsonl") is None and taken_at("kaptan-2026.dump") is None


def test_the_warning_starts_at_two_days_and_a_missing_backup_is_said() -> None:
    assert warning_for(STALE_AFTER_DAYS - 1) is None
    assert "3 gün önce" in (warning_for(3) or "")
    assert "yedek görünmüyor" in (warning_for(None) or "")


def test_the_backup_list_orders_newest_first_with_age(tmp_path: Path) -> None:
    for name in ("kaptan-20261118T030000Z.dump", "kaptan-20261120T030000Z.dump", "notes.txt"):
        (tmp_path / name).write_bytes(b"x" * 10)
    doc = backup_list(str(tmp_path), r"D:\yedek", NOW)
    assert [f["name"] for f in doc["files"]] == ["kaptan-20261120T030000Z.dump", "kaptan-20261118T030000Z.dump"]
    assert doc["available"] and doc["age_days"] == 1 and not doc["stale"] and doc["folder"] == r"D:\yedek"
    assert doc["files"][0]["size_bytes"] == 10
    old = backup_list(str(tmp_path), None, NOW + timedelta(days=5))
    assert old["stale"] and "6 gün önce" in old["warning_tr"]


def test_an_unreadable_or_empty_folder_is_not_the_same_thing(tmp_path: Path) -> None:
    gone = backup_list(str(tmp_path / "yok"), None, NOW)
    assert gone["available"] is False and gone["warning_tr"] is None
    empty = backup_list(str(tmp_path), None, NOW)
    assert empty["available"] and empty["stale"] and "yedek görünmüyor" in empty["warning_tr"]


def test_a_week_runs_monday_to_sunday_and_labels_itself() -> None:
    p = week_of(date(2026, 11, 21))
    assert (p.start, p.end, p.label) == (date(2026, 11, 16), date(2026, 11, 22), "16–22 Kasım 2026")
    across = week_of(date(2026, 12, 31))
    assert across.label == "28 Aralık – 3 Ocak 2027"
