"""The live disclosure ticker (DEMO_MODE): after 13:40 one more of the day's rows every 7–12 s.

Port of scenarios.ts startLiveTicker(): the first row 6 s after start, then 7 s + ((released·7919)
mod 5 000) ms. A release makes `core.disclosures.release_order = released + 1` visible and re-times
it to the demo clock's "now" (published/first_seen/available), then publishes SSE `disclosure` and
`counters` on the feed stream. Progress lives in the table, so a restart continues where it was.
The loop runs as a demo timer (`kaptan.demo.timers`): `/demo/reset` and shutdown stop it.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.disclosures.counters import publish_counters
from kaptan.domain.schemas import DisclosureListItem

log = logging.getLogger("kaptan.demo.ticker")

TICKER_TASK: Final = "demo:live-ticker"
FIRST_DELAY_S: Final = 6.0

LIST_ITEM_COLUMNS: Final = """
  disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker, company_name,
  disclosure_class, disclosure_type, subject, summary, reason, related_index, is_late, attachment_count,
  has_multilang, is_noise, subject_route, subject_map_version, published_at, first_seen_at, available_at,
  ingest_source, classification, run_id, linked_news_count, note_count
"""

RELEASE_SQL: Final = f"""
UPDATE core.disclosures
   SET visible = true, published_at = %(now)s, first_seen_at = %(now)s, available_at = %(now)s
 WHERE release_order = (
         SELECT min(release_order) FROM core.disclosures WHERE release_order IS NOT NULL AND NOT visible)
RETURNING release_order, {LIST_ITEM_COLUMNS}
"""  # noqa: S608 - constant column list, every value is bound


def next_delay_s(released: int) -> float:
    """Seconds until the next release after `released` rows (7.000 … 11.999 s)."""
    return 7.0 + ((released * 7919) % 5000) / 1000


async def released_count(conn: AsyncConnection[Any]) -> int:
    async with conn.cursor() as cur:
        await cur.execute("SELECT count(*) AS n FROM core.disclosures WHERE release_order IS NOT NULL AND visible")
        row = await cur.fetchone()
    return 0 if row is None else int(row["n"])


def list_item(row: dict[str, Any]) -> dict[str, Any]:
    """A DisclosureListItem JSON document from a core.disclosures row."""
    data = {k: v for k, v in row.items() if k != "release_order"}
    return DisclosureListItem.model_validate(data).model_dump(mode="json")


async def release_next(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any] | None:
    """Release the next post-13:40 row (committed); None when the day has none left."""
    async with conn.transaction(), conn.cursor() as cur:
        await cur.execute(RELEASE_SQL, {"now": now})
        row = await cur.fetchone()
    return None if row is None else list_item(dict(row))


async def tick(app: Any) -> tuple[dict[str, Any] | None, int]:
    """One step: release a row and publish it. Returns (the row or None, rows released so far)."""
    from kaptan.demo.ports import publish

    async with app.state.pool.connection() as conn:
        item = await release_next(conn, app.state.clock.now())
        released = await released_count(conn)
    if item is not None:
        await publish(app, "feed", "disclosure", item)
        await publish_counters(app)
    return item, released


async def run_ticker(
    app: Any,
    *,
    first_delay_s: float = FIRST_DELAY_S,
    delay_fn: Callable[[int], float] = next_delay_s,
    sleep: Callable[[float], Any] | None = None,
) -> None:
    """The loop: wait, release, wait … until the day has no rows left (or the task is cancelled)."""
    nap = sleep or asyncio.sleep
    await nap(first_delay_s)
    while True:
        try:
            item, released = await tick(app)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("live ticker step failed; retrying")
            item, released = {}, 0
        if item is None:
            log.info("live ticker: every disclosure of the day is out")
            return
        await nap(delay_fn(max(0, released - 1)))


def start_ticker(app: Any, **kwargs: Any) -> None:
    """Start the ticker as a demo timer (no-op when it already runs)."""
    from kaptan.demo.timers import timers_of

    timers = timers_of(app)
    if TICKER_TASK in timers.names():
        return
    timers.spawn(run_ticker(app, **kwargs), name=TICKER_TASK)
