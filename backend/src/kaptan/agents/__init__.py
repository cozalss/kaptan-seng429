"""The KAPtan agent pipeline (LangGraph 1.x): graph, nodes, replay-mode scenario runner.

from kaptan.agents import run_scenario
result = await run_scenario(conn, "e3_contract", app.state.clock, app=app)   # /demo/inject (package C)
"""

from kaptan.agents.scenario import ScenarioResult, run_scenario

__all__ = ["ScenarioResult", "run_scenario"]
