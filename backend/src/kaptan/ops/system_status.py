"""Is KAPtan actually working? The summary behind the panel's honest banner (signed in).

    GET /api/v1/system/status -> {
      "reading": bool,            is KAPtan reading KAP right now (the ingest worker lives and its polls succeed)
      "message": str | null,      the one sentence for the person; null = nothing to say
      "checked_at": iso,
      "ingest":    {"ok", "last_poll_at": iso | null, "age_s": int | null},
      "agents":    {"ok", "last_run_at": iso | null, "age_s": int | null},
      "scheduler": {"ok"},
      "backup":    {"ok", "last_at": iso | null, "age_h": float | null},
      "alerts":    {"ok", "ntfy": bool, "email": bool, "last_sent_at": iso | null},
      "problems":  [{"code", "message"}]     most important first; `message` is problems[0].message
    }

A container that looks alive proves nothing: this reads what the workers last did. The last successful KAP
poll is a Redis key the ingest worker writes (a quiet night still polls, so a stale key means it stopped);
worker life is the heartbeat; the last run is `trading.agent_runs`; backups and warm-ups are `ops.job_runs`
rows (`backup`: backend/ops/backup-once.sh, `live_warmup`: kaptan.live.warmup); the alert channels are
`kaptan.alerts`.

What a real install goes through, and the code it gets (`problems[].code`):
- first start: the agent worker is held back until the first warm-up has finished (backend/ops/wait_ready.py),
  so it has no heartbeat and that is not a fault: `warming_up` while the warm-up runs, `waiting_for_warmup`
  when it has not finished and is not running. No backup yet is not a problem during the first day.
- the PC slept: the heartbeats ran out while nothing was running. For the first minutes after the wake-up is
  noticed the workers are `waking_up`, not down (`WakeWatch`).
- KAP refuses or the network is away: the ingest worker lives but no poll has succeeded (`ingest_stale`), which
  reads differently from a worker that is not running (`ingest_down`).
- market days were missed: a warm-up runs beside the working agents (`catching_up`).
- no model key at all: the agent worker refuses to start (`llm_missing`), which is a setting, not a crash.
- the database is away: nothing else can be known (`db_down`).
Waiting for the person's starting money is not here on purpose: it is no fault (`/me/overview.needs_setup`,
`/disclosures/counters.waiting_for_money` say it).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from fastapi import APIRouter, Request
from psycopg import Error as PgError
from psycopg_pool import PoolTimeout
from redis.exceptions import RedisError

from kaptan.api.deps import CurrentUser
from kaptan.domain.schemas._base import iso_ms
from kaptan.ops.heartbeat import LAST_POLL_KEY, read_heartbeats
from kaptan.settings import Settings, has_llm_provider

log = logging.getLogger("kaptan.ops.system_status")

#: The slowest healthy rhythm is 5 min at night and a 10 min back-off after KAP refuses; beyond that it stopped.
POLL_STALE_S: Final = 15 * 60
#: A nightly backup that is a day and a half old missed its night (the PC may have slept through it).
BACKUP_STALE_H: Final = 36
#: A new install takes its first backup within minutes; until a day has passed "none yet" is not a problem.
BACKUP_GRACE: Final = timedelta(hours=24)
#: A warm-up row without a finish older than this crashed; it is not "in progress".
WARMUP_RUNNING_MAX: Final = timedelta(hours=2)
#: The wall clock ran this far ahead of the process clock between two looks: the machine was asleep.
WAKE_JUMP_S: Final = 60.0
#: After a wake-up the workers need a beat (15 s) and the poll loop its remaining wait (up to 5 min at night).
WAKE_GRACE_S: Final = 6 * 60.0
DB_TIMEOUT_S: Final = 3.0

NOT_READING: Final = "KAPtan şu an bildirim okumuyor."
KAP_SILENT: Final = "KAPtan çalışıyor ama KAP'tan yeni bildirim alamıyor; kendiliğinden yeniden deniyor."
WAKING: Final = "Bilgisayar uykudan yeni uyandı; KAPtan birkaç dakika içinde okumaya devam eder."
DB_DOWN: Final = "KAPtan'ın kayıtlarına şu an ulaşılamıyor; birkaç dakika içinde düzelmezse KAPtan'ı yeniden başlat."
LLM_MISSING: Final = (
    "Yapay zekâ anahtarı girilmemiş: KAPtan bildirimleri okur ama değerlendiremez. "
    "Kurulumu yeniden çalıştırıp bir anahtar gir."
)
WARMING_UP: Final = "KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir."
WAITING_FOR_WARMUP: Final = "KAPtan'ın ilk hazırlığı henüz bitmedi. Bitince bildirimleri değerlendirmeye başlar."
AGENTS_DOWN: Final = "KAPtan bildirimleri okuyor ama şu an değerlendirmiyor."
CATCHING_UP: Final = "KAPtan eksik piyasa verisini tamamlıyor; bu sırada öneriler gecikebilir."
SCHEDULER_DOWN: Final = "Günlük işler (gün sonu fiyatları, hesaplar) şu an çalışmıyor."
BACKUP_FAILED: Final = "Son yedek alınamadı. Yedek klasörünün yerinde olduğunu kontrol et."
BACKUP_NEVER: Final = "Henüz yedek alınmadı."
#: Codes that mean a part of the system is not doing its work (kaptan.alerts.watch tells the person after 15 min).
DOWN_CODES: Final = frozenset({"ingest_down", "ingest_stale", "agents_down"})

FACTS_SQL: Final = """
SELECT (SELECT max(started_at) FROM trading.agent_runs WHERE NOT is_fixture) AS last_run_at,
       (SELECT max(finished_at) FROM ops.job_runs WHERE job = 'backup' AND ok) AS last_backup_at,
       (SELECT max(finished_at) FROM ops.job_runs WHERE job = 'backup' AND ok IS FALSE) AS backup_failed_at,
       (SELECT min(started_at) FROM ops.job_runs) AS first_seen_at,
       EXISTS (SELECT 1 FROM ops.job_runs
                WHERE job = 'live_warmup' AND finished_at IS NULL AND started_at > %s) AS warming_up,
       -- the same question backend/ops/wait_ready.py asks before it lets the agent worker start
       (EXISTS (SELECT 1 FROM ops.job_runs WHERE job = 'live_warmup' AND finished_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM core.universe_daily)) AS warmed
"""


@dataclass(frozen=True, slots=True)
class Facts:
    heartbeats: dict[str, dict[str, Any]]
    last_poll_at: datetime | None
    last_run_at: datetime | None
    last_backup_at: datetime | None
    warming_up: bool
    #: The first warm-up has finished (before that the agent worker is held back on purpose).
    warmed: bool = True
    #: The last backup attempt that failed, and when this install first did anything (None: nothing has run yet).
    backup_failed_at: datetime | None = None
    first_seen_at: datetime | None = None
    llm_ready: bool = True
    db_ok: bool = True
    #: Seconds since the machine was seen waking up from sleep (None: it was not).
    woke_s_ago: float | None = None
    #: The AlertSettings document (kaptan.alerts.service.alert_settings); None = not asked.
    alerts: Mapping[str, Any] | None = None


class WakeWatch:
    """Notices that the machine slept: the wall clock jumped ahead of the process clock since the last look.

    A suspended machine stops the monotonic clock and catches the wall clock up when it wakes, so the gap
    between the two grows by the time slept. One instance per process; the baseline is taken when it is made.
    """

    def __init__(self, wall: Callable[[], float] = time.time, mono: Callable[[], float] = time.monotonic) -> None:
        self._wall = wall
        self._mono = mono
        self._offset = wall() - mono()
        self._woke_at: float | None = None

    def look(self) -> float | None:
        """Seconds since the last wake-up was noticed, while that is recent; else None."""
        mono = self._mono()
        offset = self._wall() - mono
        if offset - self._offset > WAKE_JUMP_S:
            self._woke_at = mono
        self._offset = offset
        if self._woke_at is None or mono - self._woke_at > WAKE_GRACE_S:
            return None
        return mono - self._woke_at


def _alive(facts: Facts, component: str) -> bool:
    return facts.heartbeats.get(component, {}).get("status") == "ok"


def _age_s(now: datetime, at: datetime | None) -> int | None:
    return None if at is None else max(0, round((now - at).total_seconds()))


def _iso(at: datetime | None) -> str | None:
    return None if at is None else iso_ms(at)


def _problem(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _stale_text(age_h: float) -> str:
    if age_h < 48:
        return f"Son yedek {round(age_h)} saat önce alındı."
    return f"Son yedek {int(age_h // 24)} gün önce alındı."


def _backup_problem(now: datetime, facts: Facts, age_h: float | None) -> dict[str, str] | None:
    failed, good = facts.backup_failed_at, facts.last_backup_at
    if failed is not None and (good is None or failed > good):
        return _problem("backup_failed", BACKUP_FAILED)
    if age_h is None:
        first_day = facts.first_seen_at is None or now - facts.first_seen_at < BACKUP_GRACE
        return None if first_day else _problem("backup_never", BACKUP_NEVER)
    return _problem("backup_stale", _stale_text(age_h)) if age_h > BACKUP_STALE_H else None


def _ingest_problem(facts: Facts, poll_age: int | None) -> dict[str, str] | None:
    if not _alive(facts, "ingest_worker"):
        return _problem("ingest_down", NOT_READING)
    if poll_age is None or poll_age > POLL_STALE_S:
        return _problem("ingest_stale", KAP_SILENT)
    return None


def _agents_problem(facts: Facts) -> dict[str, str] | None:
    if not facts.llm_ready:
        return _problem("llm_missing", LLM_MISSING)
    if _alive(facts, "agent_worker"):
        return _problem("catching_up", CATCHING_UP) if facts.warming_up else None
    if facts.warming_up:
        return _problem("warming_up", WARMING_UP)
    if not facts.warmed:
        return _problem("waiting_for_warmup", WAITING_FOR_WARMUP)
    return _problem("agents_down", AGENTS_DOWN)


def _alerts_problem(facts: Facts) -> dict[str, str] | None:
    error = (facts.alerts or {}).get("last_error_tr")
    return _problem("alerts_failing", str(error)) if error else None


def _worker_problems(facts: Facts, poll_age: int | None) -> list[dict[str, str]]:
    found = [
        _ingest_problem(facts, poll_age),
        _agents_problem(facts),
        None if _alive(facts, "scheduler") else _problem("scheduler_down", SCHEDULER_DOWN),
    ]
    out = [p for p in found if p is not None]
    asleep = {"ingest_down", "ingest_stale", "agents_down", "scheduler_down"}
    if facts.woke_s_ago is None or not any(p["code"] in asleep for p in out):
        return out
    # one honest sentence instead of three alarms: the heartbeats ran out while the machine slept
    return [_problem("waking_up", WAKING), *(p for p in out if p["code"] not in asleep)]


def _problems(now: datetime, facts: Facts, poll_age: int | None, backup_age_h: float | None) -> list[dict[str, str]]:
    if not facts.db_ok:
        return [_problem("db_down", DB_DOWN)]
    rest = [_backup_problem(now, facts, backup_age_h), _alerts_problem(facts)]
    return [*_worker_problems(facts, poll_age), *(p for p in rest if p is not None)]


def _alerts_part(facts: Facts) -> dict[str, Any]:
    doc = facts.alerts or {}
    return {
        "ok": not doc.get("last_error_tr"),
        "ntfy": bool(doc.get("ntfy")),
        "email": bool(doc.get("email")),
        "last_sent_at": doc.get("last_sent_at"),
    }


def summarize(now: datetime, facts: Facts) -> dict[str, Any]:
    poll_age = _age_s(now, facts.last_poll_at)
    backup_age = _age_s(now, facts.last_backup_at)
    backup_age_h = None if backup_age is None else round(backup_age / 3600, 1)
    problems = _problems(now, facts, poll_age, backup_age_h)
    found = {p["code"] for p in problems}
    reading = not found & {"ingest_down", "ingest_stale", "waking_up", "db_down"}
    return {
        "reading": reading,
        "message": problems[0]["message"] if problems else None,
        "checked_at": iso_ms(now),
        "ingest": {
            "ok": reading,
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
            "ok": not found & {"backup_never", "backup_stale", "backup_failed"},
            "last_at": _iso(facts.last_backup_at),
            "age_h": backup_age_h,
        },
        "alerts": _alerts_part(facts),
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


async def _db_facts(pool: Any, now: datetime) -> dict[str, Any] | None:
    """One row of facts, or None when the database does not answer (a status must still be given)."""
    try:
        async with pool.connection(timeout=DB_TIMEOUT_S) as conn, conn.cursor() as cur:
            await cur.execute(FACTS_SQL, (now - WARMUP_RUNNING_MAX,))
            row = await cur.fetchone()
        return dict(row) if row else {}
    except (PgError, PoolTimeout, OSError) as exc:
        log.warning("status: database facts unreadable: %s", type(exc).__name__)
        return None


async def read_facts(
    pool: Any, redis: Any, now: datetime, settings: Settings | None = None, *, woke_s_ago: float | None = None
) -> Facts:
    """Everything `summarize` needs. Without `settings` the model key and the alert channels are not judged."""
    # kaptan.alerts.watch imports this module (the facts of a part that is down), so this import waits for the call
    from kaptan.alerts.config import alert_config
    from kaptan.alerts.service import alert_settings

    beats, last_poll = await _redis_facts(redis)
    row = await _db_facts(pool, now)
    alerts = None if settings is None else await alert_settings(redis, alert_config(settings))
    llm_ready = True if settings is None else settings.llm_mode != "live" or has_llm_provider(settings)
    if row is None:
        return Facts(beats, last_poll, None, None, False, db_ok=False, woke_s_ago=woke_s_ago, alerts=alerts)
    return Facts(
        heartbeats=beats,
        last_poll_at=last_poll,
        last_run_at=row.get("last_run_at"),
        last_backup_at=row.get("last_backup_at"),
        warming_up=bool(row.get("warming_up")),
        warmed=bool(row.get("warmed")),
        backup_failed_at=row.get("backup_failed_at"),
        first_seen_at=row.get("first_seen_at"),
        llm_ready=llm_ready,
        woke_s_ago=woke_s_ago,
        alerts=alerts,
    )


def system_status_router() -> APIRouter:
    router = APIRouter(tags=["health"])
    wake = WakeWatch()

    @router.get("/system/status")
    async def system_status(request: Request, _actor: CurrentUser) -> dict[str, Any]:
        now = datetime.now(UTC)
        state = request.app.state
        facts = await read_facts(state.pool, state.redis, now, state.settings, woke_s_ago=wake.look())
        return summarize(now, facts)

    return router
