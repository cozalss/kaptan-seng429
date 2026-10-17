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

from kaptan.api.deps import CurrentUser
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import Explain

router = APIRouter(tags=["runs"])


@router.get("/runs/{run_id}/explain", response_model=Explain)
async def explain(run_id: str, user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /runs/{run_id}/explain")
