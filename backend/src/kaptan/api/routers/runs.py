"""Runs — owner: wave-2 package A.

    GET /runs/{run_id}/explain -> Explain   (all roles; 404 not_found "Koşu bulunamadı.")

The stored document is trading.agent_runs.explain (the fixture/pipeline payload). Overlay the live
parts like the mock's selectors.explainFor(): approval (effective status), orders + fills (session
orders, kill-switch cancels), the order ticket and its order, run.status (running while an injected
run is in flight; completed once approved), audit_positions (last 8 ledger rows of the run).
Demo runs that were not injected yet (agent_runs.visible = false) are 404.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas import Explain
from kaptan.runs.explain import explain_for

router = APIRouter(tags=["runs"])


@router.get("/runs/{run_id}/explain", response_model=Explain)
async def explain(run_id: str, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    doc = await explain_for(conn, run_id, now=clock.now(), wall=clock.real_now())
    if doc is None:
        raise ApiError(404, "not_found", "Koşu bulunamadı.")
    return doc
