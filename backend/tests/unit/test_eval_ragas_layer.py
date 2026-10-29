"""L2 of GET /eval/summary from the RAGAS report file (reports/ragas.json): filled, skipped, missing, broken."""

from __future__ import annotations

import json
from pathlib import Path

from kaptan.domain.schemas.reports import RagEval
from kaptan.evalreports.eval_summary import empty_layers, ragas_layer

REPORT = {
    "n": 3,
    "scored": 3,
    "failed": [],
    "metrics": {"faithfulness": 0.91667, "answer_relevancy": 0.8, "context_precision": None},
    "samples": [],
}


def _write(tmp_path: Path, data: object) -> Path:
    path = tmp_path / "ragas.json"
    path.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")
    return path


def test_a_scored_report_fills_l2(tmp_path: Path) -> None:
    l2 = ragas_layer(_write(tmp_path, REPORT))
    assert l2 is not None
    assert (l2["faithfulness"], l2["context_precision"]) == (0.9167, 0.0)  # None metric → 0
    assert len(l2["trend"]) == 1 and l2["trend"][0]["faithfulness"] == 0.9167
    RagEval.model_validate({**empty_layers()["l2"], **l2})  # the zod mirror still holds


def test_not_run_reports_stay_empty(tmp_path: Path) -> None:
    assert ragas_layer(tmp_path / "missing.json") is None
    assert ragas_layer(_write(tmp_path, {"skipped": "KAPTAN_RAGAS is not 1", "n": 3})) is None
    assert ragas_layer(_write(tmp_path, {**REPORT, "scored": 0})) is None
    assert ragas_layer(_write(tmp_path, "{not json")) is None
    assert ragas_layer(_write(tmp_path, [1, 2])) is None
