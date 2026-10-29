"""Evaluation and the forward report — M3 B3 (backend-only, API.md §5.3; 04 §11, 08 §4).

    GET /eval/summary                         -> EvalSummary          (all roles)
    GET /reports/forward/weekly?week=YYYY-Www -> ForwardWeeklyReport  (all roles; default: the last full week)

Both are reads of the desk's own tables (kaptan.evalreports; L2 from reports/ragas.json); a layer without
data comes back empty.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.admin.config_view import config_hash
from kaptan.api.deps import ClockDep, CurrentUser, SettingsDep
from kaptan.db import Conn
from kaptan.domain.schemas.forward import ForwardWeeklyReport
from kaptan.domain.schemas.reports import EvalSummary
from kaptan.evalreports import eval_summary as es
from kaptan.evalreports.forward import forward_weekly, iso_week
from kaptan.text.turkish import IST

router = APIRouter(tags=["eval"])


@router.get("/eval/summary", response_model=EvalSummary)
async def summary(user: CurrentUser, conn: Conn, clock: ClockDep, settings: SettingsDep) -> Any:
    now = clock.now()
    today = now.astimezone(IST).date()
    return await es.eval_summary(conn, now=now, today=today, is_sample=settings.demo_mode, ragas_path=es.RAGAS_REPORT)


@router.get("/reports/forward/weekly", response_model=ForwardWeeklyReport)
async def weekly(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    week: Annotated[str | None, Query(pattern=r"^\d{4}-W\d{2}$")] = None,
) -> Any:
    now = clock.now()
    week = week or iso_week(now.astimezone(IST).date() - timedelta(days=7))
    return await forward_weekly(conn, week=week, now=now, config_hash=config_hash())
