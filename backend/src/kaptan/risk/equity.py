"""Today's intraday equity of the live strategy (port of kaptan-panel/src/mocks/pnl.ts liveEquity()).

The last close compounded by the daily P&L, measured against the running peak of the P&L fixture,
so the risk status, the kill-switch threshold and the chart's "bugün" point never disagree.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from kaptan.portfolio.marks import js_round, round_to

#: Paper capital of the live strategy at the last close when there is no series (explain-builder.ts).
PAPER_EQUITY_TRY: Final = 1_016_480


@dataclass(frozen=True, slots=True)
class LiveEquity:
    equity: int
    peak: float
    drawdown: float


def live_equity(daily_pnl_pct: float, last: tuple[float, float] | None) -> LiveEquity:
    """`last` = (equity, peak_equity) of the live strategy's last close (pnl.last_live_point())."""
    prev_close, prev_peak = last if last is not None else (float(PAPER_EQUITY_TRY), float(PAPER_EQUITY_TRY))
    equity = js_round(prev_close * (1 + daily_pnl_pct))
    peak = max(prev_peak, float(equity))
    return LiveEquity(equity=equity, peak=peak, drawdown=round_to(min(0.0, equity / peak - 1), 5))
