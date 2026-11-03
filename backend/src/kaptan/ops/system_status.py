"""Is KAPtan actually working? The summary behind the panel's honest banner (signed in).

    GET /api/v1/system/status -> {
      "reading": bool,            is KAPtan reading KAP right now (the ingest worker lives and its polls succeed)
      "message": str | null,      the one sentence for the person; null = nothing to say
      "checked_at": iso,
      "ingest":    {"ok", "last_poll_at": iso | null, "age_s": int | null},
      "agents":    {"ok", "last_run_at": iso | null, "age_s": int | null},
      "scheduler": {"ok"},
      "backup":    {"ok", "last_at": iso | null, "age_h": float | null},
      "problems":  [{"code", "message"}]     most important first; `message` is problems[0].message
    }

A container that looks alive proves nothing: this reads what the workers last did. The last successful KAP
poll is a Redis key the ingest worker writes (a quiet night still polls, so a stale key means it stopped);
worker life is the heartbeat; the last run is `trading.agent_runs`; the last backup and the warm-up in
progress are `ops.job_runs` rows (`backup`: backend/ops/backup-once.sh, `live_warmup`: kaptan.live.warmup).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from fastapi import APIRouter, Request
from redis.exceptions import RedisError

from kaptan.api.deps import CurrentUser
from kaptan.domain.schemas._base import iso_ms
from kaptan.ops.heartbeat import LAST_POLL_KEY, read_heartbeats

log = logging.getLogger("kaptan.ops.system_status")

#: The slowest healthy rhythm is 5 min at night and a 10 min back-off after KAP refuses; beyond that it stopped.
POLL_STALE_S: Final = 15 * 60
#: A nightly backup that is a day and a half old missed its night (the PC may have slept through it).
BACKUP_STALE_H: Final = 36
#: A warm-up row without a finish older than this crashed; it is not "in progress".
WARMUP_RUNNING_MAX: Final = timedelta(hours=2)
NOT_READING: Final = "KAPtan şu an bildirim okumuyor."
LAST_RUN_SQL: Final = "SELECT max(started_at) AS at FROM trading.agent_runs WHERE NOT is_fixture"
LAST_BACKUP_SQL: Final = "SELECT max(finished_at) AS at FROM ops.job_runs WHERE job = 'backup' AND ok"
WARMING_SQL: Final = """
SELECT EXISTS (
  SELECT 1 FROM ops.job_runs WHERE job = 'live_warmup' AND finished_at IS NULL AND started_at > %s
) AS running
"""


@dataclass(frozen=True, slots=True)
class Facts:
    heartbeats: dict[str, dict[str, Any]]
    last_poll_at: datetime | None
    last_run_at: datetime | None
    last_backup_at: datetime | None
    warming_up: bool


def _alive(facts: Facts, component: str) -> bool:
    return facts.heartbeats.get(component, {}).get("status") == "ok"


def _age_s(now: datetime, at: datetime | None) -> int | None:
    return None if at is None else max(0, round((now - at).total_seconds()))


def _iso(at: datetime | None) -> str | None:
    return None if at is None else iso_ms(at)


def _backup_problem(age_h: float | None) -> dict[str, str] | None:
    if age_h is None:
        return {"code": "backup_never", "message": "Henüz yedek alınmadı."}
    if age_h <= BACKUP_STALE_H:
        return None
    return {"code": "backup_stale", "message": f"Son yedek {round(age_h / 24)} gün önce alındı."}


def _problems(facts: Facts, poll_age: int | None, backup_age_h: float | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not _alive(facts, "ingest_worker"):
        out.append({"code": "ingest_down", "message": NOT_READING})
    elif poll_age is None or poll_age > POLL_STALE_S:
        out.append({"code": "ingest_stale", "message": NOT_READING})
    if facts.warming_up:
        out.append({"code": "warming_up", "message": "KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir."})
    elif not _alive(facts, "agent_worker"):
        out.append({"code": "agents_down", "message": "KAPtan bildirimleri okuyor ama şu an değerlendirmiyor."})
    if not _alive(facts, "scheduler"):
        out.append(
            {"code": "scheduler_down", "message": "Günlük işler (gün sonu fiyatları, hesaplar) şu an çalışmıyor."}
        )
    backup = _backup_problem(backup_age_h)
    return [*out, backup] if backup else out


def summarize(now: datetime, facts: Facts) -> dict[str, Any]:
    poll_age = _age_s(now, facts.last_poll_at)
    backup_age = _age_s(now, facts.last_backup_at)
    backup_age_h = None if backup_age is None else round(backup_age / 3600, 1)
    problems = _problems(facts, poll_age, backup_age_h)
    found = {p["code"] for p in problems}
    return {
        "reading": not found & {"ingest_down", "ingest_stale"},
        "message": problems[0]["message"] if problems else None,
        "checked_at": iso_ms(now),
        "ingest": {
            "ok": not found & {"ingest_down", "ingest_stale"},
            "last_poll_at": _iso(facts.last_poll_at),
            "age_s": poll_age,
        },
        "agents": {
            "ok": _alive(facts, "agent_worker"),
            "last_run_at": _iso(facts.last_run_at),
            "age_s": _age_s(now, facts.last_run_at),
        },
        "scheduler": {"ok": _alive(facts, "scheduler")},
        "backup": {
            "ok": not found & {"backup_never", "backup_stale"},
            "last_at": _iso(facts.last_backup_at),
            "age_h": backup_age_h,
        },
        "problems": problems,
    }


async def _redis_facts(redis: Any) -> tuple[dict[str, dict[str, Any]], datetime | None]:
    """Redis being away reads as "no heartbeats", which is what the person should be told."""
    try:
        beats = await read_heartbeats(redis)
        raw = await redis.get(LAST_POLL_KEY)
        return beats, datetime.fromisoformat(raw) if raw else None
    except (RedisError, OSError, ValueError) as exc:
        log.warning("status: redis facts unreadable: %s", type(exc).__name__)
        return {}, None


async def _one(conn: Any, sql: str, params: Any = None) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return dict(row) if row else {}


async def read_facts(pool: Any, redis: Any, now: datetime) -> Facts:
    beats, last_poll = await _redis_facts(redis)
    async with pool.connection() as conn:
        last_run = (await _one(conn, LAST_RUN_SQL)).get("at")
        last_backup = (await _one(conn, LAST_BACKUP_SQL)).get("at")
        warming = bool((await _one(conn, WARMING_SQL, (now - WARMUP_RUNNING_MAX,))).get("running"))
    return Facts(beats, last_poll, last_run, last_backup, warming)


def system_status_router() -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/system/status")
    async def system_status(request: Request, _actor: CurrentUser) -> dict[str, Any]:
        now = datetime.now(UTC)
        return summarize(now, await read_facts(request.app.state.pool, request.app.state.redis, now))

    return router
