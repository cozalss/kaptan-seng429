"""Deterministic evidence tools for the live agents (05 §3, 06 §4 and §12): price context, materiality
inputs and the market-model event study, all point in time over `core.prices_daily` and the stored
KAP events. Plain Python + parametrised SQL; no model ever computes or edits these numbers.

Entry point for a run: `toolbox_for(conn, disclosure, settings.llm_mode)`.

The toolbox is exported lazily: it imports `kaptan.agents`, whose graph imports the toolbox again, so an
eager import here made `kaptan.evidence.repo` (and every reference job that reads it) fail with an
import cycle when it was the first thing a process imported.
"""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from kaptan.evidence.toolbox import LiveToolbox, live_tools, toolbox_for

__all__ = ["LiveToolbox", "live_tools", "toolbox_for"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        return getattr(importlib.import_module("kaptan.evidence.toolbox"), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
