"""Prometheus `/metrics` (M3 A5). Every value is read from Postgres/Redis at scrape time, so the numbers
are the same whichever API process answers and include what the workers did.

| Metric | Source |
|---|---|
| `kaptan_kap_ingest_lag_seconds{stat}` | live KAP rows of the last 24 h: first_seen_at − published_at (p50, max) |
| `kaptan_kap_last_seen_age_seconds` | now − newest live KAP row's first_seen_at |
| `kaptan_kap_waf_blocks_total{loop}` | Redis counters the ingest worker increments on a WAF / back-off signal |
| `kaptan_agent_stream_pending` / `kaptan_agent_stream_length` / `kaptan_agent_dlq_length` | the agent feed streams |
| `kaptan_graph_duration_seconds{stat}` / `kaptan_graph_runs_24h` | live agent runs of the last 24 h |
| `kaptan_llm_tokens_today{direction}` / `kaptan_llm_calls_today` | trading.llm_usage (UTC day) |
| `kaptan_llm_quota_used{provider}` / `kaptan_llm_quota_limit{provider}` | trading.quota_usage |
| `kaptan_risk_rejects_24h` | audit records `risk.rejected` + pre-gate vetoes of the last 24 h |
| `kaptan_approvals_pending` | trading.approvals still pending |
| `kaptan_audit_chain_ok` | the ledger walk (cached AUDIT_CACHE_S) |
| `kaptan_worker_heartbeat_age_seconds{component}` | worker heartbeats (−1 = missing) |
| `kaptan_metrics_scrape_errors` | collectors that failed in this scrape |

Access: `METRICS_TOKEN` set → `Authorization: Bearer <token>`; unset → loopback clients only.
"""

from __future__ import annotations

import hmac
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Final

from fastapi import APIRouter, Request, Response
from prometheus_client import CollectorRegistry, Gauge, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST

from kaptan.api.errors import ApiError
from kaptan.ops.heartbeat import read_heartbeats

log = logging.getLogger("kaptan.ops.metrics")

AUDIT_CACHE_S: Final = 300.0
WAF_COUNTER_PREFIX: Final = "kaptan:metrics:kap_waf:"
WAF_LOOPS: Final = ("poll", "detail")
AGENT_STREAM: Final = "kaptan:kap.disclosures"
AGENT_GROUP: Final = "agent-worker"
DLQ_STREAM: Final = "kaptan:kap.dlq"
METRICS_AUTH_TEXT: Final = "Ölçümler için yetki gerekli."
LOOPBACK: Final = frozenset({"127.0.0.1", "::1", "localhost"})

KAP_LAG_SQL: Final = """
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_seen_at - published_at)) AS p50,
       max(extract(epoch FROM first_seen_at - published_at)) AS max,
       extract(epoch FROM now() - max(first_seen_at)) AS last_age
  FROM core.disclosures
 WHERE origin = 'kap' AND first_seen_at IS NOT NULL AND first_seen_at > now() - interval '24 hours'
"""
GRAPH_SQL: Final = """
SELECT count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)) AS p95,
       max(extract(epoch FROM finished_at - started_at)) AS max
  FROM trading.agent_runs
 WHERE run_set = 'live' AND finished_at IS NOT NULL AND started_at > now() - interval '24 hours'
"""
LLM_SQL: Final = """
SELECT coalesce(sum(tokens_in), 0) AS tokens_in, coalesce(sum(tokens_out), 0) AS tokens_out, count(*) AS calls
  FROM trading.llm_usage WHERE at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
"""
QUOTA_SQL: Final = "SELECT provider, used, limit_n FROM trading.quota_usage ORDER BY ord"
REJECTS_SQL: Final = """
SELECT (SELECT count(*) FROM audit.audit_log
         WHERE action = 'risk.rejected' AND occurred_at > now() - interval '24 hours')
     + (SELECT count(*) FROM trading.agent_runs WHERE kind = 'pregate_veto' AND run_set = 'live'
         AND started_at > now() - interval '24 hours') AS n
"""
APPROVALS_SQL: Final = "SELECT count(*) AS n FROM trading.approvals WHERE status = 'pending'"


def authorize(request: Request) -> None:
    """Bearer METRICS_TOKEN, or (no token configured) a loopback client."""
    token = request.app.state.settings.metrics_token
    if token is not None:
        scheme, _, given = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(given.strip(), token.get_secret_value()):
            raise ApiError(401, "unauthenticated", METRICS_AUTH_TEXT, headers={"WWW-Authenticate": "Bearer"})
        return
    host = request.client.host if request.client else ""
    if host not in LOOPBACK:
        raise ApiError(403, "forbidden", "Ölçümler yalnızca yerel olarak açık.")


async def _one(conn: Any, sql: str) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(sql)
        row = await cur.fetchone()
    return dict(row) if row else {}


async def _all(conn: Any, sql: str) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql)
        return [dict(r) for r in await cur.fetchall()]


def _num(value: Any, default: float = 0.0) -> float:
    return default if value is None else float(value)


class Scrape:
    """One scrape: a fresh registry, so a gauge never keeps a stale value of another process."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        self.errors = 0

    def gauge(self, name: str, doc: str, labels: tuple[str, ...] = ()) -> Gauge:
        return Gauge(name, doc, labels, registry=self.registry)

    async def run(self, name: str, fn: Callable[[], Awaitable[None]]) -> None:
        try:
            await fn()
        except Exception as exc:  # one broken source must not hide the others
            self.errors += 1
            log.warning("metrics: %s failed: %s", name, type(exc).__name__)


async def _db_metrics(s: Scrape, pool: Any) -> None:
    async with pool.connection() as conn:
        lag = await _one(conn, KAP_LAG_SQL)
        g = s.gauge("kaptan_kap_ingest_lag_seconds", "KAP publish → first seen, live rows of 24 h", ("stat",))
        g.labels("p50").set(_num(lag.get("p50")))
        g.labels("max").set(_num(lag.get("max")))
        s.gauge("kaptan_kap_last_seen_age_seconds", "Seconds since the newest live KAP row (-1 = none)").set(
            _num(lag.get("last_age"), -1.0)
        )
        graph = await _one(conn, GRAPH_SQL)
        g = s.gauge("kaptan_graph_duration_seconds", "Agent graph run duration, live runs of 24 h", ("stat",))
        for stat in ("p50", "p95", "max"):
            g.labels(stat).set(_num(graph.get(stat)))
        s.gauge("kaptan_graph_runs_24h", "Finished live agent runs in 24 h").set(_num(graph.get("n")))
        llm = await _one(conn, LLM_SQL)
        g = s.gauge("kaptan_llm_tokens_today", "LLM tokens today (UTC)", ("direction",))
        g.labels("in").set(_num(llm.get("tokens_in")))
        g.labels("out").set(_num(llm.get("tokens_out")))
        s.gauge("kaptan_llm_calls_today", "LLM calls today (UTC)").set(_num(llm.get("calls")))
        used = s.gauge("kaptan_llm_quota_used", "Provider requests used today", ("provider",))
        limit = s.gauge("kaptan_llm_quota_limit", "Provider daily cap", ("provider",))
        for row in await _all(conn, QUOTA_SQL):
            used.labels(row["provider"]).set(_num(row["used"]))
            limit.labels(row["provider"]).set(_num(row["limit_n"]))
        s.gauge("kaptan_risk_rejects_24h", "Risk-gate rejects and pre-gate vetoes in 24 h").set(
            _num((await _one(conn, REJECTS_SQL)).get("n"))
        )
        s.gauge("kaptan_approvals_pending", "Approval cards waiting for a decision").set(
            _num((await _one(conn, APPROVALS_SQL)).get("n"))
        )
        await conn.rollback()


async def _pending(redis: Any) -> int:
    try:
        info = await redis.xpending(AGENT_STREAM, AGENT_GROUP)
    except Exception:  # no stream / no group yet
        return 0
    return int(info.get("pending", 0) if isinstance(info, dict) else 0)


async def _redis_metrics(s: Scrape, redis: Any) -> None:
    waf = s.gauge("kaptan_kap_waf_blocks_total", "KAP WAF / back-off signals seen by the ingest worker", ("loop",))
    for loop in WAF_LOOPS:
        waf.labels(loop).set(_num(await redis.get(f"{WAF_COUNTER_PREFIX}{loop}")))
    s.gauge("kaptan_agent_stream_pending", "Agent feed entries delivered but not acknowledged").set(
        await _pending(redis)
    )
    s.gauge("kaptan_agent_stream_length", "Agent feed stream length").set(await redis.xlen(AGENT_STREAM))
    s.gauge("kaptan_agent_dlq_length", "Agent feed dead letters").set(await redis.xlen(DLQ_STREAM))
    hb = s.gauge(
        "kaptan_worker_heartbeat_age_seconds", "Seconds since the worker's heartbeat (-1 = missing)", ("component",)
    )
    for component, info in (await read_heartbeats(redis)).items():
        hb.labels(component).set(_num(info.get("age_s"), -1.0))


async def audit_ok(app: Any, now: float | None = None) -> bool:
    """The ledger walk, at most once per AUDIT_CACHE_S per process."""
    from kaptan.audit.verify import verify_db
    from kaptan.domain.schemas._base import iso_ms

    now = time.monotonic() if now is None else now
    cached: tuple[float, bool] | None = getattr(app.state, "audit_ok_cache", None)
    if cached is not None and now - cached[0] < AUDIT_CACHE_S:
        return cached[1]
    async with app.state.pool.connection() as conn:
        verdict = await verify_db(conn, iso_ms(datetime.now(UTC)))
        await conn.rollback()
    ok = bool(verdict["ok"])
    app.state.audit_ok_cache = (now, ok)
    return ok


async def collect(app: Any) -> bytes:
    s = Scrape()

    async def db() -> None:
        await _db_metrics(s, app.state.pool)

    async def redis() -> None:
        await _redis_metrics(s, app.state.redis)

    async def audit() -> None:
        s.gauge("kaptan_audit_chain_ok", "1 = the audit hash chain verifies").set(1 if await audit_ok(app) else 0)

    await s.run("db", db)
    await s.run("redis", redis)
    await s.run("audit", audit)
    s.gauge("kaptan_metrics_scrape_errors", "Collectors that failed in this scrape").set(s.errors)
    return generate_latest(s.registry)


def metrics_router() -> APIRouter:
    router = APIRouter(tags=["ops"])

    @router.get("/metrics", include_in_schema=False)
    async def metrics(request: Request) -> Response:
        authorize(request)
        return Response(await collect(request.app), media_type=CONTENT_TYPE_LATEST)

    return router


async def incr_waf(redis: Any, loop: str) -> None:
    """Ingest worker: one more WAF / back-off signal (never raises)."""
    try:
        await redis.incr(f"{WAF_COUNTER_PREFIX}{loop}")
    except Exception as exc:
        log.warning("metrics: waf counter not updated: %s", type(exc).__name__)
