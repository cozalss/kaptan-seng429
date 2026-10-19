"""The DayCounters token floor (the panel mock's 412 000) applies only in DEMO_MODE."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from kaptan.db import DictConn
from kaptan.disclosures.counters import day_counters, tokens_floor

pytestmark = pytest.mark.integration


async def test_token_floor_only_in_demo_mode(pg: DictConn) -> None:
    real_day = datetime(2030, 1, 7, 9, 0, tzinfo=UTC)  # no LLM usage recorded on this day
    assert (await day_counters(pg, real_day))["llm_tokens"] == 0
    assert (await day_counters(pg, real_day, demo=True))["llm_tokens"] == tokens_floor()
