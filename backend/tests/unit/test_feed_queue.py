"""The agent feed's queue rules without Postgres or Redis: entry window, re-drive order, cap arithmetic."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from kaptan.agents.feed import llm_budget_left
from kaptan.agents.feed_queue import Waiting, cap_reason, entry_window_open, pick_redrive, redrive_order, split_waiting
from kaptan.domain.schemas import AgentFeedCounts, DayCounters
from kaptan.events.publish import encode
from kaptan.llm.budget import Budget, Caps
from kaptan.llm.store import MemoryStore
from kaptan.prices.calendar import IST

MON = datetime(2027, 2, 1, 11, 0, tzinfo=IST)  # a Monday, Tuesday is a session too


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2027, 2, day, hour, minute, tzinfo=IST)


@pytest.mark.parametrize(
    ("published", "now", "is_open"),
    [
        (at(1, 8), at(1, 9, 54), True),  # pre-open: that morning's auction
        (at(1, 8), at(1, 9, 55), False),
        (at(1, 9, 40), at(1, 9, 50), True),  # auction reachable
        (at(1, 9, 40), at(1, 17, 59), True),  # auction missed: continuous trading of the day
        (at(1, 9, 40), at(1, 18, 0), False),
        (at(1, 11), at(1, 23), True),  # in session: next morning's auction, for every event type
        (at(1, 11), at(2, 9, 54), True),
        (at(1, 11), at(2, 9, 55), False),
        (at(1, 19), at(2, 9, 55), False),  # after the close
        (datetime(2027, 2, 5, 19, tzinfo=IST), datetime(2027, 2, 7, 12, tzinfo=IST), True),  # Friday night → Monday
        (datetime(2027, 2, 5, 19, tzinfo=IST), datetime(2027, 2, 8, 9, 56, tzinfo=IST), False),
    ],
)
def test_entry_window(published: datetime, now: datetime, is_open: bool) -> None:
    assert entry_window_open(published, now) is is_open


def test_a_date_outside_the_calendar_has_no_window() -> None:
    assert entry_window_open(datetime(2016, 1, 4, 11, tzinfo=IST), datetime(2016, 1, 4, 12, tzinfo=IST)) is False


def row(
    index: int,
    route: str = "E3",
    *,
    published: datetime = MON,
    in_universe: bool = True,
    status: str = "deferred",
    reason: str | None = "hourly_cap",
    has_text: bool = True,
) -> Waiting:
    return Waiting(index, status, reason, route, published, in_universe, has_text)


def test_redrive_order_universe_then_event_then_freshest() -> None:
    fresh = MON + timedelta(hours=1)
    rows = [
        row(1, "llm", published=fresh),
        row(2, "E4"),
        row(3, "E3", published=fresh),
        row(4, "E1"),
        row(5, "E2", published=fresh),
        row(6, "E1", published=fresh, in_universe=False),
    ]
    assert [w.index for w in redrive_order(rows)] == [5, 4, 3, 2, 1, 6]


def test_split_closes_what_cannot_run_and_keeps_what_can() -> None:
    late = MON + timedelta(days=1, hours=4)  # past Tuesday's auction
    rows = [
        row(1),
        row(2, status="awaiting_text", reason=None, has_text=False),
        row(3, status="running", reason=None),
        row(4, published=late - timedelta(minutes=5)),
        row(5, status="awaiting_text", reason=None, has_text=False, published=late - timedelta(minutes=5)),
        row(6, status="awaiting_text", reason=None, published=late - timedelta(minutes=5)),
        row(7, status="running", reason=None, published=late - timedelta(minutes=5)),
    ]
    closed, runnable = split_waiting(rows, late)
    assert [(w.index, reason) for w, reason in closed] == [(1, "hourly_cap"), (2, "no_text"), (3, "interrupted")]
    # 5 still waits for its text, 7 belongs to replay_pending; 6 lost its `text` entry and is picked up here
    assert {w.index for w in runnable} == {4, 6}


def test_cap_reason_keeps_room_for_e_rows() -> None:
    assert cap_reason("E1", 0, 0, 0, 0) == "hourly_cap"  # 0 = the feed is off
    assert cap_reason("E1", 25, 0, 25, 70) == "hourly_cap"
    assert cap_reason("E1", 24, 69, 25, 70) is None
    assert cap_reason("E1", 24, 70, 25, 70) == "daily_cap"
    assert cap_reason("E1", 24, 7000, 25, 0) is None  # no daily cap
    assert cap_reason("llm", 14, 41, 25, 70) is None
    assert cap_reason("llm", 15, 41, 25, 70) == "hourly_reserved"
    assert cap_reason("llm", 14, 42, 25, 70) == "daily_reserved"
    assert cap_reason("llm", 0, 0, 1, 1) is None  # a tiny cap still lets one through


def test_pick_redrive_counts_its_own_picks_against_the_caps() -> None:
    rows = redrive_order([row(1, "llm"), row(2, "E1"), row(3, "E3"), row(4, "E4")])
    assert [w.index for w in pick_redrive(rows, 0, 0, 2, 0, 10)] == [2, 4]  # E3 and E4 tie: the newer index first
    assert [w.index for w in pick_redrive(rows, 0, 0, 25, 70, 2)] == [2, 4]  # at most `limit` per pass
    assert pick_redrive(rows, 2, 0, 2, 0, 10) == ()
    # the reserve holds: llm-route stops at 3 of 5 although two E slots stay free
    only_llm = [row(i, "llm") for i in range(5)]
    assert len(pick_redrive(only_llm, 0, 0, 5, 0, 10)) == 3


class _Live:
    def __init__(self, budget: Budget, *names: str) -> None:
        self.budget = budget
        self.available = names


async def test_budget_guard_sees_token_and_cost_caps_not_only_requests() -> None:
    caps = {"groq": Caps(requests_per_day=900, tokens_per_day=100), "deepseek": Caps(usd_per_day=0.5)}
    budget = Budget(MemoryStore(), caps)
    live = _Live(budget, "groq", "deepseek")
    assert await llm_budget_left(live) is True
    await budget.record("groq", tokens_in=100, tokens_out=0)
    assert await llm_budget_left(live) is True  # DeepSeek still has money
    await budget.record("deepseek", tokens_in=1, tokens_out=1, cost_usd=0.5)
    assert await llm_budget_left(live) is False  # requests are left on both, spend is not


def test_day_counters_field_is_additive() -> None:
    base = {
        "as_of": "2027-02-01T10:00:00.000Z",
        "total": 1,
        "noise": 0,
        "archived": 1,
        "processed": 0,
        "e_candidates": 0,
        "proposals": 0,
        "approvals": 0,
        "rejections": 0,
        "llm_calls": 0,
        "llm_tokens": 0,
    }
    assert "agent_feed" not in DayCounters.model_validate(base).model_dump(mode="json")  # old shape stays exact
    counts = {
        "read": 9,
        "ran": 3,
        "vetoed": 2,
        "deferred": 1,
        "window_closed": 1,
        "expired_unrun": 1,
        "failed": 1,
    }
    dumped = DayCounters.model_validate({**base, "agent_feed": counts}).model_dump(mode="json")
    assert dumped["agent_feed"] == counts
    assert AgentFeedCounts.model_validate(counts).expired_unrun == 1


COUNTS = {"read": 2, "ran": 1, "vetoed": 0, "deferred": 1, "window_closed": 0, "expired_unrun": 0, "failed": 0}
BARE = {
    "as_of": "2027-02-01T10:00:00.000Z",
    "total": 1,
    "noise": 0,
    "archived": 1,
    "processed": 0,
    "e_candidates": 0,
    "proposals": 0,
    "approvals": 0,
    "rejections": 0,
    "llm_calls": 0,
    "llm_tokens": 0,
}


@pytest.mark.parametrize(("doc", "has_feed"), [(BARE, False), ({**BARE, "agent_feed": COUNTS}, True)])
async def test_the_field_travels_over_http_and_sse_only_when_there_is_one(doc: dict[str, Any], has_feed: bool) -> None:
    app = FastAPI()

    @app.get("/counters", response_model=DayCounters)
    async def counters() -> dict[str, Any]:
        return doc

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as http:
        body = (await http.get("/counters")).json()
    assert ("agent_feed" in body) is has_feed
    assert ("agent_feed" in json.loads(encode("feed", "counters", doc))) is has_feed
    if has_feed:
        assert body["agent_feed"] == COUNTS
