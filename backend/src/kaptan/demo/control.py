"""Demo controls behind /demo/* (DEMO_MODE): inject a scenario, reset the day, and the lifespan hooks
that start/stop the demo timers.

inject (scenarios.ts runDemoScenario): audit `demo.injected` {scenario, ticker, fixture: true} as the
admin, remember the injection (ops.demo_injections: demo clock + wall clock, which drives the 7.5 s
run animation) and commit; then package E's replay pipeline runs the scenario on the same connection. After the
commit: SSE `disclosure` (the injected row, when visible) and `counters`.
loss_simulation: audit `demo.injected` {fixture: true} on entity scenario/loss_simulation, then the
six LOSS_DAILY steps every 1.4 s as demo timers, each one package B's `run_loss_step()`.
reset (mock resetDemo): stop every demo timer, reseed with the owner connection, restart the demo
clock at 13:40, restart the ticker, SSE `counters`.
"""

from __future__ import annotations

import logging
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.clock import Clock
from kaptan.db import connect
from kaptan.demo import ports
from kaptan.demo.fixtures import DemoFixtures
from kaptan.demo.seed import reseed
from kaptan.demo.tamper import set_tamper as flip_tamper
from kaptan.demo.ticker import LIST_ITEM_COLUMNS, list_item, start_ticker
from kaptan.demo.timers import timers_of
from kaptan.disclosures.counters import publish_counters
from kaptan.settings import Settings

log = logging.getLogger("kaptan.demo")

#: The mock's db.audit() stamps every record that has a run with this strategy version.
AUDIT_STRATEGY_VERSION: Final = "v1.1-fwd"
LOSS_SCENARIO: Final = "loss_simulation"

DEMO_RUN_SQL: Final = """
SELECT run_id, disclosure_index, ticker FROM trading.agent_runs
 WHERE scenario = %s AND run_set = 'demo' ORDER BY run_id LIMIT 1
"""

REMEMBER_SQL: Final = """
INSERT INTO ops.demo_injections (scenario, run_id, injected_at, real_at) VALUES (%s, %s, %s, now())
ON CONFLICT (scenario) DO UPDATE SET run_id = EXCLUDED.run_id, injected_at = EXCLUDED.injected_at, real_at = now()
"""

VISIBLE_ROW_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures WHERE disclosure_index = %s AND visible
"""  # noqa: S608 - constant column list


def owner_url(settings: Settings) -> str:
    if settings.database_owner_url is None:
        raise ApiError(503, "unavailable", "Demo şeması için sahip bağlantısı tanımlı değil.")
    return settings.database_owner_url.get_secret_value()


async def _demo_run(conn: AsyncConnection[Any], scenario: str) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(DEMO_RUN_SQL, (scenario,))
        row = await cur.fetchone()
    if row is None:
        raise ApiError(404, "not_found", "Senaryo bulunamadı.")
    return dict(row)


async def _visible_item(app: Any, index: int) -> dict[str, Any] | None:
    async with app.state.pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(VISIBLE_ROW_SQL, (index,))
        row = await cur.fetchone()
    return None if row is None else list_item(dict(row))


async def inject(app: Any, conn: AsyncConnection[Any], actor: Any, scenario: str) -> dict[str, Any]:
    """POST /demo/inject → {disclosure_index, run_id}."""
    clock: Clock = app.state.clock
    if scenario == LOSS_SCENARIO:
        return await _inject_loss(app, conn, actor, clock)
    run = await _demo_run(conn, scenario)
    now = clock.now()
    draft = AuditDraft(
        actor=actor.audit_actor,
        action="demo.injected",
        entity_type="disclosure",
        entity_id=str(run["disclosure_index"]),
        payload={"scenario": scenario, "ticker": run["ticker"], "fixture": True},
        run_id=run["run_id"],
        strategy_version=AUDIT_STRATEGY_VERSION,
        occurred_at=now,
    )
    async with conn.transaction():
        await append(conn, [draft], now=now)
        await conn.execute(REMEMBER_SQL, (scenario, run["run_id"], now))
    # E runs on a clean connection (it commits its own transactions), like B's loss steps.
    await ports.run_scenario(app, conn, scenario, clock)
    await conn.commit()
    item = await _visible_item(app, int(run["disclosure_index"]))
    if item is not None:
        await ports.publish(app, "feed", "disclosure", item)
    await publish_counters(app)
    return {"disclosure_index": int(run["disclosure_index"]), "run_id": run["run_id"]}


async def _inject_loss(app: Any, conn: AsyncConnection[Any], actor: Any, clock: Clock) -> dict[str, Any]:
    ports.loss_step_fn()  # 503 before anything is written when package B is missing
    now = clock.now()
    draft = AuditDraft(
        actor=actor.audit_actor,
        action="demo.injected",
        entity_type="scenario",
        entity_id=LOSS_SCENARIO,
        payload={"fixture": True},
        occurred_at=now,
    )
    async with conn.transaction():
        await append(conn, [draft], now=now)
    start_loss_simulation(app)
    return {"disclosure_index": None, "run_id": None}


def start_loss_simulation(app: Any, step_s: float | None = None) -> None:
    """Schedule the LOSS_DAILY steps (1.4 s apart) as demo timers."""
    meta = DemoFixtures().meta
    every = step_s if step_s is not None else int(meta["loss_step_ms"]) / 1000
    timers = timers_of(app)
    for i in range(len(meta["loss_daily"])):
        timers.later(every * (i + 1), _loss_step(app, i), name=f"demo:loss-step-{i}")


def _loss_step(app: Any, step: int) -> Any:
    async def run() -> None:
        # B's step commits itself (a connection outside any transaction block).
        async with app.state.pool.connection() as conn:
            await ports.run_loss_step(app, conn, step, app.state.clock)

    return run


async def reset(app: Any, settings: Settings) -> None:
    """POST /demo/reset: everything back to 13:40 of the demo day."""
    url = owner_url(settings)
    await timers_of(app).stop_all()
    owner = await connect(url)
    try:
        result = await reseed(owner)
    finally:
        await owner.close()
    app.state.clock.restart(result.started_at)
    log.info("demo reset: clock restarted at %s", result.started_at.isoformat())
    if settings.demo_live_ticker:
        start_ticker(app)
    await publish_counters(app)


async def set_tamper(settings: Settings, on: bool) -> bool:
    """POST /demo/tamper with a short-lived owner connection."""
    owner = await connect(owner_url(settings))
    try:
        return await flip_tamper(owner, on, int(DemoFixtures().meta["audit_tamper_pos"]))
    finally:
        await owner.close()


# ── lifespan hooks (api/main.py) ─────────────────────────────────────────
def on_startup(app: Any, settings: Settings) -> None:
    timers_of(app)
    if settings.demo_mode and settings.demo_live_ticker:
        start_ticker(app)


async def on_shutdown(app: Any) -> None:
    stopped = await timers_of(app).stop_all()
    if stopped:
        log.info("demo timers stopped: %d", stopped)
