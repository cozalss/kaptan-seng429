"""The live sizer (LLM_MODE=live): entry, tick-valid limit, ATR stop, cost model and shrunk edge.

inputs = await load_sizing_inputs(conn, ticker=..., event_type="E1", t_pub=..., t_dec=..., self_index=...)
plan = plan_sizing(inputs, equity_try=desk.equity_try, upper_limit=merged_upper)
doc = plan.tool_doc() if isinstance(plan, SizingPlan) else None     # None → the rule engine HOLDs
"""

from kaptan.sizing.plan import SizingInputs, SizingPlan, Unknown, plan_sizing

__all__ = ["SizingInputs", "SizingPlan", "Unknown", "plan_sizing"]
