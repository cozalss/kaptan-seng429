"""Disclosures — owner: wave-2 package C.

    GET /disclosures/counters -> DayCounters   (all roles)

Counters for "today" (demo clock, Istanbul day): visible disclosures (pre-anchor + released live
rows + injected demo rows), noise, archived, processed (run_id not null), e_candidates, proposals,
approvals, rejections, llm_calls / llm_tokens (core.day_counters). Parity: the panel mock's
selectors.counters(). SSE `counters` on the feed stream after every change (package D).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import CurrentUser
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import DayCounters

router = APIRouter(tags=["disclosures"])


@router.get("/disclosures/counters", response_model=DayCounters)
async def counters(user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /disclosures/counters")
