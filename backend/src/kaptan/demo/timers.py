"""Every demo background timer in one place (DEMO_MODE): the live ticker, the loss simulation, fills
after an approval (package A), the injected run's animation (package E).

The mock keeps one `Set` of `setTimeout`s and clears it on reset (scenarios.ts `stopAllTimers()`);
this is the same idea for asyncio. Each timer is a task owned by `app.state.demo_timers`; `/demo/reset`
and the app's shutdown call `stop_all()`, which cancels them and waits until they have finished, so
no timer writes into a database that is being reseeded.

    from kaptan.demo.timers import later

    later(request.app, 1.8, lambda: fill_order(request.app, order_id), name="fill:ord-s-…")

The callback opens its own pooled connection (`app.state.pool.connection()`): the request's
connection is gone by the time a timer fires. Errors are logged, never raised into the loop.

Single-process assumption: the registry lives in the API process's memory, so DEMO_MODE runs exactly
one API process (one uvicorn worker). A restart drops the pending timers; what must survive is
rebuilt from the database at startup and is idempotent: `kaptan.approvals.execute.resume_pending_fills()`
settles every `accepted` SimBIST order without a fill (the fill re-checks the order under a row
lock, so a double schedule is a no-op). The ticker and the loss simulation are not resumed: a demo
restart is followed by `/demo/reset`. Outside DEMO_MODE nothing depends on these timers (fills are
scheduler jobs, kaptan.brokers.fills).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

log = logging.getLogger("kaptan.demo.timers")

TimerFn = Callable[[], Awaitable[Any]]


class DemoTimers:
    """A registry of running demo tasks; `stop_all()` cancels and awaits them."""

    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def active(self) -> int:
        return sum(1 for t in self._tasks if not t.done())

    def names(self) -> list[str]:
        return sorted(t.get_name() for t in self._tasks if not t.done())

    def later(self, delay_s: float, fn: TimerFn, *, name: str = "demo-timer") -> asyncio.Task[None]:
        """Run `fn()` once after `delay_s` seconds (setTimeout)."""
        return self.spawn(self._after(max(0.0, delay_s), fn, name), name=name)

    def spawn(self, coro: Awaitable[None], *, name: str) -> asyncio.Task[None]:
        """Run a long-lived coroutine (the ticker loop) under the same stop switch."""
        task: asyncio.Task[None] = asyncio.ensure_future(coro)
        task.set_name(name)
        self._tasks.add(task)
        task.add_done_callback(self._done)
        return task

    async def stop_all(self) -> int:
        """Cancel every pending timer and wait for them; returns how many were stopped."""
        pending = [t for t in self._tasks if not t.done()]
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._tasks.clear()
        return len(pending)

    def _done(self, task: asyncio.Task[None]) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            return
        exc = task.exception()
        if exc is not None:
            log.error("demo timer %s failed", task.get_name(), exc_info=exc)

    @staticmethod
    async def _after(delay_s: float, fn: TimerFn, name: str) -> None:
        await asyncio.sleep(delay_s)
        try:
            await fn()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("demo timer %s failed", name)


def timers_of(app: Any) -> DemoTimers:
    """The app's timer registry (created on first use)."""
    timers = getattr(app.state, "demo_timers", None)
    if timers is None:
        timers = DemoTimers()
        app.state.demo_timers = timers
    assert isinstance(timers, DemoTimers)
    return timers


def later(app: Any, delay_s: float, fn: TimerFn, *, name: str = "demo-timer") -> asyncio.Task[None]:
    """Shortcut: `timers_of(app).later(...)`."""
    return timers_of(app).later(delay_s, fn, name=name)
