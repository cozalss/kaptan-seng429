"""Live LLM usage → Postgres: one `trading.llm_usage` row per call (migration 0009) and today's real
counters into `trading.quota_usage`, the table the panel's risk card reads (RiskStatus.quota).

`sync_usage(conn, provider)` is a no-op for replay providers, so callers can run it unconditionally.
Quota rows keep the larger of the stored and the real count (the demo seed's base never goes backwards)
and take the configured daily cap as their limit.
"""

from __future__ import annotations

from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.llm.budget import DayUsage
from kaptan.llm.live import LiveProvider, UsageEvent

#: budget provider → (panel label in trading.quota_usage, display order).
QUOTA_ROWS: Final = {
    "gemini": ("Gemini Flash-Lite", 1),
    "groq": ("Groq gpt-oss", 2),
    "prompt_guard": ("Prompt Guard 2", 3),
    "deepseek": ("DeepSeek", 4),
}
INSERT_USAGE_SQL: Final = """
INSERT INTO trading.llm_usage (at, run_id, agent, provider, model_id, tokens_in, tokens_out, cached, latency_ms,
                               cost_usd)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
UPSERT_QUOTA_SQL: Final = """
INSERT INTO trading.quota_usage (provider, ord, used, per_injection, limit_n) VALUES (%s, %s, %s, 0, %s)
ON CONFLICT (provider) DO UPDATE SET used = GREATEST(trading.quota_usage.used, EXCLUDED.used),
                                     limit_n = EXCLUDED.limit_n
"""


def _row(e: UsageEvent) -> tuple[Any, ...]:
    return (e.at, e.run_id, e.agent, e.provider, e.model_id, e.tokens_in, e.tokens_out, e.cached, e.latency_ms,
            e.cost_usd)  # fmt: skip


def _quota_params(usage: DayUsage) -> tuple[Any, ...] | None:
    label = QUOTA_ROWS.get(usage.provider)
    cap = usage.caps.requests_per_day
    if label is None or not cap:
        return None
    return (label[0], label[1], usage.requests, cap)


async def sync_usage(conn: AsyncConnection[Any], provider: object) -> int:
    """Write pending usage rows and today's quota counters; returns the number of usage rows written."""
    if not isinstance(provider, LiveProvider):
        return 0
    events = provider.drain_usage()
    snapshot = await provider.usage_today()
    async with conn.transaction(), conn.cursor() as cur:
        if events:
            await cur.executemany(INSERT_USAGE_SQL, [_row(e) for e in events])
        for usage in snapshot:
            params = _quota_params(usage)
            if params is not None and (usage.requests > 0 or usage.provider != "deepseek"):
                await cur.execute(UPSERT_QUOTA_SQL, params)
    return len(events)
