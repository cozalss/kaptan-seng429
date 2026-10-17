"""route → pre_gate → guard: everything that happens before (or instead of) the first model call.

pre_gate is the LLM-free first brake (06 R03, R04, R13): no model — Prompt Guard included — ever sees
a disclosure it vetoes. guard sanitises: Turkish rule-based injection patterns, masked person names
(KİŞİ_n) and the Prompt Guard score (the only model call here, not counted as an LLM call).
"""

from __future__ import annotations

import re
from typing import Any, Final

from langgraph.runtime import Runtime

from kaptan.agents.context import Restriction, RunContext
from kaptan.agents.nodes._common import ask_or_fail, step
from kaptan.agents.state import KaptanState
from kaptan.agents.subject_map import TABLE_VERSION, route_of
from kaptan.risk.gate import HARD_RESTRICTIONS
from kaptan.rules.format import fmt_dec

RESTRICTION_LABELS: Final = {
    "spk_tedbir": "SPK tedbiri",
    "vbts_brut_takas": "VBTS brüt takas tedbiri",
    "vbts_aciga_satis": "VBTS açığa satış yasağı",
    "vbts_kredili_islem": "VBTS kredili işlem yasağı",
    "vbts_tek_fiyat": "VBTS tek fiyat tedbiri",
    "trading_halt": "İşlem durdurma",
}
NO_LLM: Final = "LLM çağrısı yapılmadı"
PASS_REASONS: Final = ("R03 evren ✓", "R04 tedbir yok ✓", "R13 engel listesi dışı ✓")

#: Turkish injection patterns (09 §4): name → regex. A hit is quoted verbatim in the guard result.
INJECTION_PATTERNS: Final = (
    ("talimat_kalibi", re.compile(r"(?:önceki|tüm|bütün)[^.\n]{0,24}talimatlar[ıi]\s+(?:yok\s+say|unut)", re.I)),
    ("onay_atlatma", re.compile(r"onay\s+(?:isteme|alma|bekleme)\b", re.I)),
    ("rol_degistirme", re.compile(r"\b(?:sen\s+artık|bundan\s+sonra\s+sen)\b", re.I)),
)
MASKED_NAME: Final = re.compile(r"\b(?:KİŞİ|KURUM)_\d+\b")
QUARANTINE_SCORE: Final = 0.9


async def route(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    target, hint = route_of(ctx.disclosure.subject)
    return {
        "route": {"route": target, "sub_type_hint": hint, "table_version": TABLE_VERSION},
        "steps": [step(ctx, "route")],
        "llm_calls": 0,
    }


def _veto_reasons(restrictions: tuple[Restriction, ...], in_universe: bool) -> list[str] | None:
    if not in_universe:
        return ["R03_UNIVERSE: hisse evren dışında — sert veto", NO_LLM]
    hard = [r for r in restrictions if r.kind in HARD_RESTRICTIONS]
    if hard:
        r = hard[0]
        reasons = [f"R04_RESTRICTED: {RESTRICTION_LABELS[r.kind]} ({r.kind}) — sert veto"]
        if r.source_ref:
            prefix = "Borsa İstanbul " if r.kind.startswith("vbts_") else ""
            reasons.append(f"Dayanak: {prefix}{r.source_ref}")
        return [*reasons, NO_LLM]
    if any(r.kind == "team_insider" for r in restrictions):
        return ["R13_INSIDER_BLOCKLIST: ekip içeriden-öğrenen engel listesinde (team_insider)", NO_LLM]
    return None


async def pre_gate(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    vetoed = _veto_reasons(ctx.desk.restrictions, ctx.desk.in_universe)
    if vetoed is not None:
        return {
            "pre_gate": {"passed": False, "reasons": vetoed},
            "status": "completed",
            "outcome": "PREGATE_VETO",
            "steps": [step(ctx, "pre_gate", note="Sert veto — LLM çağrısı 0")],
        }
    return {"pre_gate": {"passed": True, "reasons": list(PASS_REASONS)}, "steps": [step(ctx, "pre_gate")]}


def regex_hits(text: str) -> list[str]:
    hits: list[str] = []
    for name, pattern in INJECTION_PATTERNS:
        m = pattern.search(text)
        if m is not None:
            hits.append(f"{name}: “{m.group(0)}”")
    return hits


def chunks_of(text: str) -> int:
    return max(1, sum(1 for block in text.split("\n\n") if block.strip()))


async def guard(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    text = ctx.disclosure.text_tr
    hits = regex_hits(text)
    scored, _row = await ask_or_fail(ctx, "guard", None)
    if scored is None:  # Prompt Guard unreachable: nothing goes to a model unscreened
        row = step(ctx, "guard", status="failed", note="Prompt Guard yanıt vermedi: HOLD")
        return {"guard": None, "status": "completed", "outcome": "HOLD", "steps": [row]}
    score = float(scored["injection_score"])
    quarantined = score >= QUARANTINE_SCORE or len(hits) >= 2
    result = {
        "quarantined": quarantined,
        "injection_score": score,
        "regex_hits": hits,
        "chunks_scored": chunks_of(text),
        "masked_names_n": len(MASKED_NAME.findall(text)),
    }
    note = f"Prompt Guard {fmt_dec(score, 2)} → karantina" if quarantined else None
    return {"guard": result, "steps": [step(ctx, "guard", note=note)]}
