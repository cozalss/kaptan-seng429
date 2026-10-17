"""A small in-process sliding-window rate limiter (login: 5 per minute per client IP, 09 §6).

Single API process in M1; a multi-process deployment would move this to Redis (INCR + EXPIRE).
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass
class SlidingWindowLimiter:
    limit: int
    window_s: float = 60.0
    clock: Callable[[], float] = field(default=time.monotonic)
    _hits: dict[str, deque[float]] = field(default_factory=dict)

    def allow(self, key: str) -> bool:
        """Record a hit for `key`; False when the window is already full."""
        now = self.clock()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window_s:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
