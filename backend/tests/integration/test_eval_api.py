"""GET /eval/summary and GET /reports/forward/weekly (M3 B3; 04 §11, 08 §4.2): contract + data."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from kaptan.domain.schemas.forward import ForwardWeeklyReport
from kaptan.evalreports import eval_summary as es
from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh, sql

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]


async def test_eval_summary_matches_zod_and_reads_the_tables(api: httpx.AsyncClient, migrated: Settings) -> None:
    res = await call(api, "analyst", "GET", "/eval/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("EvalSummary", body)
    n_pnl = len(await sql(migrated, "SELECT 1 FROM trading.pnl_daily"))
    assert len(body["l4"]["series"]) == n_pnl
    assert body["is_sample"] is True  # the test app runs with DEMO_MODE
    assert body["l1"]["per_class"] == [] and body["l3"]["rows"] == []


async def test_eval_summary_empty_without_data(api: httpx.AsyncClient, migrated: Settings) -> None:
    await sql(migrated, "DELETE FROM trading.pnl_daily")
    body = (await call(api, "auditor", "GET", "/eval/summary")).json()
    assert_matches("EvalSummary", body)
    assert body["l4"]["series"] == [] and body["shadow"] == []


async def test_forward_weekly(api: httpx.AsyncClient) -> None:
    res = await call(api, "analyst", "GET", "/reports/forward/weekly?week=2027-W02")
    assert res.status_code == 200, res.text
    report = ForwardWeeklyReport.model_validate(res.json())
    assert (report.week, report.start.isoformat(), report.end.isoformat()) == ("2027-W02", "2027-01-11", "2027-01-17")
    assert report.pipeline.disclosures > 0 and report.audit_head is not None
    default = await call(api, "analyst", "GET", "/reports/forward/weekly")
    assert default.status_code == 200 and default.json()["week"] == "2027-W01"
    bad = await call(api, "analyst", "GET", "/reports/forward/weekly?week=2027-W60")
    assert bad.status_code == 422


async def test_eval_summary_reads_the_ragas_report(
    api: httpx.AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    report = {"n": 3, "scored": 2, "failed": [], "metrics": {"faithfulness": 0.75, "context_precision": 0.5}}
    path = tmp_path / "ragas.json"
    path.write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(es, "RAGAS_REPORT", path)
    body = (await call(api, "analyst", "GET", "/eval/summary")).json()
    assert_matches("EvalSummary", body)
    assert (body["l2"]["faithfulness"], body["l2"]["context_precision"]) == (0.75, 0.5)
    assert len(body["l2"]["trend"]) == 1
    path.write_text(json.dumps({"skipped": "KAPTAN_RAGAS is not 1", "n": 3}), encoding="utf-8")
    skipped = (await call(api, "analyst", "GET", "/eval/summary")).json()
    assert skipped["l2"]["faithfulness"] == 0.0 and skipped["l2"]["trend"] == []  # not run
