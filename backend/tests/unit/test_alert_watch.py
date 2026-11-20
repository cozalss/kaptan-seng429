"""The alert loop's own rules: when a part counts as down for 15 minutes, which stream entries are announced."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from kaptan.alerts.watch import (
    DOWN_AFTER,
    MAX_EVENT_AGE,
    WATCH_GAP,
    DownState,
    down_step,
    entry_time,
    kinds_in,
)

T0 = datetime(2026, 11, 19, 9, 0, tzinfo=UTC)


def _entry(at: datetime, event: str, data: dict[str, object]) -> tuple[str, dict[str, str]]:
    return f"{int(at.timestamp() * 1000)}-0", {"event": event, "data": json.dumps(data)}


def test_a_part_down_for_fifteen_minutes_fires_once() -> None:
    state, fire = down_step(T0, True, DownState())
    assert fire is False and state.since == T0
    now = T0
    fired: list[datetime] = []
    while now < T0 + timedelta(minutes=20):
        now += timedelta(minutes=1)
        state, fire = down_step(now, True, state)
        if fire:
            fired.append(now)
            state = DownState(state.since, state.seen, alerted=True)
    assert fired == [T0 + DOWN_AFTER]  # not a minute earlier, and not again while the outage lasts


def test_a_part_that_comes_back_resets_the_clock() -> None:
    state, _ = down_step(T0, True, DownState())
    state, fire = down_step(T0 + timedelta(minutes=10), False, state)
    assert state == DownState() and fire is False
    state, fire = down_step(T0 + timedelta(minutes=11), True, state)
    assert state.since == T0 + timedelta(minutes=11) and fire is False


def test_a_watcher_that_was_away_does_not_blame_the_workers_for_the_night() -> None:
    state, _ = down_step(T0, True, DownState())
    later = T0 + timedelta(hours=7)  # the PC slept: two looks hours apart
    assert later - T0 > WATCH_GAP
    state, fire = down_step(later, True, state)
    assert fire is False and state.since == later


def test_an_undelivered_message_is_tried_again_while_the_outage_lasts() -> None:
    state = DownState(since=T0, seen=T0 + timedelta(minutes=16), alerted=False)
    _, fire = down_step(T0 + timedelta(minutes=17), True, state)
    assert fire is True


def test_entry_time_reads_the_stream_id() -> None:
    assert entry_time(f"{int(T0.timestamp() * 1000)}-3") == T0
    assert entry_time("nonsense") is None


def test_a_batch_announces_each_kind_once_and_skips_old_or_decided_events() -> None:
    risk_on = {"kill_switch": "on", "halted_today": False}
    batch = [
        _entry(T0, "approval.requested", {"status": "pending"}),
        _entry(T0, "approval.requested", {"status": "pending"}),
        _entry(T0, "approval.requested", {"status": "approved"}),
        _entry(T0, "kill_switch", risk_on),
        _entry(T0, "fill", {}),
        _entry(T0, "halt", {"halted_today": False}),
        ("not-an-id", {"event": "halt", "data": json.dumps({"halted_today": True})}),
        (_entry(T0, "halt", {})[0], {"event": "halt", "data": "{broken"}),
    ]
    assert kinds_in(batch, T0 + timedelta(minutes=1)) == ("suggestion", "stopped")
    assert kinds_in(batch, T0 + MAX_EVENT_AGE + timedelta(seconds=1)) == ()  # the phone must not ring for old news
