"""Backtest harness on a tiny synthetic dataset with known answers (FR-37, 08 §3, §5)."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest

from kaptan.eval.backtest import Dataset, Params, entry_session, main, report, run

SESSIONS = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09",
            "2025-01-10", "2025-01-13", "2025-01-14", "2025-01-15", "2025-01-16"]  # fmt: skip
PROPOSE = {"outcome": "PROPOSE", "holding_days": 2}


def _doc() -> dict[str, Any]:
    aaa = [[SESSIONS[0], 100, 100], [SESSIONS[1], 100, 110]] + [[d, 110, 110] for d in SESSIONS[2:]]
    bbb = [[SESSIONS[0], 50, 50], [SESSIONS[1], 50, 40]] + [[d, 40, 40] for d in SESSIONS[2:]]
    return {
        "index": [[d, 100 + i] for i, d in enumerate(SESSIONS)],
        "prices": {"AAA": aaa, "BBB": bbb},
        "events": [
            {"id": "e1", "ticker": "AAA", "available_at": "2025-01-02T12:00:00+03:00", "subject": "Yeni İş İlişkisi",
             "decisions": {"kaptan": PROPOSE, "rules_only": PROPOSE}, "human": "approve"},
            {"id": "e2", "ticker": "BBB", "available_at": "2025-01-02T12:00:00+03:00", "subject": "Yeni İş İlişkisi",
             "decisions": {"kaptan": PROPOSE, "rules_only": {"outcome": "NO_TRADE"}}, "human": "reject"},
            {"id": "e3", "ticker": "BBB", "available_at": "2025-01-02T12:00:00+03:00",
             "subject": "Genel Kurul Toplantısı", "decisions": {}},
        ],
    }  # fmt: skip


def _metrics(arm: str, p: Params | None = None) -> dict[str, Any]:
    return report(run(Dataset.from_doc(_doc()), [arm], p or Params(cost_bps=0)))[arm]


def test_entry_is_the_first_open_after_available_at() -> None:
    s = [date.fromisoformat(d) for d in SESSIONS]
    assert entry_session(s, datetime(2025, 1, 3, 6, 30, tzinfo=UTC)) == date(2025, 1, 3)  # 09:30 TR: same open
    assert entry_session(s, datetime(2025, 1, 3, 7, 30, tzinfo=UTC)) == date(2025, 1, 6)  # 10:30 TR: next one
    assert entry_session(s, datetime(2025, 1, 4, 9, 0, tzinfo=UTC)) == date(2025, 1, 6)  # weekend
    assert entry_session(s, datetime(2026, 1, 1, tzinfo=UTC)) is None


def test_kaptan_arm_with_simulated_approval() -> None:
    m = _metrics("kaptan")
    assert m["n_trades"] == 1 and m["hit_rate"] == 1.0
    years = 10 / 252
    assert m["cagr"] == pytest.approx(1.01 ** (1 / years) - 1, rel=1e-5)
    assert m["max_dd"] == 0.0
    assert m["cost_drag_bps"] == 0.0


def test_no_approval_ablation_takes_the_rejected_trade() -> None:
    results = run(Dataset.from_doc(_doc()), ["no_approval"], Params(cost_bps=0))
    assert results[0].equity[-1] == pytest.approx(990_000)
    assert report(results)["no_approval"]["hit_rate"] == 0.5


def test_rules_only_and_subject_only_arms() -> None:
    assert _metrics("rules_only")["n_trades"] == 1
    subject = run(Dataset.from_doc(_doc()), ["subject_only"], Params(cost_bps=0))[0]
    assert sorted(t.event_id for t in subject.trades) == ["e1", "e2"]  # e3's subject is not an E1–E4 route


def test_costs_are_charged_on_both_sides() -> None:
    r = run(Dataset.from_doc(_doc()), ["kaptan"], Params(cost_bps=10))[0]
    (trade,) = r.trades
    assert trade.cost == pytest.approx(100 + 110)
    assert r.equity[-1] == pytest.approx(1_010_000 - 210)
    assert report([r])["kaptan"]["cost_drag_bps"] > 0


def test_benchmarks() -> None:
    ds = Dataset.from_doc(_doc())
    bist, ew = run(ds, ["bist100", "equal_weight"], Params())
    assert bist.equity[-1] == pytest.approx(1_100_000)
    assert ew.equity[-1] == pytest.approx(5000 * 110 + 10000 * 40)
    assert report([ew])["equal_weight"]["max_dd"] == pytest.approx(1 - 950_000 / 1_000_000)


def test_free_llm_is_skipped_without_a_key_and_unknown_arms_fail() -> None:
    ds = Dataset.from_doc(_doc())
    assert report(run(ds, ["free_llm"]))["free_llm"] == {"skipped": "no key or no recorded free-LLM answers"}
    with pytest.raises(ValueError, match="unknown arm"):
        run(ds, ["moon"])


def test_naive_timestamps_are_rejected() -> None:
    doc = _doc()
    doc["events"][0]["available_at"] = "2025-01-02T12:00:00"
    with pytest.raises(ValueError, match="tz-aware"):
        Dataset.from_doc(doc)


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    data = tmp_path / "h.json"
    data.write_text(json.dumps(_doc()), encoding="utf-8")
    out = tmp_path / "r.json"
    code = main(["--data", str(data), "--from", "2025-01-01", "--to", "2025-01-16", "--arms", "kaptan,bist100",
                 "--out", str(out)])  # fmt: skip
    assert code == 0
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert set(doc) == {"kaptan", "bist100"}
    assert "cagr" in capsys.readouterr().out
