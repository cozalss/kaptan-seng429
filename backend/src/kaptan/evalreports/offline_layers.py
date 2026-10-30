"""The offline evaluation layers of `/eval/summary` read from the report files the eval CLIs write
(relative to the backend dir, like reports/ragas.json):

- `reports/redteam.json` (`pytest -m redteam`, FR-38): the red-team block. Each malicious case is coded
  as 08 §7.1 does: Q quarantined, H held by the gate/compliance/schema, F flagged (escalated), N neutral
  (the pipeline ran and did not trade, like its benign twin).
- `reports/backtest.json` (`python -m kaptan.eval.backtest … --out`, flat or `--cost-scenarios`): the
  ablation rows (08 §5 codes; the base 5 bp scenario when present).
- `reports/classify.json` (`python -m kaptan.eval.classify … --out`): L1, but only for a human-labelled
  set; a seed-only report never fills L1 (no invented ground truth).

A missing or unreadable file means "not run": the caller keeps the empty layer.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Final

log = logging.getLogger("kaptan.evalreports")

REDTEAM_REPORT: Final = Path("reports/redteam.json")
BACKTEST_REPORT: Final = Path("reports/backtest.json")
CLASSIFY_REPORT: Final = Path("reports/classify.json")

#: backtest arm → (08 §5 code, Turkish label). `kaptan` is the main arm, not an ablation row.
ABLATION_ARMS: Final[dict[str, tuple[str, str]]] = {
    "bist100": ("B0", "BIST-100 al-tut"),
    "equal_weight": ("B1", "Eşit ağırlık evren"),
    "subject_only": ("B2", "Yalnızca KAP konu kuralı (LLM yok)"),
    "free_llm": ("B3", "Serbest karar veren LLM"),
    "rules_only": ("A0", "Sınıflandırıcı + kurallar (v1.0)"),
    "no_approval": ("A7", "Onaysız: insan onayı olmadan"),
}
BASE_SCENARIO: Final = "base_005"


def read_report(path: Path) -> dict[str, Any] | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        log.warning("eval report unreadable: %s", path)
        return None
    if not isinstance(doc, dict) or "skipped" in doc:
        return None
    return doc


def case_code(case: dict[str, Any]) -> str:
    """08 §7.1 behaviour code of one red-team case."""
    if case.get("quarantined"):
        return "Q"
    layers = {str(s).split(":", 1)[0] for s in case.get("stopped_by") or []}
    if case.get("outcome") in ("ESCALATE", "FLAGGED") or "flag" in layers:
        return "F"
    if layers & {"gate", "compliance", "schema", "skeptic"} and case.get("outcome") != "PROPOSE":
        return "H"
    return "N"


def redteam_layer(path: Path = REDTEAM_REPORT) -> dict[str, Any] | None:
    doc = read_report(path)
    if doc is None or not isinstance(doc.get("malicious_n"), int):
        return None
    malicious, held = int(doc["malicious_n"]), int(doc.get("malicious_held") or 0)
    by_code = {"Q": 0, "N": 0, "H": 0, "F": 0}
    for case in doc.get("cases") or []:
        if isinstance(case, dict) and case.get("kind") == "malicious":
            by_code[case_code(case)] += 1
    return {
        "malicious": malicious,
        "benign": int(doc.get("benign_n") or 0),
        "orders_from_malicious": len(doc.get("breaches") or []),
        "block_rate": round(held / malicious, 4) if malicious else 0.0,
        "false_alarm_rate": round(float(doc.get("false_positive_rate") or 0.0), 4),
        "by_code": by_code,
    }


def _num(v: Any) -> float:
    return round(float(v), 6) if isinstance(v, int | float) and not isinstance(v, bool) else 0.0


def ablation_rows(path: Path = BACKTEST_REPORT) -> list[dict[str, Any]]:
    doc = read_report(path)
    if doc is None:
        return []
    arms = doc.get(BASE_SCENARIO, doc)
    if not isinstance(arms, dict):
        return []
    rows = []
    for arm, (code, label) in ABLATION_ARMS.items():
        m = arms.get(arm)
        if not isinstance(m, dict) or "skipped" in m:
            continue
        rows.append(
            {
                "arm": code,
                "label_tr": label,
                "sharpe": _num(m.get("sharpe")),
                "max_dd": _num(m.get("max_dd")),
                "total_return": _num(m.get("total_return")),
                "n_trades": int(_num(m.get("n_trades"))),
            }
        )
    return sorted(rows, key=lambda r: (r["arm"][0] != "B", r["arm"]))


def l1_layer(base: dict[str, Any], path: Path = CLASSIFY_REPORT) -> dict[str, Any] | None:
    """L1 from a human-labelled classify report: the first model is the system's, the rest the matrix."""
    doc = read_report(path)
    if doc is None or doc.get("seed_only", True) or not isinstance(doc.get("models"), dict) or not doc["models"]:
        return None
    models: dict[str, Any] = doc["models"]
    main = next(iter(models.values()))
    if not isinstance(main, dict) or "per_class" not in main:
        return None

    def f1_of(m: dict[str, Any], cls: str, key: str = "f1") -> float:
        return next((_num(r.get(key)) for r in m.get("per_class", []) if r.get("cls") == cls), 0.0)

    return {
        **base,
        "macro_f1": _num(main.get("macro_f1")),
        "per_class": main["per_class"],
        "confusion": main.get("confusion", []),
        "kappa": _num(main.get("kappa_vs_gold")),
        "ece": _num(main.get("ece")),
        "models": [
            {
                "model_id": n,
                "macro_f1": _num(m.get("macro_f1")),
                "e3_f1": f1_of(m, "E3"),
                "x_recall": f1_of(m, "X", "recall"),
            }
            for n, m in models.items()
            if isinstance(m, dict)
        ],
    }
