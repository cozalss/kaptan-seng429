"""Portfolio (package B): positions read model, the paper P&L series and `open_position()`.

Package A calls `open_position()` after a SimBIST fill (book "paper") and when a ticket is marked
"entered" (book "personal"); the routers use `positions.list_positions()` and `pnl.list_pnl()`.
"""

from kaptan.portfolio.positions import open_position

__all__ = ["open_position"]
