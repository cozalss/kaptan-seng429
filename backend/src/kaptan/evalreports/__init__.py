"""Read-only reports from the desk's own tables (M3 B3; 04 §11, 08 §4): eval summary, forward weekly, personal stage.

Nothing here is invented: every number comes from trading.pnl_daily, trading.shadow_signals,
trading.closed_positions, trading.agent_runs, core.day_counters or core.event_returns; a layer without
data is empty (zero counts, empty lists), never filled with sample values.
"""
