"""DayCounters for "today": one Istanbul day, disclosures by publication time and cards by creation time.

LLM usage comes from `core.day_counters`. Also used to publish SSE `counters` (feed) after every change that moves them.

`agent_feed` is what the agent worker did that day, by when it happened: rows first read, runs started, what ended
without a run. `deferred` is a snapshot of what still waits. A day the worker saw nothing has no `agent_feed`.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.clock import istanbul_date
from kaptan.domain.schemas._base import iso_ms
from kaptan.events.publish import publish
from kaptan.text.turkish import IST

COUNTERS_SQL: Final = """
WITH rows AS (
  SELECT d.is_noise, d.run_id, d.classification
    FROM core.disclosures d
    -- `visible` only marks today's feed (the poller hides a day at midnight), so a day is every KAP row
    -- published in it, the backfilled history included
   WHERE d.published_at >= %(day_start)s AND d.published_at < %(day_end)s
),
cards AS (
  SELECT a.run_id, a.status
    FROM trading.approvals a
    JOIN trading.agent_runs r ON r.run_id = a.run_id
   WHERE r.visible AND a.created_at >= %(day_start)s AND a.created_at < %(day_end)s
)
SELECT
  (SELECT count(*) FROM rows)                                   AS total,
  (SELECT count(*) FROM rows WHERE is_noise)                    AS noise,
  (SELECT count(*) FROM rows WHERE run_id IS NOT NULL)          AS processed,
  (SELECT count(*) FROM rows WHERE classification->>'event_type' IN ('E1', 'E2', 'E3', 'E4')) AS e_candidates,
  (SELECT count(*) FROM cards WHERE run_id NOT LIKE 'run-hist%%')                        AS proposals,
  (SELECT count(*) FROM cards WHERE status = 'approved' AND run_id NOT LIKE 'run-hist%%') AS approvals,
  (SELECT count(*) FROM cards WHERE status = 'rejected')                                  AS rejections,
  (SELECT llm_calls  FROM core.day_counters WHERE d = %(day)s) AS llm_calls,
  (SELECT llm_tokens FROM core.day_counters WHERE d = %(day)s) AS llm_tokens
"""


#: updated_at never precedes seen_at or started_at, so this WHERE keeps every row the FILTERs can count.
AGENT_FEED_SQL: Final = """
SELECT
  count(*) FILTER (WHERE seen_at >= %(day_start)s AND seen_at < %(day_end)s AND status <> 'skipped') AS read,
  count(*) FILTER (WHERE started_at >= %(day_start)s AND started_at < %(day_end)s
                     AND status IN ('running', 'done', 'waiting_approval')
                     AND reason IS DISTINCT FROM 'PREGATE_VETO') AS ran,
  count(*) FILTER (WHERE started_at >= %(day_start)s AND started_at < %(day_end)s
                     AND reason = 'PREGATE_VETO') AS vetoed,
  count(*) FILTER (WHERE status = 'deferred' AND seen_at < %(day_end)s) AS deferred,
  count(*) FILTER (WHERE status = 'window_closed' AND updated_at < %(day_end)s) AS window_closed,
  count(*) FILTER (WHERE status = 'expired_unrun' AND updated_at < %(day_end)s) AS expired_unrun,
  count(*) FILTER (WHERE status = 'failed' AND updated_at < %(day_end)s) AS failed
  FROM ops.agent_feed
 WHERE updated_at >= %(day_start)s OR status = 'deferred'
"""


def counters_from_row(row: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Pure: the DayCounters document from the aggregate row."""
    total, noise, processed = int(row["total"]), int(row["noise"]), int(row["processed"])
    return {
        "as_of": iso_ms(now),
        "total": total,
        "noise": noise,
        "archived": total - noise - processed,
        "processed": processed,
        "e_candidates": int(row["e_candidates"]),
        "proposals": int(row["proposals"]),
        "approvals": int(row["approvals"]),
        "rejections": int(row["rejections"]),
        "llm_calls": int(row["llm_calls"] or 0),
        "llm_tokens": int(row["llm_tokens"] or 0),
    }


async def day_counters(conn: AsyncConnection[Any], now: datetime, *, day: date | None = None) -> dict[str, Any]:
    """DayCounters as of `now`: the Istanbul day of `now`, or `day` (a past session; as_of stays `now`)."""
    day = day or istanbul_date(now)
    day_start = datetime.combine(day, time(0, 0), IST)
    params = {"day": day, "day_start": day_start, "day_end": day_start + timedelta(days=1)}
    async with conn.cursor() as cur:
        await cur.execute(COUNTERS_SQL, params)
        row = await cur.fetchone()
        assert row is not None
        await cur.execute(AGENT_FEED_SQL, params)
        feed = await cur.fetchone()
    doc = counters_from_row(dict(row), now)
    counts = {k: int(v) for k, v in dict(feed or {}).items()}
    return {**doc, "agent_feed": counts} if any(counts.values()) else doc


async def publish_counters(app: Any) -> None:
    """SSE `counters` on the feed stream (own pooled connection; after the caller's commit)."""
    async with app.state.pool.connection() as conn:
        data = await day_counters(conn, app.state.clock.now())
    await publish(app, "feed", "counters", data)
