"""Event-loop factory for uvicorn: psycopg's async mode needs a selector loop.

On Windows uvicorn's default is the ProactorEventLoop, which psycopg refuses. Pass
`--loop kaptan.api.loop:selector_loop` (or run `python -m kaptan.api`).
"""

from __future__ import annotations

import asyncio
import selectors
from collections.abc import Callable, Coroutine
from typing import Any, TypeVar

T = TypeVar("T")


def selector_loop() -> asyncio.AbstractEventLoop:
    """uvicorn `--loop kaptan.api.loop:selector_loop`: a custom import string *is* the loop factory."""
    return asyncio.SelectorEventLoop(selectors.SelectSelector())


def selector_loop_factory(use_subprocess: bool = False) -> Callable[[], asyncio.AbstractEventLoop]:
    """Factory-of-factory form (pytest-asyncio's loop-factories hook, uvicorn's built-in names)."""
    return selector_loop


def run(coro: Coroutine[Any, Any, T]) -> T:
    """asyncio.run() on a selector loop (scripts; Python 3.11 has no asyncio.run(loop_factory=...))."""
    with asyncio.Runner(loop_factory=selector_loop) as runner:
        return runner.run(coro)
