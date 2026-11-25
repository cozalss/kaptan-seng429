"""Recorded live runs that stopped as HOLD (2026-11-24/25), replayed through the Reader, merge and the rule engine.

- MAVI run-live-1702679 / GLYHO run-live-1702702 (E1): the buyback form repeats the whole programme (36 and 90 rows).
  The Reader was told to copy every row, the answer outgrew its 1 500-token budget on every model, the chain failed
  and the run held as "agent failed" though nothing was unclear. The rows now come from the form (code).
- MAVI run-live-1702076 (E1): the Reader answered (22 of 35 rows); every E1 rule passed, the sizer had no similar
  past events, and the trace said "Avantaj maliyeti karşılamıyor" (NO_TRADE) while the run held. Unknown is now
  HOLD with the missing piece named.
- SOKM run-live-1702063 (E2): the Reader really abstained (the notice has no trade table); that still holds.

The fixture is copied from the live database: public KAP disclosure text and the agents' outputs, no personal data.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from kaptan.agents.buyback_facts import TABLE_STEP_NOTE, ground_buyback, table_transactions
from kaptan.agents.context import DeskState, DisclosureInput, RunContext
from kaptan.agents.nodes._common import failure_note
from kaptan.agents.nodes.analysts import reader
from kaptan.agents.nodes.decide import rule_input
from kaptan.agents.nodes.merge import _statuses, amount_in_text, reader_amount
from kaptan.agents.source_amounts import read_source
from kaptan.agents.tools import NoTools
from kaptan.domain.schemas.agents import BuybackExtraction
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage
from kaptan.llm.registry import default_models
from kaptan.llm.structured import CHARS_PER_TOKEN, prompt_for
from kaptan.llm.transport import InvalidOutputError
from kaptan.rules import decide

RUNS = json.loads((Path(__file__).parents[1] / "fixtures" / "live_holds" / "runs.json").read_text(encoding="utf-8"))
MAVI_FAILED, MAVI_ANSWERED, SOKM = RUNS["run-live-1702679"], RUNS["run-live-1702076"], RUNS["run-live-1702063"]


def _ctx(run: dict[str, Any], provider: Any = None) -> RunContext:
    published = datetime.fromisoformat(run["published_at"].replace("Z", "+00:00"))
    return RunContext(
        provider=provider,
        tools=NoTools(),
        disclosure=DisclosureInput(
            run_id=f"run-test-{run['disclosure_index']}",
            disclosure_index=run["disclosure_index"],
            ticker=run["ticker"],
            company_name=run["ticker"],
            subject=run["subject"],
            summary=run["subject"],
            text_tr=run["text_tr"],
            published_at=published,
            available_at=published + timedelta(seconds=30),
            strategy_version="v1.1-fwd",
            is_fixture=False,
        ),
        desk=DeskState(
            in_universe=True, last_price=Decimal("32.3"), adv20_try=Decimal(1), free_float=0.5, equity_try=Decimal(1)
        ),
    )


def _newest_rows_answer() -> dict[str, Any]:
    """What the Reader is now asked for: the recorded MAVI answer with only the newest trade day's row."""
    answer = dict(MAVI_ANSWERED["nodes"]["reader"])
    newest = max(answer["transactions"], key=lambda t: t["trade_date"])
    return {**answer, "transactions": [newest]}


class _Answers:
    name = "fake"

    def __init__(self, answer: dict[str, Any]) -> None:
        self.answer = answer
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        usage = LLMUsage(model_id="fake", tokens_in=1, tokens_out=1, latency_ms=1)
        return LLMResult(output=dict(self.answer), usage=usage, provider=self.name)


def _state(run: dict[str, Any], **over: Any) -> dict[str, Any]:
    nodes = run["nodes"]
    return {
        "event_type": run["event_type"],
        "route": {"route": run["event_type"], "sub_type_hint": None},
        "steps": [],
        "classifier": nodes["classifier"],
        "reader": nodes["reader"],
        "materiality": nodes["materiality"],
        "skeptic": nodes["skeptic"],
        "merged": nodes["merge"],
        **over,
    }


# ── the cause: a cumulative table outgrows the Reader's budget ─────────────────────────────────────────────────
def test_the_recorded_mavi_table_does_not_fit_the_readers_output_budget() -> None:
    rows = table_transactions(MAVI_FAILED["text_tr"], "MAVI")
    assert len(rows) == 36  # 18.09 → 25.11.2026, one row per trade day of the programme
    full = {**MAVI_ANSWERED["nodes"]["reader"], "transactions": rows}
    budget = default_models().max_output_tokens("reader", 2_048)
    assert len(json.dumps(full, ensure_ascii=False)) // CHARS_PER_TOKEN > budget  # copying it all is cut off
    newest = json.dumps(_newest_rows_answer(), ensure_ascii=False)
    assert len(newest) // CHARS_PER_TOKEN < budget // 2


def test_the_e1_prompt_asks_only_for_the_newest_trade_day() -> None:
    req = LLMRequest(agent="reader", prompt_version="reader@1.1.0", inputs={}, output_schema=BuybackExtraction)
    system = prompt_for(req).system("n")
    assert "YALNIZCA en yeni işlem tarihine" in system
    assert "tablonun her satırı" not in system


# ── the fix: rows from the form, the Reader healthy, merge and rules decide on what they have ──────────────────
async def test_the_reader_takes_the_rows_from_the_form_not_from_the_model() -> None:
    provider = _Answers(_newest_rows_answer())
    ctx = _ctx(MAVI_FAILED, provider)
    state = {"event_type": "E1", "route": {"route": "E1", "sub_type_hint": "buyback_execution"}, "steps": []}
    out = await reader(state, SimpleNamespace(context=ctx))  # type: ignore[arg-type]
    answer = out["reader"]
    assert answer["status"] == "ok" and len(answer["transactions"]) == 36
    BuybackExtraction.model_validate(answer)  # still the Reader's schema
    assert out["steps"][0]["note_tr"] == TABLE_STEP_NOTE
    amount = reader_amount(answer)
    assert amount == Decimal("10282153")  # every row of the form, added up by code
    source = read_source("E1", MAVI_FAILED["text_tr"], "MAVI")
    assert amount_in_text(amount, list(source.confirming(amount))) is True  # R14 can confirm it
    statuses = _statuses({**state, **_state(MAVI_FAILED), "reader": answer}, None)  # type: ignore[arg-type]
    assert statuses["reader"] == "ok"


def test_a_form_without_a_readable_table_keeps_the_readers_rows() -> None:
    answer = _newest_rows_answer()
    grounded, from_form = ground_buyback(
        answer, "Şirketimiz 24.11.2026 tarihinde 304.153 TL nominal pay almıştır.", "MAVI"
    )
    assert grounded == answer and from_form is False
    abstained, from_form = ground_buyback({**answer, "status": "abstain"}, MAVI_FAILED["text_tr"], "MAVI")
    assert from_form is False and len(abstained["transactions"]) == 1


def test_mavi_with_rules_met_but_no_similar_past_events_holds_and_says_why() -> None:
    state = _state(MAVI_ANSWERED)
    result = decide(rule_input(state, _ctx(MAVI_ANSWERED), None, "no_evidence"))  # type: ignore[arg-type]
    assert result.outcome == "HOLD"
    assert set(result.reason_codes) == {"NO_EVIDENCE", "EDGE_UNKNOWN", "LEAKAGE_HALF"}
    assert [c.rule for c in result.trace if c.passed] == ["E1.capital_10d", "E1.execution", "E1.no_recent_sale"]
    leak = next(c for c in result.trace if c.rule == "LEAK.ret5d")
    assert leak.observed == "bilinmiyor"  # no prices in this run: never shown as %0
    edge = result.trace[-1]
    assert edge.rule == "EDGE.edge_cost" and edge.observed == "bilinmiyor"
    assert "benzer geçmiş olay yok" in edge.detail_tr and "karşılamıyor" not in edge.detail_tr
    assert not any(c.startswith("HOLD_AGENT") for c in result.reason_codes)


def test_a_priced_edge_below_cost_is_still_no_trade() -> None:
    sizing = {"expected_edge_bps": 10.0, "est_cost_bps": 40.0}
    result = decide(rule_input(_state(MAVI_ANSWERED), _ctx(MAVI_ANSWERED), sizing))  # type: ignore[arg-type]
    assert result.outcome == "NO_TRADE" and "EDGE_BELOW_COST" in result.reason_codes


def test_a_skeptic_veto_stays_no_trade_even_when_edge_is_unknown() -> None:
    skeptic = {**MAVI_ANSWERED["nodes"]["skeptic"], "veto": True, "flags": [{"code": "X", "severity": "veto"}]}
    state = _state(MAVI_ANSWERED, skeptic=skeptic)
    result = decide(rule_input(state, _ctx(MAVI_ANSWERED), None, "missed"))  # type: ignore[arg-type]
    assert result.outcome == "NO_TRADE" and "SKEPTIC_VETO" in result.reason_codes


# ── what must still hold ────────────────────────────────────────────────────────────────────────────────────────
def test_the_sokm_reader_really_abstained_and_that_still_holds_with_its_reason() -> None:
    assert SOKM["nodes"]["reader"]["status"] == "abstain"
    result = decide(rule_input(_state(SOKM), _ctx(SOKM), None))  # type: ignore[arg-type]
    assert result.outcome == "HOLD" and result.reason_codes == ("HOLD_AGENT_ABSTAIN",)
    detail = result.trace[0].detail_tr
    assert detail.startswith("Okuyucu çekimser kaldı (Okuyucu: Metinde yalnızca toplu pay/oy hakkı oranı")
    assert detail.endswith("): HOLD.")


def test_a_reader_with_no_answer_still_holds_as_failed() -> None:
    merged = {**MAVI_FAILED["nodes"]["merge"]}
    assert merged["agent_status"]["reader"] == "failed"  # as recorded
    state = _state(MAVI_FAILED, reader=None, merged=merged)
    result = decide(rule_input(state, _ctx(MAVI_FAILED), None))  # type: ignore[arg-type]
    assert result.outcome == "HOLD" and result.reason_codes == ("HOLD_AGENT_FAILED",)
    assert result.trace[0].detail_tr == "Okuyucu çalışmadı (modelden geçerli bir yanıt alınamadı): HOLD."


def test_a_cut_off_answer_is_named_in_the_trace() -> None:
    assert failure_note(InvalidOutputError("truncated", provider="gemini")) == (
        "Modelin yanıtı eksik ya da bozuk geldi: HOLD"
    )
