"""GET /personal/stage (M3 B3; 12 §1): contract against the panel's zod schema + the stage logic."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from kaptan.evalreports.stage import current_stage, evidence_criteria, paper_criteria, pct_tr
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]


async def test_personal_stage_matches_zod(api: httpx.AsyncClient) -> None:
    res = await call(api, "GET", "/personal/stage")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("PersonalStageStatus", body)
    assert body["current"] == "paper"  # the demo clock is 2027-01-11
    assert [s["status"] for s in body["stages"]] == ["done", "current", "next", "locked"]
    assert {c["id"] for c in body["criteria"]} == {"holdout", "closed_trades", "paper_days", "max_dd"}


def test_stage_helpers() -> None:
    assert current_stage(date(2026, 10, 20)) == "evidence" and current_stage(date(2026, 11, 9)) == "paper"
    assert pct_tr(-0.031) == "%−3,1" and pct_tr(0.1, 0) == "%10"
    none = evidence_criteria(None)
    assert none[0]["met"] is False and none[0]["progress"] == 0.0
    base = {"passed": True, "t_bmp_kp": 2.88, "mean_car_net": 0.018}
    passed = evidence_criteria({"types": {"E1": {"n": 64, "base": base}}})
    assert passed[0]["met"] is True and passed[0]["current_tr"].startswith("E1: t = 2,88")
    crit = paper_criteria(60, 120, -0.04)
    assert all(c["met"] for c in crit) and crit[0]["progress"] == 1.0
