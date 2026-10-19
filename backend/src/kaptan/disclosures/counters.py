"""DayCounters for "today" — port of the panel mock's selectors.counters().

Visible disclosures = the 212 rows of 13:40 + the rows the live ticker released + injected demo rows.
An injected run is "in flight" for DEMO_RUN_MS (7.5 s of wall time) after `ops.demo_injections.real_at`:
until then its card does not count and its disclosure has no classification yet (a pre-gate veto
keeps its subject-map class), exactly as the mock's runProgress() < 1. LLM usage comes from
`core.day_counters`; in DEMO_MODE tokens never show less than the mock's floor (meta.json counters_base).

Also used to publish SSE `counters` (feed) after every change that moves them.
"""

from __future__ import annotations

from datetime import datetime
from functools import cache
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.clock import istanbul_date
from kaptan.demo.fixtures import DemoFixtures
from kaptan.domain.schemas._base import iso_ms

DEMO_RUN_MS: Final = 7_500

COUNTERS_SQL: Final = """
WITH inflight AS (
  SELECT run_id FROM ops.demo_injections
   WHERE run_id IS NOT NULL AND now() - real_at < make_interval(secs => %(run_s)s)
),
rows AS (
  SELECT d.is_noise, d.run_id, d.classification,
         coalesce(d.run_id IN (SELECT run_id FROM inflight) AND r.kind <> 'pregate_veto', false) AS hides_class
    FROM core.disclosures d
    LEFT JOIN trading.agent_runs r ON r.run_id = d.run_id
   WHERE d.visible
),
cards AS (
  SELECT a.run_id, a.status
    FROM trading.approvals a
    JOIN trading.agent_runs r ON r.run_id = a.run_id
   WHERE r.visible AND a.run_id NOT IN (SELECT run_id FROM inflight)
)
SELECT
  (SELECT count(*) FROM rows)                                   AS total,
  (SELECT count(*) FROM rows WHERE is_noise)                    AS noise,
  (SELECT count(*) FROM rows WHERE run_id IS NOT NULL)          AS processed,
  (SELECT count(*) FROM rows
    WHERE NOT hides_class AND classification->>'event_type' IN ('E1', 'E2', 'E3', 'E4')) AS e_candidates,
  (SELECT count(*) FROM cards WHERE run_id NOT LIKE 'run-hist%%')                        AS proposals,
  (SELECT count(*) FROM cards WHERE status = 'approved' AND run_id NOT LIKE 'run-hist%%') AS approvals,
  (SELECT count(*) FROM cards WHERE status = 'rejected')                                  AS rejections,
  (SELECT llm_calls  FROM core.day_counters WHERE d = %(day)s) AS llm_calls,
  (SELECT llm_tokens FROM core.day_counters WHERE d = %(day)s) AS llm_tokens
"""


@cache
def tokens_floor() -> int:
    return int(DemoFixtures().meta["counters_base"]["llm_tokens_floor"])


def counters_from_row(row: dict[str, Any], now: datetime, floor: int) -> dict[str, Any]:
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
        "llm_tokens": max(int(row["llm_tokens"] or 0), floor),
    }


async def day_counters(conn: AsyncConnection[Any], now: datetime, *, demo: bool = False) -> dict[str, Any]:
    """DayCounters as of `now` (the demo clock in DEMO_MODE). The mock's token floor applies only with
    `demo=True` (DEMO_MODE); a real day shows its real token count."""
    async with conn.cursor() as cur:
        await cur.execute(COUNTERS_SQL, {"run_s": DEMO_RUN_MS / 1000, "day": istanbul_date(now)})
        row = await cur.fetchone()
    assert row is not None
    return counters_from_row(dict(row), now, tokens_floor() if demo else 0)


async def publish_counters(app: Any) -> None:
    """SSE `counters` on the feed stream (own pooled connection; after the caller's commit)."""
    from kaptan.demo.ports import publish

    async with app.state.pool.connection() as conn:
        data = await day_counters(conn, app.state.clock.now(), demo=app.state.clock.demo)
    await publish(app, "feed", "counters", data)
