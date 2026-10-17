"""SSE for newly ingested KAP rows: `disclosure` (DisclosureListItem) per row, then one `counters`.

Called after the ingest transaction committed, outside DEMO_MODE only, with the worker's own Redis
client (`kaptan.events.publish` accepts a client). The panel's feed stream is the same one the demo
ticker uses, so the panel needs nothing new.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Final

from pydantic import ValidationError

from kaptan.demo.ticker import LIST_ITEM_COLUMNS, list_item
from kaptan.disclosures.counters import day_counters
from kaptan.events.publish import publish

log = logging.getLogger("kaptan.ingest.publish")

NEW_ROWS_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE disclosure_index = ANY(%s) AND origin = 'kap' AND visible
 ORDER BY disclosure_index
"""  # noqa: S608 - constant column list, the indices are bound


async def publish_new(conn: Any, redis: Any, indices: list[int], now: datetime) -> int:
    """Publish the visible rows among `indices` and the new counters. Returns the rows published."""
    async with conn.cursor() as cur:
        await cur.execute(NEW_ROWS_SQL, (indices,))
        rows = await cur.fetchall()
    published = 0
    for row in rows:
        try:
            item = list_item(dict(row))
        except ValidationError:
            log.exception("disclosure %s does not fit the panel schema; not published", row["disclosure_index"])
            continue
        if await publish(redis, "feed", "disclosure", item) is not None:
            published += 1
    if rows:
        await publish(redis, "feed", "counters", await day_counters(conn, now))
    return published
