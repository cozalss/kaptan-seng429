"""merge (Birleştirme, 05 §5.0): the deterministic fan-in of the three branches.

Computes with Decimal what no model may compute: the amount the Reader extracted, its regex cross-check
against the text (R14), the annualised amount over the Materiality agent's denominator, price limits,
and the evidence card (selection + event-study statistics). Point-in-time market/history features
come from the toolbox snapshot; computed fields always win over it.

LLM_MODE=live (a `LiveToolbox`): price limits are base ±10 % on the BIST tick grid
(`kaptan.market.ticks`), E1/E2/E4 features come from point-in-time history (`kaptan.market.features`)
and a USD/EUR E3 amount is converted at the TCMB rate published before `available_at` (unknown rate →
unknown amount). Replay keeps `last × 1.1` and the recorded snapshot, byte for byte.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final

from langgraph.runtime import Runtime

from kaptan.agents.context import RunContext
from kaptan.agents.nodes._common import step
from kaptan.agents.state import KaptanState
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.rules import MergedFeatures
from kaptan.evidence.toolbox import LiveToolbox, live_tools
from kaptan.market.features import MergeInputs, amount_try, fx_text_amounts, limits_of, live_features
from kaptan.rules.params import BINDING_STATUSES

AMOUNT_RE: Final = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(?:TL|₺)")
AMOUNT_TOLERANCE: Final = Decimal("0.005")
CENT: Final = Decimal("0.01")


def regex_amounts(text: str, duration_months: float | None = None) -> list[Decimal]:
    """TL amounts written in the text, plus their monthly equivalents when a duration is stated."""
    found: list[Decimal] = []
    for whole, frac in AMOUNT_RE.findall(text):
        value = Decimal(whole.replace(".", "") + (f".{frac}" if frac else ""))
        if value > 0 and value not in found:
            found.append(value)
    if duration_months and duration_months > 0:
        # A model may write the duration as a float (24.0, 24.5); go through str so Decimal stays exact.
        months = Decimal(str(duration_months))
        monthly = [(v / months).quantize(Decimal(1), rounding=ROUND_HALF_UP) for v in found]
        found.extend(m for m in monthly if m not in found)
    return found


def amount_in_text(amount: Decimal | None, amounts: list[Decimal]) -> bool | None:
    if amount is None:
        return None
    return any(abs(a - amount) <= abs(amount) * AMOUNT_TOLERANCE for a in amounts)


def reader_amount(reader: dict[str, Any] | None) -> Decimal | None:
    if not reader:
        return None
    kind = reader.get("kind")
    if kind == "E3":
        value = reader.get("amount_try_stated") or reader.get("amount")
    elif kind == "E2":
        value = sum((t.get("value_tl") or 0) for t in reader.get("trades", [])) or None
    elif kind == "E1":
        value = reader.get("cumulative_nominal_tl")
    else:
        value = None
    return None if value is None else Decimal(str(value))


def _num(x: Decimal | None) -> float | int | None:
    if x is None:
        return None
    return int(x) if x == x.to_integral_value() else float(x)


def e3_ratio(reader: dict[str, Any], materiality: dict[str, Any] | None, amount: Decimal) -> tuple[Decimal | None, str]:
    """Annualised amount / annual revenue (fallback: amount / market cap), 06 §3.3."""
    months = reader.get("duration_months")
    annual = amount * 12 / Decimal(months) if months and months > 12 else amount
    m = materiality or {}
    denominator = m.get("denominator") if m.get("denominator_kind") == "annual_revenue" else None
    if denominator and denominator.get("value"):
        return annual / Decimal(str(denominator["value"])), "annual_revenue"
    mcap = (m.get("market_cap") or {}).get("value")
    return (amount / Decimal(str(mcap)) if mcap else None), "market_cap"


def evidence_card(ctx: RunContext, selection: dict[str, Any] | None) -> tuple[dict[str, Any] | None, list[Any]]:
    store = ctx.tools.evidence_store(ctx.disclosure.fingerprint)
    if selection is None or store is None:
        return None, []
    run_id = ctx.disclosure.run_id
    card_id = f"card-{run_id.removeprefix('run-')}" if run_id.startswith("run-demo-") else f"card-{run_id}"
    card = {
        "selection": selection,
        "stats": dict(store["stats"]),
        "strength": store["strength"],
        "retrieved_ids": list(store["retrieved_ids"]),
        "card_id": card_id,
    }
    return card, list(store["events"])


def _statuses(state: KaptanState, card: dict[str, Any] | None) -> dict[str, str]:
    def of(doc: dict[str, Any] | None) -> str:
        return "failed" if doc is None else str(doc.get("status", "ok"))

    return {
        "classifier": of(state.get("classifier")),
        "reader": of(state.get("reader")),
        "materiality": of(state.get("materiality")),
        "evidence": "ok" if card else ("failed" if state.get("evidence_selection") is None else "skipped"),
    }


def empty_features() -> dict[str, Any]:
    """Every MergedFeatures field, unset: what an event type does not use stays null/empty."""
    out: dict[str, Any] = dict.fromkeys(MergedFeatures.model_fields)
    out |= {"regex_amounts": [], "evidence_ids": [], "retrieved_ids": [], "flags": [], "e4": {}}
    return out | {"agent_confidence": {}, "agent_status": {}, "degraded": False, "any_injection_flag": False}


def live_overrides(
    state: KaptanState, ctx: RunContext, live: LiveToolbox, inputs: MergeInputs, base: dict[str, Any]
) -> dict[str, Any]:
    """What the live tools compute instead of the replay rules (limits, E1/E2/E4 features, FX)."""
    d, reader, event = ctx.disclosure, state.get("reader"), str(state.get("event_type"))
    mi = None if live.price is None else live.price[1]
    lower, upper = limits_of(Decimal(str(base["last_price"])), inputs.market)
    out: dict[str, Any] = {"lower_limit": lower, "upper_limit": upper}
    out |= live_features(
        inputs,
        event_type=event,
        ticker=d.ticker,
        disclosure_index=d.disclosure_index,
        published_at=d.published_at,
        available_at=d.available_at,
        reader=reader,
        paid_in_capital=None if mi is None else mi.paid_in_capital_try,
        free_float_mcap=None if mi is None else mi.free_float_mcap_try,
    )
    amount = reader_amount(reader)
    if event != "E3" or reader is None or amount is None:
        return out
    duration = reader.get("duration_months")
    amounts = [*regex_amounts(d.text_tr, duration)]
    amounts += [a for a in fx_text_amounts(d.text_tr, inputs.currency) if a not in amounts]
    tl = amount_try(inputs, reader, amount)
    ratio, denominator = e3_ratio(reader, state.get("materiality"), tl) if tl is not None else (None, None)
    return out | {
        "regex_amounts": [_num(a) for a in amounts],
        "amount_in_text": amount_in_text(amount, amounts),
        "amount_try": _num(tl),
        "amount_to_revenue_annualized": _num(ratio) if denominator == "annual_revenue" else None,
        "amount_to_mcap": _num(ratio) if denominator == "market_cap" else None,
        "e3_denominator": denominator,
    }


def build_features(
    state: KaptanState, ctx: RunContext, card: dict[str, Any] | None, inputs: MergeInputs | None = None
) -> dict[str, Any]:
    d, desk = ctx.disclosure, ctx.desk
    reader, mat = state.get("reader"), state.get("materiality")
    event = str(state.get("event_type"))
    snapshot = dict(ctx.tools.features(d.fingerprint) or {})
    amount = reader_amount(reader)
    duration = reader.get("duration_months") if reader else None
    amounts = regex_amounts(d.text_tr, duration)
    last = Decimal(str((mat or {}).get("trade_day_close", {}).get("value") or desk.last_price))
    computed: dict[str, Any] = {
        "run_id": d.run_id,
        "disclosure_index": d.disclosure_index,
        "ticker": d.ticker,
        "as_of": iso_ms(d.published_at),
        "event_type": event,
        "sub_type": (state.get("classifier") or {}).get("sub_type") or state["route"]["sub_type_hint"],
        "agent_status": _statuses(state, card),
        "any_injection_flag": any(
            bool((doc or {}).get("injection_suspected")) for doc in (state.get("classifier"), reader)
        ),
        "reader_amount": _num(amount),
        "regex_amounts": [_num(a) for a in amounts],
        "amount_in_text": amount_in_text(amount, amounts),
        "last_price": _num(last),
        "price_at": iso_ms(d.published_at),
        "upper_limit": _num((last * Decimal("1.1")).quantize(CENT, rounding=ROUND_HALF_UP)),
        "lower_limit": _num((last * Decimal("0.9")).quantize(CENT, rounding=ROUND_HALF_UP)),
        "adv20_try": _num(desk.adv20_try),
        "free_float_pct": desk.free_float,
        "evidence_card_id": card["card_id"] if card else None,
        "evidence_strength": card["strength"] if card else None,
        "evidence_n": card["stats"]["n"] if card else None,
        "evidence_median_car_5d": card["stats"]["median_car_5d"] if card else None,
        "evidence_median_car_20d": card["stats"]["median_car_20d"] if card else None,
        "evidence_ids": [s["ref_id"] for s in card["selection"]["selected"]] if card else [],
        "retrieved_ids": card["retrieved_ids"] if card else [],
        "flags": [],  # the skeptic (next node) adds its flag codes
    }
    if event == "E3" and reader is not None and amount is not None:
        ratio, denominator = e3_ratio(reader, mat, amount)
        computed |= {
            "binding": reader.get("binding_status") in BINDING_STATUSES,
            "related_party": reader.get("related_party"),
            "renewal": reader.get("is_renewal_or_extension"),
            "amount_try": _num(amount),
            "amount_to_revenue_annualized": _num(ratio) if denominator == "annual_revenue" else None,
            "amount_to_mcap": _num(ratio) if denominator == "market_cap" else None,
            "e3_denominator": denominator,
        }
    live = live_tools(ctx.tools)
    if live is not None and inputs is not None:
        computed |= live_overrides(state, ctx, live, inputs, computed)
    return {**empty_features(), **snapshot, **computed}


async def merge(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    card, events = evidence_card(ctx, state.get("evidence_selection"))
    live = live_tools(ctx.tools)
    inputs = None
    if live is not None:  # LLM_MODE=live, a real disclosure: point-in-time history first
        inputs = await live.prepare_merge(str(state.get("event_type")), state.get("reader"))
    merged = build_features(state, ctx, card, inputs)
    note = "Tutar metinde yok ✗" if merged.get("amount_in_text") is False else "Oranlar Decimal ile hesaplandı"
    return {
        "merged": merged,
        "evidence_card": card,
        "evidence_events": events,
        "steps": [step(ctx, "merge", note=note)],
    }
