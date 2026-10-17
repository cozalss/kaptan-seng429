"""Thin adapters to the other wave-2 packages, imported lazily so package C works while they land.

- `publish()`        → package D `kaptan.events.publish.publish(app_or_redis, stream, event, data)`
                       (SSE after commit). Missing → logged and skipped.
- `run_scenario()`   → package E `run_scenario(conn, scenario, clock)` (replay pipeline for an
                       injected demo scenario). Missing → 503 `unavailable`.
- `run_loss_step()`  → package B `run_loss_step(conn, step)` (one step of the loss simulation;
                       `step` = index into meta.json `loss_daily`). Missing → 503 at inject time.

Optional keyword arguments (`app`, `clock`) are passed only when the target's signature takes them.
"""

from __future__ import annotations

import importlib
import inspect
import logging
from collections.abc import Callable
from typing import Any, Final

from kaptan.api.errors import ApiError

log = logging.getLogger("kaptan.demo.ports")

PUBLISH_MODULES: Final = ("kaptan.events.publish", "kaptan.events")
SCENARIO_MODULES: Final = ("kaptan.agents", "kaptan.agents.scenario", "kaptan.agents.scenarios", "kaptan.agents.demo")
LOSS_MODULES: Final = ("kaptan.risk", "kaptan.risk.loss_simulation", "kaptan.risk.simulation")


def find(modules: tuple[str, ...], attr: str) -> Callable[..., Any] | None:
    """The first `module.attr` that imports (None when no package provides it yet)."""
    for name in modules:
        try:
            module = importlib.import_module(name)
        except ImportError:
            continue
        fn = getattr(module, attr, None)
        if callable(fn):
            return fn  # type: ignore[no-any-return]
    return None


async def call(fn: Callable[..., Any], *args: Any, **optional: Any) -> Any:
    """`fn(*args, **those optional kwargs its signature accepts)`, awaited when it is a coroutine."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):  # pragma: no cover - builtins
        params = {}  # type: ignore[assignment]
    takes_any = any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values())
    kwargs = {k: v for k, v in optional.items() if takes_any or k in params}
    result = fn(*args, **kwargs)
    if inspect.isawaitable(result):
        result = await result
    return result


async def publish(app: Any, stream: str, event: str, data: Any) -> None:
    """SSE publish via package D; never fails the caller (the state change is already committed)."""
    fn = find(PUBLISH_MODULES, "publish")
    if fn is None:
        log.debug("SSE publish unavailable (package D missing): %s/%s", stream, event)
        return
    try:
        await call(fn, app, stream, event, data)
    except Exception:
        log.exception("SSE publish failed: %s/%s", stream, event)


def unavailable(what: str) -> ApiError:
    return ApiError(503, "unavailable", f"{what} henüz hazır değil.")


async def run_scenario(app: Any, conn: Any, scenario: str, clock: Any) -> Any:
    fn = find(SCENARIO_MODULES, "run_scenario")
    if fn is None:
        raise unavailable("Senaryo hattı")
    return await call(fn, conn, scenario, clock, app=app)


def loss_step_fn() -> Callable[..., Any]:
    fn = find(LOSS_MODULES, "run_loss_step")
    if fn is None:
        raise unavailable("Zarar simülasyonu")
    return fn


async def run_loss_step(app: Any, conn: Any, step: int, clock: Any) -> Any:
    return await call(loss_step_fn(), conn, step, app=app, clock=clock)
