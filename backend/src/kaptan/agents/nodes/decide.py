"""rule_engine → risk_gate → request_approval → approval (interrupt) → execute → record.

Pure decisions (kaptan.rules, kaptan.risk.gate) wrapped as nodes. request_approval holds the side
effects' data (the card); approval is pure up to `interrupt()` (it re-runs on resume, 04 §5.5).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Final

from langgraph.runtime import Runtime
from langgraph.types import interrupt
from pydantic import ValidationError

from kaptan.agents.context import DeskState, RunContext
from kaptan.agents.nodes._common import step
from kaptan.agents.state import KaptanState
from kaptan.agents.trace import elapsed_until_now
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.trading import ApprovalDecision, TradeProposal
from kaptan.evidence.toolbox import live_tools
from kaptan.risk.gate import GateContext, GateOrder, evaluate, evaluate_at_send
from kaptan.rules import RuleInput, SizingInput, decide, size
from kaptan.rules.calendar import approval_expiry
from kaptan.sizing.plan import at_limit

EXIT_RULES: Final = ["X1 zaman çıkışı", "X2 kapanış bazlı ATR stop", "X6 stop yalnızca yukarı"]
NO_SKEPTIC_NOTE: Final = "Şüpheci ek bir risk bulmadı."


def _dec(x: Any) -> Decimal:
    return Decimal(str(x))


def _num(x: Decimal) -> int | float:
    return int(x) if x == x.to_integral_value() else float(x)


def rule_input(state: KaptanState, ctx: RunContext, sizing: dict[str, Any] | None) -> RuleInput:
    m = state.get("merged") or {}
    reader = state.get("reader") or {}
    sk = state.get("skeptic")
    e4 = m.get("e4") or {}
    flags = (sk or {}).get("flags", [])
    return RuleInput(
        event_type=str(state.get("event_type")),
        ticker=ctx.disclosure.ticker,
        agent_status=tuple(sorted((m.get("agent_status") or {}).items())),
        classifier_confidence=(state.get("classifier") or {}).get("confidence"),
        reader_confidence=reader.get("confidence"),
        materiality_confidence=(state.get("materiality") or {}).get("confidence"),
        skeptic_ran=sk is not None,
        skeptic_veto=bool((sk or {}).get("veto")),
        skeptic_veto_supported=any(f.get("severity") == "veto" for f in flags) or not (sk or {}).get("veto"),
        skeptic_confidence=(sk or {}).get("confidence"),
        any_injection_flag=bool(m.get("any_injection_flag")),
        e1_nature=reader.get("nature"),
        buyback_10d_capital_pct=m.get("buyback_10d_capital_pct"),
        buyback_10d_notice_count=m.get("buyback_10d_notice_count"),
        buyback_sale_within_20d=m.get("buyback_sale_within_20d"),
        insider_role=reader.get("role"),
        insider_open_market=reader.get("open_market"),
        insider_net_buy_value_try=m.get("insider_net_buy_value_try") or m.get("reader_amount"),
        materiality_ratio=m.get("amount_to_revenue_annualized") or m.get("amount_to_mcap"),
        materiality_denominator=m.get("e3_denominator"),
        binding_status=reader.get("binding_status"),
        related_party=reader.get("related_party"),
        renewal=reader.get("is_renewal_or_extension"),
        reader_amount_try=m.get("reader_amount"),
        amount_in_text=m.get("amount_in_text"),
        e4_sue=e4.get("e4_sue"),
        e4_cfo_quality=e4.get("e4_cfo_quality"),
        ret_10d=m.get("ret_10d_mkt_adj"),
        leakage_5d=m.get("leakage_5d_mkt_adj"),
        expected_edge_bps=(sizing or {}).get("expected_edge_bps"),
        est_cost_bps=(sizing or {}).get("est_cost_bps"),
        evidence_n=m.get("evidence_n"),
        evidence_card_id=m.get("evidence_card_id"),
    )


def proposal_document(
    state: KaptanState, ctx: RunContext, sizing: dict[str, Any], m_leak: Decimal, escalate: bool
) -> dict[str, Any]:
    d, m = ctx.disclosure, state.get("merged") or {}
    skeptic_m = _dec((state.get("skeptic") or {}).get("size_multiplier", 1))
    regime_m = ctx.params.crisis_multiplier if ctx.desk.regime == "crisis" else Decimal(1)
    evidence_m = _dec(sizing.get("evidence_multiplier", 1))  # live sizer only (06 §7.1 m_evidence)
    x = SizingInput(
        ref_price=_dec(sizing["ref_price"]),
        stop_pct=_dec(sizing["stop_pct"]),
        requested_notional_try=_dec(sizing["requested_notional_try"]),
        upper_limit=_dec(m["upper_limit"]) if m.get("upper_limit") else None,
        skeptic_multiplier=skeptic_m,
        leakage_multiplier=m_leak,
        regime_multiplier=regime_m,
        evidence_multiplier=evidence_m,
    )
    s = size(x, ctx.params)
    if sizing.get("limit_price") is not None:  # live sizer: the limit is on the BIST tick grid
        s = at_limit(s, x, _dec(sizing["limit_price"]))
    rules = state.get("rules") or {}
    holding = sizing["holding_days"]
    return {
        "proposal_id": d.run_id.replace("run-", "prop-", 1),
        "run_id": d.run_id,
        "strategy_version": d.strategy_version,
        "rules_hash": ctx.params.rules_hash,
        "prompt_manifest_hash": ctx.prompt_manifest_hash,
        "disclosure_index": d.disclosure_index,
        "ticker": d.ticker,
        "venue": "BIST",
        "side": "buy",
        "event_type": state.get("event_type"),
        "rule_ids": list(rules.get("rules_fired", [])),
        "entry": sizing["entry"],
        "limit_price": _num(s.limit_price),
        "ref_price": sizing["ref_price"],
        "ref_price_at": iso_ms(d.published_at),
        "requested_notional_try": sizing["requested_notional_try"],
        "requested_qty": s.qty,
        "stop_price": _num(s.stop_price),
        "holding_days_min": holding[0],
        "holding_days_max": holding[1],
        "exit_rules": list(EXIT_RULES),
        "expected_edge_bps": sizing["expected_edge_bps"],
        "est_cost_bps": sizing["est_cost_bps"],
        "multipliers": {
            "evidence": _num(evidence_m),
            "skeptic": _num(skeptic_m),
            "leakage": _num(m_leak),
            "regime": _num(regime_m),
        },
        "confidence": (state.get("classifier") or {}).get("confidence", 0),
        "evidence_card_id": m.get("evidence_card_id"),
        "evidence_ids": list(m.get("evidence_ids", [])),
        "retrieved_ids": list(m.get("retrieved_ids", [])),
        "escalate_required": escalate,
        "degraded": bool(m.get("degraded")),
    }


async def prepare_live_sizing(state: KaptanState, ctx: RunContext) -> None:
    """LLM_MODE=live: run the live sizer (kaptan.sizing) before the rules read `sizing`; replay: nothing."""
    live = live_tools(ctx.tools)
    if live is None or state.get("event_type") not in ("E1", "E2", "E3", "E4"):
        return
    m = state.get("merged") or {}
    await live.prepare_sizing(
        str(state.get("event_type")),
        equity_try=ctx.desk.equity_try,
        upper_limit=_dec(m["upper_limit"]) if m.get("upper_limit") else None,
        t_dec=elapsed_until_now(state.get("steps", []), ctx.disclosure.available_at),
        personal=ctx.desk.mode == "personal",
    )


async def rule_engine(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    await prepare_live_sizing(state, ctx)
    sizing = ctx.tools.sizing(ctx.disclosure.fingerprint)
    result = decide(rule_input(state, ctx, dict(sizing) if sizing else None), ctx.params)
    rules = {**result.as_document(), "leakage_multiplier": str(result.leakage_multiplier)}
    update: dict[str, Any] = {"rules": rules, "steps": [step(ctx, "rule_engine")]}
    if sizing is None and live_tools(ctx.tools) is not None and "EDGE_BELOW_COST" in result.reason_codes:
        # live: the sizer could not price edge/cost (no data) → unknown, never a NO_TRADE verdict on a guess
        return update | {"proposal": None, "status": "completed", "outcome": "HOLD"}
    if result.outcome != "PROPOSE":
        return update | {"proposal": None, "status": "completed", "outcome": result.outcome}
    if sizing is None:  # no sizer answer: never guess a size
        return update | {"proposal": None, "status": "completed", "outcome": "HOLD"}
    proposal = proposal_document(
        {**state, "rules": rules}, ctx, dict(sizing), result.leakage_multiplier, result.escalate
    )
    if proposal["requested_qty"] <= 0:
        return update | {"proposal": None, "status": "completed", "outcome": "NO_TRADE"}
    return update | {"proposal": proposal, "outcome": "PROPOSE"}


def live_gate_fields(p: dict[str, Any], desk: DeskState) -> dict[str, Any]:
    """The gate inputs only a real run computes (kaptan.risk.desk); none for the demo (replay stays identical)."""
    if not desk.live:
        return {}
    try:
        TradeProposal.model_validate(p)
        schema_ok = True
    except ValidationError:
        schema_ok = False
    return {
        "restrictions_age_h": desk.restrictions_age_h,
        "kap_delay_s": desk.kap_delay_s,
        # R09 staleness matters for an order into the running session; an auction order is banded on the close.
        "price_age_s": desk.price_age_s if p.get("entry") == "intraday_limit" else 0.0,
        "daily_entries": desk.daily_entries,
        "sector_exposure_pct": desk.sector_exposure_pct,
        "group_exposure_pct": desk.group_exposure_pct,
        "schema_ok": schema_ok,
    }


def gate_inputs(state: KaptanState, ctx: RunContext, qty: int | None = None) -> tuple[GateOrder, GateContext]:
    p, m, desk = state["proposal"] or {}, state.get("merged") or {}, ctx.desk
    sizing = ctx.tools.sizing(ctx.disclosure.fingerprint) or {}
    order = GateOrder(
        ticker=p["ticker"],
        event_type=p["event_type"],
        qty=qty if qty is not None else p["requested_qty"],
        limit_price=_dec(p["limit_price"]),
        stop_pct=_dec(sizing.get("stop_pct", 0)),
        reader_amount=_dec(m["reader_amount"]) if m.get("reader_amount") is not None else None,
        regex_amounts=tuple(_dec(a) for a in m.get("regex_amounts", [])),
        evidence_ids=tuple(p["evidence_ids"]),
        retrieved_ids=tuple(p["retrieved_ids"]),
        expected_edge_bps=_dec(p["expected_edge_bps"]),
        est_cost_bps=_dec(p["est_cost_bps"]),
        escalate_required=bool(p["escalate_required"]),
        degraded=bool(p["degraded"]),
    )
    compliance = (state.get("compliance") or {}).get("decision", "pass")
    gctx = GateContext(
        equity_try=desk.equity_try,
        last_price=_dec(m.get("last_price") or desk.last_price),
        adv20_try=desk.adv20_try,
        cash_free_try=desk.equity_try if desk.cash_free_try is None else desk.cash_free_try,
        upper_limit=_dec(m["upper_limit"]) if m.get("upper_limit") else None,
        kill_switch_on=desk.kill_switch_on,
        drawdown_pct=desk.drawdown_pct,
        daily_pnl_pct=desk.daily_pnl_pct,
        halted_today=desk.halted_today,
        in_universe=desk.in_universe,
        restrictions=tuple(r.kind for r in desk.restrictions),
        team_blocklisted=any(r.kind == "team_insider" for r in desk.restrictions),
        quota_ok=desk.quota_ok,
        injection_flag=bool((state.get("guard") or {}).get("quarantined")),
        n_open_positions=desk.n_open_positions,
        holds_ticker=desk.holds_ticker,
        regime="crisis" if desk.regime == "crisis" else "normal",
        mode=desk.mode,
        live_armed=desk.live_armed,
        compliance_decision="escalate" if compliance == "escalate" else "pass",
        **live_gate_fields(p, desk),
    )
    return order, gctx


async def risk_gate(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    order, gctx = gate_inputs(state, ctx)
    verdict = evaluate(order, gctx, ctx.limits)
    risk = {
        "verdict": verdict.verdict,
        "final_qty": verdict.final_qty,
        "level": verdict.level,
        "escalation_reasons": list(verdict.escalation_reasons),
        "checks": [r.as_document() for r in verdict.results],
    }
    update: dict[str, Any] = {"risk": risk, "steps": [step(ctx, "risk_gate")]}
    if not verdict.approved:
        update |= {"status": "completed", "outcome": "NO_TRADE"}
    return update


def approval_card(state: KaptanState, ctx: RunContext, created_at: Any) -> dict[str, Any]:
    p, risk, d = state["proposal"] or {}, state["risk"] or {}, ctx.disclosure
    card = state.get("evidence_card")
    sk = state.get("skeptic")
    compliance = (state.get("compliance") or {}).get("decision")
    qty = int(risk["final_qty"])
    limit = _dec(p["limit_price"])
    return {
        "kind": "trade_approval",
        "proposal_id": p["proposal_id"],
        "run_id": d.run_id,
        "ticker": d.ticker,
        "company_name": d.company_name,
        "side": "buy",
        "event_type": p["event_type"],
        "sub_type_tr": ctx.tools.sub_type_label(d.fingerprint) or _sub_type_tr(state),
        "headline_tr": d.summary,
        "disclosure_index": d.disclosure_index,
        "disclosure_url": f"https://www.kap.org.tr/tr/Bildirim/{d.disclosure_index}",
        "final_notional_try": round(limit * qty),
        "requested_notional_try": p["requested_notional_try"],
        "limit_price": p["limit_price"],
        "qty": qty,
        "entry": p["entry"],
        "holding_days": [p["holding_days_min"], p["holding_days_max"]],
        "level": risk["level"],
        "escalation_reasons": list(risk["escalation_reasons"]),
        "evidence_summary": {
            "n": card["stats"]["n"] if card else 0,
            "median_car_5d": card["stats"]["median_car_5d"] if card else 0,
            "median_car_20d": card["stats"]["median_car_20d"] if card else 0,
            "hit_rate_5d": card["stats"]["hit_rate_5d"] if card else 0,
            "strength": card["strength"] if card else "insufficient",
            "card_id": card["card_id"] if card else "",
        },
        "skeptic_flags": [{k: v for k, v in f.items() if k != "supporting_ref"} for f in (sk or {}).get("flags", [])],
        "skeptic_note_tr": (sk or {}).get("strongest_counterargument_tr") or NO_SKEPTIC_NOTE,
        "size_multiplier": (sk or {}).get("size_multiplier", 1),
        "compliance_summary_tr": "Tedbir yok; bir kontrol insan incelemesi istiyor."
        if compliance == "escalate"
        else "Tedbir yok, injection yok.",
        "rule_trace_summary": list((state.get("rules") or {}).get("trace", [])),
        "degraded": bool(p["degraded"]),
        "prompt_manifest_hash": ctx.prompt_manifest_hash,
        "created_at": iso_ms(created_at),
        "expires_at": iso_ms(approval_expiry(created_at)),
        "status": "pending",
        "decided_by": None,
        "decided_role": None,
        "decided_at": None,
        "decision_comment": None,
        "approved_notional_try": None,
        "is_fixture": d.is_fixture,
    }


def _sub_type_tr(state: KaptanState) -> str:
    return str((state.get("classifier") or {}).get("sub_type") or state["route"]["sub_type_hint"])


async def request_approval(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Side-effect node: the card is what run_scenario persists and announces (SSE approval.requested)."""
    ctx = runtime.context
    created = elapsed_until_now(state.get("steps", []), ctx.disclosure.available_at)
    escalate = (state["risk"] or {}).get("level") == "escalate"
    proposal = {
        **(state["proposal"] or {}),
        "escalate_required": bool((state["proposal"] or {}).get("escalate_required")) or escalate,
    }
    card = approval_card({**state, "proposal": proposal}, ctx, created)
    return {
        "proposal": proposal,
        "approval_card": card,
        "status": "interrupted",
        "outcome": "PROPOSE",
        "steps": [step(ctx, "request_approval")],
    }


async def approval(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Pure until interrupt(): a resume re-runs this node and interrupt() returns the decision."""
    ctx = runtime.context
    card = state["approval_card"] or {}
    raw = interrupt(
        {
            "kind": "trade_approval",
            "proposal_id": card.get("proposal_id"),
            "final_notional_try": card.get("final_notional_try"),
            "expires_at": card.get("expires_at"),
        }
    )
    if isinstance(raw, dict) and raw.get("decision") == "expire":  # 09:50 of the next session (R15)
        decision: dict[str, Any] = {"decision": "expire", "approved_notional_try": None, "comment": ""}
    else:
        decision = ApprovalDecision.model_validate(raw).model_dump(mode="json")  # never trust the resume value
    approved = decision.get("approved_notional_try")
    if approved is not None and approved > card.get("final_notional_try", 0):  # never grows (05 §6)
        decision = {**decision, "decision": "reject", "comment": "onaylanan tutar öneriden büyük (engellendi)"}
    update: dict[str, Any] = {"decision": decision, "steps": [step(ctx, "approval")]}
    if decision["decision"] != "approve":
        update["status"] = "completed"
    return update


async def execute(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """R16 at send time; the order itself is placed by the approvals service (package A, M1)."""
    ctx = runtime.context
    order, gctx = gate_inputs(state, ctx, qty=(state["risk"] or {}).get("final_qty"))
    at_send = evaluate_at_send(order, gctx, ctx.limits)
    risk = {**(state["risk"] or {})}
    risk["checks"] = [*risk.get("checks", []), at_send.as_document()]
    return {"risk": risk, "status": "completed", "steps": [step(ctx, "execute")]}


async def filter_action(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Not an E1–E4 event: archive (and flag open positions for an exit review in M2)."""
    return {"status": "completed", "outcome": "NO_TRADE", "steps": [step(runtime.context, "filter_action")]}


async def record(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    update: dict[str, Any] = {"steps": [step(runtime.context, "record")]}
    if state.get("status") not in ("completed", "interrupted"):
        update["status"] = "completed"
    return update


__all__ = [
    "approval",
    "execute",
    "filter_action",
    "record",
    "request_approval",
    "risk_gate",
    "rule_engine",
]
