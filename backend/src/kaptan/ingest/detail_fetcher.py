"""Detail queue consumer (07 §5): one queued disclosure at a time → text rows + parsed document.

Priority 0 = live, 1 = holdout (2025–2026), 2 = development backfill. Failures retry with growing
delays (5, 10, 20 … min, ≤ 6 h); after `MAX_ATTEMPTS` the row is 'failed' (kept for DQ). A WAF signal
re-queues the row for 10 min and propagates `KapBlockedError` so the worker pauses all KAP traffic.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapError
from kaptan.ingest.kap_detail import fetch_detail
from kaptan.ingest.parsers import parse_detail

log = logging.getLogger("kaptan.ingest.detail")

MAX_ATTEMPTS: Final = 5
BLOCKED_RETRY: Final = timedelta(minutes=10)


def retry_delay(attempts: int) -> timedelta:
    return min(timedelta(hours=6), timedelta(minutes=5) * (1 << max(0, attempts - 1)))


def reason_from(parsed: dict[str, Any] | None) -> str | None:
    """NEW / UPD / CORR from the form's own questions; None keeps the list-row value."""
    if not parsed:
        return None
    if parsed.get("is_correction") is True:
        return "CORR"
    if parsed.get("is_update") is True:
        return "UPD"
    if parsed.get("is_update") is False and parsed.get("is_correction") is False:
        return "NEW"
    return None


async def fetch_one(
    pool: Any, client: KapClient, now: Callable[[], datetime] = lambda: datetime.now(UTC)
) -> int | None:
    """Process the next due queue row. Returns its index, or None when nothing is due."""
    async with pool.connection() as conn:
        async with conn.transaction():
            job = await repo.claim_detail(conn, now())
        if job is None:
            return None
        idx = int(job["disclosure_index"])
        attempts = int(job["attempts"])
        try:
            detail = await fetch_detail(client, idx)
        except KapBlockedError as exc:
            async with conn.transaction():
                await repo.fail_detail(conn, idx, str(exc), retry_at=now() + BLOCKED_RETRY)
            raise
        except KapError as exc:
            final = attempts >= MAX_ATTEMPTS
            log.warning("detail %s failed (attempt %d%s): %s", idx, attempts, ", giving up" if final else "", exc)
            async with conn.transaction():
                await repo.fail_detail(conn, idx, str(exc), retry_at=None if final else now() + retry_delay(attempts))
            return idx
        parsed = parse_detail(str(job["subject"] or ""), detail.tr)
        if parsed is not None and parsed.get("status") == "failed":
            log.warning("detail %s: parser failed (%s)", idx, parsed.get("error") or parsed.get("kind"))
        async with conn.transaction():
            await repo.store_detail(conn, detail, parsed, reason_from(parsed))
        return idx
