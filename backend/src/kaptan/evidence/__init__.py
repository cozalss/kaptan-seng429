"""Deterministic evidence tools for the live agents (05 §3, 06 §4 and §12): price context, materiality
inputs and the market-model event study, all point in time over `core.prices_daily` and the stored
KAP events. Plain Python + parametrised SQL; no model ever computes or edits these numbers.

Entry point for a run: `toolbox_for(conn, disclosure, settings.llm_mode)`.
"""

from kaptan.evidence.toolbox import LiveToolbox, live_tools, toolbox_for

__all__ = ["LiveToolbox", "live_tools", "toolbox_for"]
