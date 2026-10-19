"""The documents of an exit proposal (SELL): TradeProposal, ApprovalCard and its "Neden?" (Explain).

Pure. The card goes through the normal approval flow (R15: every order, exits included, waits for a
human; level normal, or escalate when the symbol is restricted or an earlier exit expired). The
Explain is the original run's document with this run, proposal and card on top.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Final

from kaptan.approvals.fmt_tr import fmt_price
from kaptan.domain.schemas import iso_ms
from kaptan.portfolio.exit_rules import ExitRule

SUB_TYPE_TR: Final[dict[ExitRule, str]] = {
    "X1": "Zaman çıkışı (X1)",
    "X2": "Kapanış bazlı stop (X2)",
    "X3": "Olumsuz gelişme çıkışı (X3)",
    "X4": "Sinyal tersine döndü (X4)",
}
TRACE_RULE: Final[dict[ExitRule, str]] = {
    "X1": "HOLD.x1_time_exit",
    "X2": "HOLD.x2_close_stop",
    "X3": "AVOID.x3_negative_news",
    "X4": "HOLD.x4_signal_reversal",
}


@dataclass(frozen=True, slots=True)
class ExitInput:
    rule: ExitRule
    detail: str
    day: date
    now: datetime
    expires_at: datetime
    source_proposal: str
    source_doc: dict[str, Any]
    source_card: dict[str, Any] | None
    source_explain: dict[str, Any]
    run: dict[str, Any]  # source run: ticker, company_name, event_type, strategy_version, disclosure_index
    qty: int
    ref_price: float
    limit_price: float
    stop_price: float | None
    held_sessions: int
    level: str
    escalation_reasons: list[str]
    est_cost_bps: float


def ids(rule: ExitRule, source_proposal: str, day: date) -> tuple[str, str]:
    """(run_id, proposal_id) of the exit raised on `day`: stable, so the job is idempotent."""
    stem = f"exit-{rule.lower()}-{source_proposal.removeprefix('prop-')}-{day:%Y%m%d}"
    return f"run-{stem}", f"prop-{stem}"


def headline(x: ExitInput) -> str:
    if x.rule == "X1":
        return f"{x.held_sessions}. seans doldu: pozisyon kapanış seansında satılır."
    if x.rule == "X2":
        stop = fmt_price(x.stop_price) if x.stop_price is not None else "—"
        return f"Kapanış {fmt_price(x.ref_price)} TL, stop {stop} TL: ertesi açılışta satış."
    if x.rule == "X3":
        return "Hisse için olumsuz gelişme (tedbir / kaçınma bildirimi): ertesi açılışta satış."
    return "Giriş gerekçesi tersine döndü: ertesi açılışta satış."


def proposal_doc(x: ExitInput, run_id: str, proposal_id: str) -> dict[str, Any]:
    src = x.source_doc
    entry = "intraday_limit" if x.rule == "X1" else "next_open_auction"
    return {
        "proposal_id": proposal_id,
        "run_id": run_id,
        "strategy_version": x.run["strategy_version"],
        "rules_hash": src.get("rules_hash", ""),
        "prompt_manifest_hash": src.get("prompt_manifest_hash", ""),
        "disclosure_index": int(x.run["disclosure_index"]),
        "ticker": x.run["ticker"],
        "venue": "BIST",
        "side": "sell",
        "event_type": "EXIT",
        "rule_ids": [x.rule],
        "entry": entry,
        "limit_price": x.limit_price,
        "ref_price": x.ref_price,
        "ref_price_at": iso_ms(x.now),
        "requested_notional_try": round(x.qty * x.limit_price, 2),
        "requested_qty": x.qty,
        "stop_price": x.stop_price if x.stop_price is not None else x.limit_price,
        "holding_days_min": 1,
        "holding_days_max": 1,
        "exit_rules": [x.rule],
        "expected_edge_bps": 0.0,
        "est_cost_bps": x.est_cost_bps,
        "multipliers": {"evidence": 1.0, "skeptic": 1.0, "leakage": 1.0, "regime": 1.0},
        "confidence": 1.0,
        "evidence_card_id": None,
        "evidence_ids": [],
        "retrieved_ids": [],
        "escalate_required": x.level == "escalate",
        "degraded": False,
    }


def card_doc(x: ExitInput, proposal: dict[str, Any]) -> dict[str, Any]:
    src = x.source_card or {}
    evidence = src.get("evidence_summary") or {
        "n": 0,
        "median_car_5d": 0.0,
        "median_car_20d": 0.0,
        "hit_rate_5d": 0.0,
        "strength": "insufficient",
        "card_id": f"card-{proposal['run_id']}",
    }
    index = int(x.run["disclosure_index"])
    return {
        "kind": "trade_approval",
        "proposal_id": proposal["proposal_id"],
        "run_id": proposal["run_id"],
        "ticker": x.run["ticker"],
        "company_name": x.run["company_name"],
        "side": "sell",
        "event_type": "EXIT",
        "sub_type_tr": SUB_TYPE_TR[x.rule],
        "headline_tr": headline(x),
        "disclosure_index": index,
        "disclosure_url": f"https://www.kap.org.tr/tr/Bildirim/{index}",
        "final_notional_try": proposal["requested_notional_try"],
        "requested_notional_try": proposal["requested_notional_try"],
        "limit_price": x.limit_price,
        "qty": x.qty,
        "entry": proposal["entry"],
        "holding_days": [1, 1],
        "level": x.level,
        "escalation_reasons": list(x.escalation_reasons),
        "evidence_summary": evidence,
        "skeptic_flags": [],
        "skeptic_note_tr": "Çıkış kuralı: şüpheci değerlendirmesi gerekmez.",
        "size_multiplier": 1,
        "compliance_summary_tr": "Satış eldeki pozisyondan: açığa satış yok.",
        "rule_trace_summary": [
            {
                "rule": TRACE_RULE[x.rule],
                "passed": True,
                "observed": x.detail[:120],
                "threshold": None,
                "detail_tr": SUB_TYPE_TR[x.rule] + " tetiklendi.",
            }
        ],
        "degraded": False,
        "prompt_manifest_hash": proposal["prompt_manifest_hash"],
        "created_at": iso_ms(x.now),
        "expires_at": iso_ms(x.expires_at),
        "status": "pending",
        "decided_by": None,
        "decided_role": None,
        "decided_at": None,
        "decision_comment": None,
        "approved_notional_try": None,
        "is_fixture": False,
    }


def explain_doc(x: ExitInput, proposal: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    doc = copy.deepcopy(x.source_explain)
    base_run = dict(doc.get("run") or {})
    doc["run"] = {
        **base_run,
        "run_id": proposal["run_id"],
        "disclosure_index": proposal["disclosure_index"],
        "ticker": x.run["ticker"],
        "company_name": x.run["company_name"],
        "event_type": x.run["event_type"],
        "status": "interrupted",
        "outcome": "PROPOSE",
        "mode": "paper",
        "started_at": iso_ms(x.now),
        "finished_at": iso_ms(x.now),
        "llm_calls": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "latency_ms": 0,
        "strategy_version": x.run["strategy_version"],
        "is_fixture": False,
    }
    doc.update(proposal=proposal, approval=card, risk_checks=[], orders=[], fills=[], ticket=None, audit_positions=[])
    return doc
