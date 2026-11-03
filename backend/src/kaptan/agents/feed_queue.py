"""What the agent feed does with a row it cannot run right now. Pure: the entry window, caps and re-drive order.

The window asks the same table the sizer uses (`sizing.entry`, 06 §5). A row whose window has closed can only
end in HOLD, so it spends no budget. It is conservative: without prices an E3 counts as "moved" (next morning's
auction, the latest deadline of any event type), so nothing that could still trade is closed early.

Over-cap rows wait in the order of `redrive_order`: inside the universe first, then E1/E2, E3/E4, plain
llm-route, then the freshest publication, so an old backlog cannot starve new rows. llm-route rows may only use
`LLM_ROUTE_SHARE` of a cap: most of KAP is llm-route, and the rest stays free for the E row that comes later.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from kaptan.prices.calendar import CalendarRangeError
from kaptan.sizing.entry import entry_plan

LLM_ROUTE: Final = "llm"
LLM_ROUTE_SHARE: Final = 0.6
TIERS: Final[dict[str, int]] = {"E1": 0, "E2": 0, "E3": 1, "E4": 1}
LAST_TIER: Final = 2
#: Any event type with no prices has the latest deadline of the §5 table; see the module docstring.
LATEST_DEADLINE_EVENT: Final = "E1"


@dataclass(frozen=True, slots=True)
class Waiting:
    """An in-scope feed row without a terminal status."""

    index: int
    status: str  # deferred | awaiting_text | running
    reason: str | None
    route: str
    published_at: datetime
    in_universe: bool
    has_text: bool


def entry_window_open(published_at: datetime, now: datetime) -> bool:
    """False once no entry for this disclosure can be placed any more (a date off the calendar has none)."""
    try:
        return entry_plan(LATEST_DEADLINE_EVENT, published_at, now) is not None
    except CalendarRangeError:
        return False


def unrun_reason(status: str, reason: str | None, has_text: bool) -> str:
    """Why a row that had started waiting ended unrun."""
    if status == "running":
        return "interrupted"
    if status == "awaiting_text" and not has_text:
        return "no_text"
    return reason or "not_run"


def _priority(row: Waiting) -> tuple[bool, int, float, int]:
    return (not row.in_universe, TIERS.get(row.route, LAST_TIER), -row.published_at.timestamp(), -row.index)


def redrive_order(rows: Iterable[Waiting]) -> tuple[Waiting, ...]:
    return tuple(sorted(rows, key=_priority))


def split_waiting(
    rows: Iterable[Waiting], now: datetime
) -> tuple[tuple[tuple[Waiting, str], ...], tuple[Waiting, ...]]:
    """(rows whose window has closed, with their reason; rows to re-drive, best first).

    An open `running` row belongs to `replay_pending`; an open `awaiting_text` row waits unless its text is
    already there (its `text` entry was lost)."""
    all_rows = tuple(rows)
    closed = tuple(
        (r, unrun_reason(r.status, r.reason, r.has_text))
        for r in all_rows
        if not entry_window_open(r.published_at, now)
    )
    gone = {r.index for r, _reason in closed}
    runnable = (
        r
        for r in all_rows
        if r.index not in gone and (r.status == "deferred" or (r.status == "awaiting_text" and r.has_text))
    )
    return closed, redrive_order(runnable)


def _reserved(limit: int) -> int:
    return max(1, int(limit * LLM_ROUTE_SHARE))


def cap_reason(route: str, spent_hour: int, spent_day: int, max_hour: int, max_day: int) -> str | None:
    """None = this route may start a run now; otherwise why not. `max_hour` 0 stops the feed, `max_day` 0 = no cap."""
    if max_hour <= 0 or spent_hour >= max_hour:
        return "hourly_cap"
    if max_day > 0 and spent_day >= max_day:
        return "daily_cap"
    if route == LLM_ROUTE:
        if spent_hour >= _reserved(max_hour):
            return "hourly_reserved"
        if max_day > 0 and spent_day >= _reserved(max_day):
            return "daily_reserved"
    return None


def pick_redrive(
    rows: Sequence[Waiting], spent_hour: int, spent_day: int, max_hour: int, max_day: int, limit: int
) -> tuple[Waiting, ...]:
    """Which waiting rows go back on the stream now; each pick counts against the caps of the next one."""
    chosen: tuple[Waiting, ...] = ()
    for row in rows:
        if len(chosen) >= limit:
            break
        used = len(chosen)
        if cap_reason(row.route, spent_hour + used, spent_day + used, max_hour, max_day) is None:
            chosen = (*chosen, row)
    return chosen
