"""/eval/summary's red-team, ablation and L1 blocks from the eval CLIs' report files (offline_layers)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from kaptan.domain.schemas.reports import AblationRow, ClassificationEval, Redteam
from kaptan.evalreports.eval_summary import empty_layers
from kaptan.evalreports.offline_layers import (
    REDTEAM_REPORT,
    ablation_rows,
    case_code,
    l1_layer,
    read_report,
    redteam_layer,
)

BACKEND = Path(__file__).resolve().parents[2]


def _write(tmp: Path, name: str, doc: Any) -> Path:
    path = tmp / name
    path.write_text(json.dumps(doc) if not isinstance(doc, str) else doc, encoding="utf-8")
    return path


def test_read_report_missing_broken_skipped(tmp_path: Path) -> None:
    assert read_report(tmp_path / "none.json") is None
    assert read_report(_write(tmp_path, "b.json", "{not json")) is None
    assert read_report(_write(tmp_path, "s.json", {"skipped": "no key"})) is None
    assert read_report(_write(tmp_path, "l.json", [1, 2])) is None


def test_case_codes() -> None:
    assert case_code({"quarantined": True, "stopped_by": ["guard"]}) == "Q"
    assert case_code({"outcome": "NO_TRADE", "stopped_by": ["gate:R05"]}) == "H"
    assert case_code({"outcome": "HOLD", "stopped_by": ["schema:classifier"]}) == "H"
    assert case_code({"outcome": "NO_TRADE", "stopped_by": ["rules:E3_RATIO"]}) == "N"
    assert case_code({"outcome": "ESCALATE", "stopped_by": []}) == "F"


def test_the_committed_redteam_report_fills_the_block() -> None:
    block = redteam_layer(BACKEND / REDTEAM_REPORT)
    assert block is not None
    Redteam.model_validate(block)
    assert block["orders_from_malicious"] == 0
    assert block["block_rate"] == 1.0
    assert sum(block["by_code"].values()) == block["malicious"]


def test_redteam_layer_shape(tmp_path: Path) -> None:
    assert redteam_layer(_write(tmp_path, "x.json", {"cases": []})) is None
    doc = {"malicious_n": 0, "benign_n": 2, "breaches": [], "false_positive_rate": 0.5}
    assert redteam_layer(_write(tmp_path, "r.json", doc)) == {
        "malicious": 0, "benign": 2, "orders_from_malicious": 0, "block_rate": 0.0, "false_alarm_rate": 0.5,
        "by_code": {"Q": 0, "N": 0, "H": 0, "F": 0},
    }  # fmt: skip


def test_ablation_rows_flat_and_scenarios(tmp_path: Path) -> None:
    m = {"sharpe": 1.2, "max_dd": 0.05, "total_return": 0.1, "n_trades": 4.0}
    flat = ablation_rows(_write(tmp_path, "f.json", {"kaptan": m, "no_approval": m, "bist100": {**m, "sharpe": None},
                                                       "free_llm": {"skipped": "no key"}}))  # fmt: skip
    assert [r["arm"] for r in flat] == ["B0", "A7"]
    assert flat[0]["sharpe"] == 0.0 and flat[1]["n_trades"] == 4
    for row in flat:
        AblationRow.model_validate(row)
    scen = ablation_rows(_write(tmp_path, "s.json", {"gross": {"rules_only": m}, "base_005": {"subject_only": m}}))
    assert [r["arm"] for r in scen] == ["B2"]
    assert ablation_rows(tmp_path / "none.json") == []
    assert ablation_rows(_write(tmp_path, "w.json", {"base_005": 3})) == []


def test_l1_only_from_a_human_labelled_report(tmp_path: Path) -> None:
    base = empty_layers()["l1"]
    rows = [
        {"cls": c, "precision": 0.9, "recall": 0.8, "f1": 0.85, "support": 10}
        for c in ("E1", "E2", "E3", "E4", "X", "O")
    ]
    model = {"macro_f1": 0.85, "per_class": rows, "confusion": [[0] * 6 for _ in range(6)], "kappa_vs_gold": 0.8}
    seed = {"n": 20, "seed_only": True, "models": {"live": model}}
    assert l1_layer(base, _write(tmp_path, "seed.json", seed)) is None
    assert l1_layer(base, _write(tmp_path, "nomodel.json", {"seed_only": False, "models": {}})) is None
    assert l1_layer(base, _write(tmp_path, "old.json", {"seed_only": False, "models": {"x": {"macro_f1": 1}}})) is None
    human = {"n": 300, "seed_only": False, "models": {"live": model, "subject": {**model, "macro_f1": 0.5}}}
    layer = l1_layer(base, _write(tmp_path, "human.json", human))
    assert layer is not None
    ClassificationEval.model_validate(layer)
    assert layer["macro_f1"] == 0.85 and [m["model_id"] for m in layer["models"]] == ["live", "subject"]
    assert layer["models"][0]["e3_f1"] == 0.85 and layer["models"][0]["x_recall"] == 0.8
