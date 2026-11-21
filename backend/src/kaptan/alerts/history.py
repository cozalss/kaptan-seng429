"""The alert history (Ayarlar · Bildirim geçmişi): what really went out on the phone/e-mail channels, and when.

One row per channel per message in `ops.alert_history`: the time, the channel, the fixed sentence (kaptan.alerts.
messages) and whether it was delivered. Never the topic, the address, a ticker or an amount: the sentence is the
only text a message can carry. Writing is best effort (a failure is logged, never raised: an alert must not
fail because its log did) and rows older than 90 days are dropped on the way.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

from kaptan.domain.schemas._base import iso_ms

log = logging.getLogger("kaptan.alerts")

KEEP_DAYS: Final = 90
LIST_LIMIT: Final = 100
INSERT_SQL: Final = """
INSERT INTO ops.alert_history (sent_at, kind, channel, ok, text, reason) VALUES (%s, %s, %s, %s, %s, %s)
"""
PRUNE_SQL: Final = "DELETE FROM ops.alert_history WHERE sent_at < %s - make_interval(days => %s)"
LIST_SQL: Final = """
SELECT sent_at, kind, channel, ok, text FROM ops.alert_history ORDER BY sent_at DESC, id DESC LIMIT %s
"""


async def record_history(pool: Any, at: datetime, kind: str, text: str, results: Mapping[str, str | None]) -> None:
    """`results`: channel -> None when delivered, else the failure reason (a class name, never a secret)."""
    try:
        async with pool.connection() as conn:
            for channel, reason in results.items():
                await conn.execute(INSERT_SQL, (at, kind, channel, reason is None, text, reason))
            await conn.execute(PRUNE_SQL, (at, KEEP_DAYS))
            await conn.commit()
    except Exception as exc:  # the log of a message must never fail the message
        log.warning("alert history not written: %s", type(exc).__name__)


async def list_history(conn: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(LIST_SQL, (LIST_LIMIT,))
        rows = await cur.fetchall()
    return [
        {"at": iso_ms(r["sent_at"]), "kind": r["kind"], "channel": r["channel"], "ok": r["ok"], "text": r["text"]}
        for r in rows
    ]
