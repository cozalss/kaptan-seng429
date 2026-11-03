"""Archive and holdout units on real recorded KAP rows (tests/fixtures/archive, recorded 2026-11-03): typing,
the traded company of a trade notice, parser verdicts on old forms, progress lines and the pass/fail arithmetic."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Final

import pytest

from kaptan.evalreports.holdout import (
    Outcome,
    event_cost,
    mean_pairwise_corr,
    scenario,
    type_report,
    verdict,
    with_holm,
)
from kaptan.evalreports.stage import evidence_criteria, paper_criteria, pct_tr
from kaptan.evidence.holdout import EVENT_ROW_SQL, HOLDOUT_END, HOLDOUT_START, unsealed_sql
from kaptan.ingest.normalize import from_by_criteria
from kaptan.ingest.parsers import parse_detail
from kaptan.ingest.repo import CompanyIndex
from kaptan.live.archive import Meter, human_span, parse_args, prev_or_same
from kaptan.sizing.costs import HLC
from kaptan.sizing.params import DEFAULT_SIZING

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures" / "archive"
DAYS: Final[dict[str, list[dict[str, Any]]]] = json.loads((FIXTURES / "by_criteria_days.json").read_text("utf-8"))
E1_SUBJECT: Final = "Payların Geri Alınmasına İlişkin Bildirim"
E2_SUBJECT: Final = "Pay Alım Satım Bildirimi"


def _row(idx: int) -> dict[str, Any]:
    return next(r for rows in DAYS.values() for r in rows if r["disclosureIndex"] == idx)


def _text(idx: int) -> str:
    return (FIXTURES / f"{idx}.txt").read_text("utf-8")


# ── typing old rows ───────────────────────────────────────────────────────────────────────────────


def test_old_rows_type_like_the_live_graph_without_any_model() -> None:
    d = from_by_criteria(_row(844786), source="backfill", seen_at=None)
    assert (d.subject_route, d.primary_ticker, d.ingest_source, d.first_seen_at) == ("E1", "TAVHL", "backfill", None)
    # point in time: the published second is kept, and history is available only a minute later (07 P1)
    assert d.published_at == datetime(2020, 5, 13, 15, 20, 18, tzinfo=UTC)
    assert d.available_at == datetime(2020, 5, 13, 15, 21, 18, tzinfo=UTC)


def test_a_trade_filed_by_a_listed_holding_belongs_to_the_traded_company() -> None:
    d = from_by_criteria(_row(844819), source="backfill", seen_at=None)  # METRO YATIRIM files, MEPET is traded
    assert (d.stock_codes, d.related_stocks, d.primary_ticker) == (("MTRYO",), ("MEPET",), "MEPET")
    both = CompanyIndex(by_ticker={"MTRYO": (1, "METRO"), "MEPET": (2, "MEPET A.Ş.")})
    assert both.subject_ticker(d) == "MEPET"
    assert both.resolve(d)[2] == "MEPET"


def test_another_subject_keeps_the_filer_first() -> None:
    d = from_by_criteria(_row(844786), source="backfill", seen_at=None)
    assert CompanyIndex(by_ticker={"TAVHL": (1, "TAV")}).subject_ticker(d) == "TAVHL"


# ── the deterministic part of the definition, on old forms ────────────────────────────────────────


def test_parsers_on_recorded_old_forms() -> None:
    e1 = parse_detail(E1_SUBJECT, _text(844786))
    assert e1 is not None and e1["status"] == "ok" and e1["is_update"] is True  # "Güncelleme: Evet" is still an event
    buy = parse_detail(E2_SUBJECT, _text(844819))
    assert buy is not None and buy["direction"] == "buy"
    forwarded = parse_detail(E2_SUBJECT, _text(976850))
    assert forwarded is not None and forwarded["status"] == "attachment_only" and forwarded["direction"] is None
    free_text = parse_detail(E2_SUBJECT, _text(668586))
    assert free_text is not None and free_text["direction"] is None  # 2018 form: no table → not evidence


def test_the_definition_sql_says_what_the_docs_say() -> None:
    assert "'CORR'" in EVENT_ROW_SQL and "reason = 'NEW'" not in EVENT_ROW_SQL
    assert "'status' = 'ok'" in EVENT_ROW_SQL and "'direction' = 'buy'" in EVENT_ROW_SQL
    assert HOLDOUT_START.isoformat().startswith("2025-01-01") and HOLDOUT_END.isoformat().startswith("2026-11-01")
    assert "%(as_of)s" in unsealed_sql("d.published_at", "as_of")


# ── CLI ───────────────────────────────────────────────────────────────────────────────────────────


def test_args_defaults_are_the_canonical_range_and_polite() -> None:
    args = parse_args([])
    assert args.start == date(2018, 1, 1) and args.kap_interval >= 3.0
    assert parse_args(["--rename", "kozal:tralt"]).rename == [("KOZAL", "TRALT")]
    assert parse_args(["--steps", "returns,report"]).steps == ("returns", "report")
    assert args.classify_max_calls is None and args.classify_max_usd is None  # no model unless asked twice


@pytest.mark.parametrize(
    "bad",
    [
        ["--kap-interval", "1"],
        ["--steps", "everything"],
        ["--from", "2017-01-01"],
        ["--classify-max-calls", "10"],
        ["--classify-max-usd", "1"],
        ["--classify-max-calls", "0", "--classify-max-usd", "1"],
    ],
)
def test_args_refuse(bad: list[str]) -> None:
    with pytest.raises(SystemExit):
        parse_args(bad)


def test_progress_reads_like_a_sentence() -> None:
    clock = {"t": 0.0}
    meter = Meter("KAP days", 3000, clock=lambda: clock["t"])
    clock["t"] = 600.0
    assert meter.line(1000, "2021-03-01") == ("KAP days: 1000/3000 (33.3 %) · 10 min so far, ~20 min left · 2021-03-01")
    assert (human_span(12), human_span(200), human_span(7800)) == ("12 s", "3 min", "2 h 10 min")


def test_returns_step_reads_the_session_of_a_holiday() -> None:
    assert prev_or_same(date(2026, 11, 2)) == date(2026, 11, 2)  # a Monday
    assert prev_or_same(date(2026, 11, 1)) == date(2026, 10, 30)  # a Sunday → Friday


# ── the pass/fail arithmetic ──────────────────────────────────────────────────────────────────────


def _outcomes(n: int, car: float, spread: float = 0.02, cost: float = 0.004) -> list[Outcome]:
    return [
        Outcome(
            car + (spread if i % 2 else -spread), 0.02, cost, cost * 3, open_known=i % 5 != 0, costs_known=i % 7 != 0
        )
        for i in range(n)
    ]


def test_a_type_passes_only_with_all_three() -> None:
    assert scenario(_outcomes(40, 0.02), "cost_base", 20, 0.0)["passed"] is True
    assert scenario(_outcomes(29, 0.02), "cost_base", 20, 0.0)["passed"] is False  # n < 30
    assert scenario(_outcomes(40, 0.003), "cost_base", 20, 0.0)["passed"] is False  # net of costs ≤ 0
    assert scenario(_outcomes(40, 0.0052), "cost_base", 20, 0.0)["passed"] is False  # net > 0, t < 2


def test_clustering_correction_can_fail_a_type_the_plain_t_passes() -> None:
    plain = scenario(_outcomes(40, 0.02), "cost_base", 20, 0.0)
    correlated = scenario(_outcomes(40, 0.02), "cost_base", 20, 0.5)
    assert plain["t_bmp_kp"] > correlated["t_bmp_kp"] and correlated["t_cross"] == plain["t_cross"]
    assert correlated["passed"] is False


def test_costs_apply_per_scenario_and_empty_is_not_a_pass() -> None:
    report = type_report(_outcomes(40, 0.02), 20, 0.0)
    assert report["sensitivity"]["mean_car_net"] < report["base"]["mean_car_net"]
    assert report["open_unknown"] == 8 and report["costs_floor_only"] == 6
    empty = type_report([], 5, 0.0)
    assert empty["n"] == 0 and empty["base"]["passed"] is False and empty["base"]["mean_car_net"] is None


def test_holm_and_verdict_over_four_types() -> None:
    types = {
        "E1": type_report(_outcomes(40, 0.02), 20, 0.0),
        "E2": type_report([], 20, 0.0),
        "E3": type_report(_outcomes(40, -0.02), 5, 0.0),
        "E4": type_report(_outcomes(5, 0.02), 5, 0.0),
    }
    judged = with_holm(types)
    assert judged["E2"]["holm_p"] == 1.0 and judged["E1"]["holm_p"] < 0.05
    assert verdict(judged) == ["E1"]


def test_mean_pairwise_correlation_is_seeded_and_ignores_short_overlap() -> None:
    days = [date.fromordinal(738_000 + i) for i in range(40)]
    a = {d: float(i % 7) for i, d in enumerate(days)}
    assert mean_pairwise_corr([a, dict(a)]) == pytest.approx(1.0)
    assert mean_pairwise_corr([a, dict(list(a.items())[:5])]) == 0.0
    many = [{d: float((i * k) % 7) for i, d in enumerate(days)} for k in range(1, 90)]
    assert mean_pairwise_corr(many) == mean_pairwise_corr(many)


def test_event_cost_uses_the_floor_rule_and_knows_when_it_cannot_tell() -> None:
    bars = [HLC(101.0 + (i % 3), 99.0 - (i % 2), 100.0 + (i % 4)) for i in range(22)]
    cost = event_cost(bars, None, DEFAULT_SIZING)
    assert cost is None
    known = event_cost(bars, Decimal(50_000_000), DEFAULT_SIZING)
    assert known is not None and known >= float(DEFAULT_SIZING.floor_round_trip)


# ── what the stage shows ──────────────────────────────────────────────────────────────────────────


def _report(passed: bool, t: float = 2.88, n: int = 64, mean: float = 0.018) -> dict[str, Any]:
    base = {"passed": passed, "t_bmp_kp": t, "mean_car_net": mean}
    return {
        "types": {"E1": {"n": n, "base": base}, "E2": {"n": 3, "base": {**base, "passed": False, "t_bmp_kp": None}}}
    }


def test_stage_only_repeats_the_recorded_run() -> None:
    assert pct_tr(-0.031) == "%−3,1" and pct_tr(0.1, 0) == "%10"
    none = evidence_criteria(None)
    assert none[0]["met"] is False and none[0]["progress"] == 0.0 and none[0]["current_tr"] == "Henüz ölçülmedi"
    passed = evidence_criteria(_report(True))
    assert passed[0]["met"] is True and passed[0]["current_tr"].startswith("E1: t = 2,88")
    failed = evidence_criteria(_report(False, t=1.2, mean=-0.01))
    assert failed[0]["met"] is False and failed[0]["progress"] == 0.0
    crit = paper_criteria(60, 120, -0.04)
    assert all(c["met"] for c in crit) and crit[0]["progress"] == 1.0
