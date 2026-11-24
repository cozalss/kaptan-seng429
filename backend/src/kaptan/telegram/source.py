"""The one door to `kaptan.signal` (one meaning of "important", the plain line and the tone).

Kept as two thin functions so tests can replace them with fixed signals instead of building disclosure rows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from kaptan import signal
from kaptan.telegram.format import SignalLike


async def signals_between(
    conn: Any, since: datetime, until: datetime, *, only_important: bool = True, only_mine: bool = False
) -> list[SignalLike]:
    return list(await signal.signals_between(conn, since, until, only_important=only_important, only_mine=only_mine))


async def describe(conn: Any, disclosure_index: int) -> SignalLike | None:
    return await signal.describe(conn, disclosure_index)
