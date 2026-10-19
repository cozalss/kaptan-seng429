"""TASK_CONTEXT for live prompts (05 §2.3): trusted, structured facts the code already holds.

Agent isolation (05 §8 L7): upstream agents' free text (`*_tr`, rationales, notes) never flows into the
next prompt, only enums, numbers, booleans and short codes. Everything here is built from the graph
state and the run context by plain dict access, so it is identical in replay and live mode and is not
part of the replay key.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

MAX_SHORT: Final = 64
MAX_CANDIDATES: Final = 40
#: The analysts that see "benzer geçmiş bildirimler" (RunContext.similar, kaptan.rag).
SIMILAR_AGENTS: Final = frozenset({"reader", "materiality", "evidence", "skeptic"})


def _short(value: Any) -> bool:
    return isinstance(value, str) and len(value) <= MAX_SHORT and "\n" not in value


def _plain(value: Any) -> bool:
    return value is None or isinstance(value, bool | int | float) or _short(value)


def structured(doc: Mapping[str, Any] | None) -> dict[str, Any]:
    """Keep only machine fields: numbers, booleans, nulls, short codes (and lists of those)."""
    out: dict[str, Any] = {}
    for key, value in (doc or {}).items():
        if key.endswith("_tr") or key in {"quotes", "rationale", "notes", "abstain"}:
            continue
        if _plain(value) or (isinstance(value, list) and all(_plain(v) for v in value)):
            out[key] = value
    return out


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def base_context(disclosure: Any) -> dict[str, Any]:
    return {
        "ticker": disclosure.ticker,
        "company_name": disclosure.company_name,
        "kap_subject": disclosure.subject,
        "published_at": _iso(disclosure.published_at),
        "as_of": _iso(disclosure.available_at),
        "source": "kap",
    }


def _market_data(ctx: Any) -> list[dict[str, Any]]:
    d, desk = ctx.disclosure, ctx.desk
    rows = [
        {"name": "last_price_try", "value": float(desk.last_price), "ref_id": f"px:{d.ticker}:last"},
        {"name": "adv20_try", "value": float(desk.adv20_try), "ref_id": f"px:{d.ticker}:adv20"},
        {"name": "free_float", "value": float(desk.free_float), "ref_id": f"issuer:{d.ticker}:free_float"},
    ]
    features = ctx.tools.features(d.fingerprint) or {}
    for name, value in structured(features).items():
        if isinstance(value, int | float) and not isinstance(value, bool):
            rows.append({"name": name, "value": value, "ref_id": f"feat:{d.ticker}:{name}"})
    return rows


def _candidates(ctx: Any) -> list[dict[str, Any]]:
    store = ctx.tools.evidence_store(ctx.disclosure.fingerprint) or {}
    keep = ("ref_id", "ticker", "company_name", "published_at", "title")  # never the returns
    return [{k: e.get(k) for k in keep} for e in (store.get("events") or [])[:MAX_CANDIDATES]]


def _guard_signals(guard: Mapping[str, Any] | None) -> dict[str, Any]:
    """Scores and counts only: the matched excerpts are untrusted text and stay out of TASK_CONTEXT."""
    g = guard or {}
    return {
        "quarantined": bool(g.get("quarantined")),
        "injection_score": g.get("injection_score"),
        "rule_hits_n": len(g.get("regex_hits") or []),
    }


def task_context(agent: str, state: Mapping[str, Any], ctx: Any) -> dict[str, Any]:
    out = base_context(ctx.disclosure)
    event_type = state.get("event_type")
    if event_type is not None:
        out["event_type"] = event_type
    route = state.get("route") or {}
    if route.get("sub_type_hint"):
        out["sub_type_hint"] = route["sub_type_hint"]
    similar = getattr(ctx, "similar", ())  # kaptan.rag, live mode only (empty in replay)
    if similar and agent in SIMILAR_AGENTS:
        out["similar_disclosures"] = ctx.similar_context()
    if agent == "materiality":
        out["market_data"] = _market_data(ctx)
    elif agent == "evidence":
        out["candidates"] = _candidates(ctx)
    elif agent == "skeptic":
        card = state.get("evidence_card") or {}
        out |= {
            "reader": structured(state.get("reader")),
            "merged": structured(state.get("merged")),
            "evidence": {"strength": card.get("strength"), **structured(card.get("stats"))},
        }
    elif agent == "compliance":
        out |= {
            "proposal": structured(state.get("proposal")),
            "skeptic_flags": [f.get("code") for f in (state.get("skeptic") or {}).get("flags", [])],
            "guard": _guard_signals(state.get("guard")),
            "restrictions": [{"kind": r.kind, "ref_id": r.source_ref} for r in ctx.desk.restrictions],
            "mode": ctx.desk.mode,
        }
    return out
