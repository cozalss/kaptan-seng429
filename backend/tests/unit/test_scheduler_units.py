"""The scheduler's table and its due logic (M3 B1): Istanbul times, the BIST calendar, catch-up, chains."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal

import pytest

from kaptan.prices.calendar import IST
from kaptan.workers import scheduler as s


def ist(y: int, m: int, d: int, hh: int, mm: int) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=IST)


def test_the_table_has_every_job_of_the_day_once() -> None:
    names = [j.name for j in s.JOBS]
    assert len(names) == len(set(names))
    for want in ("issuer_profiles", "universe", "morning_brief", "open_fill", "risk_monitor", "quotes",
                 "eod_prices", "eod_fills", "exits", "pnl_eod", "regime", "audit_anchor", "retention"):  # fmt: skip
        assert want in s.BY_NAME
    for job in s.JOBS:
        assert (job.at is None) != (job.every_min is None), job.name
        assert job.after is None or job.after in s.BY_NAME
    assert [j.name for j in s.JOBS if j.demo_safe] == ["audit_anchor"]


def test_daily_slot_is_due_from_its_time_on_and_skips_holidays() -> None:
    brief = s.BY_NAME["morning_brief"]
    assert s.slot_of(brief, ist(2026, 10, 20, 8, 44)) is None
    assert s.slot_of(brief, ist(2026, 10, 20, 8, 45)) == "2026-10-20"
    assert s.slot_of(brief, ist(2026, 10, 20, 23, 0)) == "2026-10-20"  # a late restart still catches up
    assert s.slot_of(brief, ist(2026, 10, 29, 9, 0)) is None  # Cumhuriyet Bayramı
    assert s.slot_of(brief, ist(2026, 5, 27, 9, 0)) is None  # Kurban Bayramı (BIST calendar)
    assert s.slot_of(brief, ist(2026, 10, 24, 9, 0)) is None  # Saturday
    # UTC input is read in Istanbul time: 05:45Z = 08:45 IST.
    assert s.slot_of(brief, datetime(2026, 10, 20, 5, 45, tzinfo=UTC)) == "2026-10-20"


def test_weekly_and_every_day_jobs() -> None:
    profiles = s.BY_NAME["issuer_profiles"]
    assert s.slot_of(profiles, ist(2026, 10, 19, 7, 30)) == "2026-10-19"  # Monday
    assert s.slot_of(profiles, ist(2026, 10, 20, 7, 30)) is None
    anchor = s.BY_NAME["audit_anchor"]
    assert s.slot_of(anchor, ist(2026, 10, 25, 23, 31)) == "2026-10-25"  # Sunday too
    assert s.runs_on(s.Job("w", s.job_dq, at=time(1, 0), days="weekdays"), date(2026, 10, 29))


def test_interval_slots_round_down_and_respect_the_session() -> None:
    quotes, monitor, tedbir = s.BY_NAME["quotes"], s.BY_NAME["risk_monitor"], s.BY_NAME["tedbir_sync"]
    assert s.slot_of(quotes, ist(2026, 10, 20, 10, 7)) == "2026-10-20T10:04"
    assert s.slot_of(monitor, ist(2026, 10, 20, 10, 7)) == "2026-10-20T10:05"
    assert s.slot_of(monitor, ist(2026, 10, 20, 9, 59)) is None
    assert s.slot_of(monitor, ist(2026, 10, 20, 18, 10)) is None  # closing auction over
    assert s.slot_of(monitor, ist(2026, 10, 28, 12, 35)) is None  # half day: closed at 12:30
    assert s.slot_of(monitor, ist(2026, 10, 29, 11, 0)) is None
    assert s.slot_of(tedbir, ist(2026, 10, 25, 3, 59)) == "2026-10-25T03:30"
    assert s.in_session(ist(2026, 10, 20, 10, 0))


def test_due_skips_done_running_and_waits_for_the_predecessor() -> None:
    now = ist(2026, 10, 20, 18, 31)
    names = {j.name for j, _ in s.due(now, set(), set(), demo=False)}
    assert "eod_prices" in names and "eod_fills" not in names and "exits" not in names
    done = {("eod_prices", "2026-10-20")}
    names = {j.name for j, _ in s.due(now, done, set(), demo=False)}
    assert "eod_prices" not in names and "eod_fills" in names
    names = {j.name for j, _ in s.due(now, done, {"eod_fills"}, demo=False)}
    assert "eod_fills" not in names
    late = ist(2026, 10, 20, 23, 45)
    demo = s.due(late, set(), set(), demo=True)
    assert [(j.name, slot) for j, slot in demo] == [("audit_anchor", "2026-10-20")]


def test_trigger_marks_a_late_start_as_catchup() -> None:
    brief = s.BY_NAME["morning_brief"]
    assert s.trigger_for(brief, "2026-10-20", ist(2026, 10, 20, 8, 46)) == "schedule"
    assert s.trigger_for(brief, "2026-10-20", ist(2026, 10, 20, 12, 0)) == "catchup"
    assert s.trigger_for(s.BY_NAME["exits"], "2026-10-20", ist(2026, 10, 20, 19, 30)) == "schedule"
    assert s.trigger_for(s.BY_NAME["quotes"], "2026-10-20T10:04", ist(2026, 10, 20, 10, 5)) == "schedule"


@dataclass
class _Stats:
    n: int
    at: datetime
    amount: Decimal


def test_summary_is_small_plain_json() -> None:
    doc = s.compact(_Stats(2, ist(2026, 10, 20, 8, 45), Decimal("1.5")))
    assert doc == {"n": 2, "at": "2026-10-20T08:45:00+03:00", "amount": 1.5}
    assert s.compact([1, 2]) == {"result": [1, 2]}
    assert s.compact({"x": "y" * 9000})["truncated"] is True
    assert s.jsonable({date(2026, 1, 2): {1, 2}}) == {"2026-01-02": [1, 2]}
    assert s.jsonable(object()).startswith("<object")


def test_cli_list_and_args(capsys: pytest.CaptureFixture[str]) -> None:
    assert s.main(["list"]) == 0
    out = capsys.readouterr().out
    assert "morning_brief" in out and "08:45" in out and "after eod_fills" in out
    args = s.parse_args(["run", "dq", "--day", "2026-10-20"])
    assert args.job == "dq" and args.day == date(2026, 10, 20)
    with pytest.raises(SystemExit):
        s.parse_args(["run", "no_such_job"])


def test_cli_refuses_a_non_demo_safe_job_in_demo_mode(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from kaptan.settings import get_settings

    settings = get_settings().model_copy(update={"demo_mode": True})
    monkeypatch.setattr(s, "get_settings", lambda: settings)
    assert s.main(["run", "eod_prices"]) == 2
    assert "DEMO_MODE" in capsys.readouterr().err
