"""Tool output → the documents the graph carries: the evidence store merge reads, the market facts the
Materiality prompt sees, and the grounding of the Materiality answer (the model cites, the code fills in).
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from decimal import Decimal
from typing import Any, Final

from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.agents import EvidenceSelection, MaterialityOutput, strength_for_n
from kaptan.evidence.market import MaterialityInputs, PriceContext
from kaptan.evidence.params import MAX_CARD_EVENTS
from kaptan.evidence.service import ScopedStudy

DIGITS: Final = 6
#: Event type → (denominator kind, materiality input) as the Materiality prompt defines it (06 §3).
DENOMINATORS: Final[dict[str, tuple[str, str]]] = {
    "E1": ("paid_in_capital", "paid_in_capital_try"),
    "E2": ("free_float_mcap", "free_float_mcap_try"),
    "E3": ("annual_revenue", "annual_revenue_try"),
}
LIST_FIELDS: Final = ("secondary", "fx_rates", "e4_lines")
STRENGTH_ORDER: Final = ("insufficient", "weak", "moderate", "strong")


def _r(x: float) -> float:
    return round(x, DIGITS)


def _f(x: Decimal | float | None) -> float | None:
    return None if x is None else float(x)


def evidence_store(scoped: ScopedStudy) -> dict[str, Any] | None:
    """The store `merge.evidence_card` turns into the card (EventStats + EvidenceEvent shapes).

    The statistics cover every usable past event, not the Evidence agent's pick: the model chooses
    what to cite, never what the numbers are. None when there is not a single usable event."""
    r = scoped.result
    if r.n == 0:
        return None
    s5, s20 = r.stats[5], r.stats[20]
    ids = sorted(x.event.ref_id for x in r.results)
    newest = sorted(r.results, key=lambda x: (x.event.published_at, x.event.ref_id), reverse=True)[:MAX_CARD_EVENTS]
    stats = {
        "ref_id": "stats:" + hashlib.sha256(",".join(ids).encode()).hexdigest()[:16],
        "n": r.n,
        "n_same_ticker": sum(1 for x in r.results if x.event.ticker == scoped.ticker),
        "median_car_5d": _r(s5.median),
        "mean_car_5d": _r(s5.mean),
        "hit_rate_5d": _r(s5.hit_rate),
        "median_car_20d": _r(s20.median),
        "mean_car_20d": _r(s20.mean),
        "hit_rate_20d": _r(s20.hit_rate),
        "ci95_car_20d": [_r(s20.ci95[0]), _r(s20.ci95[1])],
        "dispersion_iqr_20d": _r(max(s20.iqr, 0.0)),
    }
    events = [
        {
            "ref_id": x.event.ref_id,
            "ticker": x.event.ticker,
            "company_name": x.event.company_name,
            "published_at": iso_ms(x.event.published_at),
            "title": x.event.title,
            "car_1d": _r(x.cars[1]),
            "car_5d": _r(x.cars[5]),
            "car_20d": _r(x.cars[20]),
            "car_60d": _r(x.cars[60]) if 60 in x.cars else None,
        }
        for x in newest
    ]
    return {
        "stats": stats,
        "strength": strength_for_n(r.n),
        "retrieved_ids": [e["ref_id"] for e in events],
        "events": events,
    }


def market_facts(pc: PriceContext | None, mi: MaterialityInputs | None) -> dict[str, float]:
    """Numeric facts for the Materiality prompt (TASK_CONTEXT.market_data rows `feat:<T>:<name>`)."""
    if pc is None or mi is None:
        return {}
    values: dict[str, float | None] = {
        "last_close_try": _f(pc.last_close_try),
        **{f"ret_{k}d": pc.returns.get(k) for k in sorted(pc.returns)},
        "ret_3m": pc.ret_3m,
        "vol_20d": pc.vol_20d,
        "adv20_try": _f(pc.adv20_try),
        "ret_5d_mkt_adj": pc.ret_5d_mkt_adj,
        "ret_10d_mkt_adj": pc.ret_10d_mkt_adj,
        "market_cap_try": _f(mi.market_cap_try),
        "free_float_mcap_try": _f(mi.free_float_mcap_try),
        "paid_in_capital_try": _f(mi.paid_in_capital_try),
        "annual_revenue_try": _f(mi.annual_revenue_try),
    }
    return {k: _r(v) for k, v in values.items() if v is not None}


def merge_features(pc: PriceContext | None) -> dict[str, Any]:
    """The point-in-time snapshot merge folds into MergedFeatures (only fields that schema has)."""
    if pc is None:
        return {}
    return {
        "leakage_5d_mkt_adj": None if pc.ret_5d_mkt_adj is None else _r(pc.ret_5d_mkt_adj),
        "ret_10d_mkt_adj": None if pc.ret_10d_mkt_adj is None else _r(pc.ret_10d_mkt_adj),
        "ret_3m": None if pc.ret_3m is None else _r(pc.ret_3m),
    }


def fact_ref(ticker: str, name: str) -> str:
    return f"feat:{ticker}:{name}"  # the ref_id task_context gives each market_data row


def ground_materiality(
    out: Mapping[str, Any], event_type: str, ticker: str, facts: Mapping[str, float], allowed: Mapping[str, float]
) -> dict[str, Any]:
    """Replace every number of the Materiality answer with the tool's value.

    `facts`: tool facts by name; `allowed`: every ref_id the prompt offered → its value. Denominator,
    market cap and close are set by the code from the facts; a cited list entry survives only if its
    ref_id was offered (its value is overwritten). Whatever the tools lack goes to `data_gaps`."""
    gaps = list(out.get("data_gaps") or [])

    def ref(name: str, label: str) -> dict[str, Any] | None:
        if name not in facts:
            if name not in gaps:
                gaps.append(name)
            return None
        return {"name": label, "value": facts[name], "ref_id": fact_ref(ticker, name)}

    def cite(v: Mapping[str, Any]) -> dict[str, Any] | None:
        rid = v.get("ref_id")
        if rid not in allowed:
            gaps.append(f"uncited:{v.get('name')}")
            return None
        return {"name": v.get("name"), "value": allowed[str(rid)], "ref_id": rid}

    kind, denominator = "none", None
    if event_type in DENOMINATORS:
        want, name = DENOMINATORS[event_type]
        denominator = ref(name, want)
        kind = want if denominator is not None else "none"
    doc = {
        **out,
        "denominator_kind": kind,
        "denominator": denominator,
        "revenue_available_at_as_of": "annual_revenue_try" in facts,
        "market_cap": ref("market_cap_try", "market_cap"),
        "trade_day_close": ref("last_close_try", "close_prev"),
        "financials_period_end": None,
        "financials_stale_days": None,
    }
    for list_field in LIST_FIELDS:
        doc[list_field] = [c for c in (cite(v) for v in out.get(list_field) or []) if c is not None]
    doc["data_gaps"] = list(dict.fromkeys(gaps))
    return MaterialityOutput.model_validate(doc).model_dump(mode="json")


def ground_selection(out: Mapping[str, Any], store: Mapping[str, Any] | None, ticker: str) -> dict[str, Any]:
    """Keep only past events the tools offered; counts are recomputed, the strength capped by n."""
    events = {e["ref_id"]: e for e in (store or {}).get("events") or []}
    picked = list(out.get("selected") or [])
    selected = [s for s in picked if s.get("ref_id") in events]
    reasons = list(out.get("exclusion_reasons") or [])
    if len(selected) < len(picked):
        reasons.append(f"uncited_ids:{len(picked) - len(selected)}")
    cap = str((store or {}).get("strength") or "insufficient")
    proposed = str(out.get("proposed_strength") or "insufficient")
    strength = min(proposed, cap, key=lambda s: STRENGTH_ORDER.index(s) if s in STRENGTH_ORDER else 0)
    announced_ref = out.get("already_announced_ref")
    doc = {
        **out,
        "selected": selected,
        "candidates_considered": len(events),
        "same_ticker_selected": sum(1 for s in selected if events[s["ref_id"]]["ticker"] == ticker),
        "exclusion_reasons": reasons,
        "proposed_strength": strength,
        "already_announced_ref": announced_ref if announced_ref in events else None,
    }
    return EvidenceSelection.model_validate(doc).model_dump(mode="json")
