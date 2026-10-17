"""The six LLM agents (05 §4): Classifier, Reader ‖ Materiality ‖ Evidence (Send fan-out), Skeptic,
Compliance. Each asks the provider once, schema-checks the answer and returns a document; none of
them computes a ratio or decides a trade (06 §0: "LLM hiçbir oranı hesaplamaz").
"""

from __future__ import annotations

import re
from typing import Any, Final

from langgraph.runtime import Runtime
from pydantic import BaseModel

from kaptan.agents.context import RunContext
from kaptan.agents.nodes._common import FANOUT_GROUP, ask_or_fail, step
from kaptan.agents.state import KaptanState
from kaptan.domain.schemas.agents import (
    BuybackExtraction,
    ClassifierOutput,
    ComplianceReport,
    ContractExtraction,
    EvidenceSelection,
    FinancialReportExtraction,
    InsiderTradeExtraction,
    MaterialityOutput,
    SkepticOutput,
)

EVENT_TYPES: Final = ("E1", "E2", "E3", "E4")
READER_SCHEMAS: Final[dict[str, type[BaseModel]]] = {
    "E1": BuybackExtraction,
    "E2": InsiderTradeExtraction,
    "E3": ContractExtraction,
    "E4": FinancialReportExtraction,
}


def first_sentence(text: str) -> str:
    """The body's first sentence (after the title block), ≤ 160 characters: a verbatim quote."""
    blocks = text.split("\n\n")
    body = blocks[1] if len(blocks) > 1 else text
    line = body.split("\n")[0]
    m = re.search(r"[.!?](\s|$)", line)
    sentence = line[: m.start() + 1] if m and m.start() > 0 else line
    if len(sentence) > 160:
        sentence = sentence[: sentence.rfind(" ", 0, 160)]
    return sentence


async def classifier(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Subject-mapped events skip the model; "Özel Durum Açıklaması (Genel)" & co. are read by it."""
    ctx = runtime.context
    target = state["route"]["route"]
    if target != "llm":
        stored = ctx.disclosure.stored_classification or {}
        out = {
            "status": "ok",
            "event_type": target,
            "sub_type": state["route"]["sub_type_hint"],
            "direction": "positive",
            "is_correction_or_update": False,
            "refers_to_prior_disclosure_date": None,
            "injection_suspected": False,
            "confidence": float(stored.get("confidence", 1.0)),
            "rationale_tr": f"KAP konu alanı (“{ctx.disclosure.subject}”) olayı doğrudan tipliyor; "
            "metin bunu doğruluyor.",
            "quotes": [{"field": "event_type", "quote": first_sentence(ctx.disclosure.text_tr)}],
            "abstain": None,
        }
        row = step(ctx, "classifier", status="skipped", note="Konu alanı tipledi; LLM gerekmedi")
        return {"classifier": out, "event_type": target, "steps": [row], "llm_calls": 0}
    answer, called = await ask_or_fail(ctx, "classifier", ClassifierOutput, state=state)
    if answer is None:
        return {"classifier": None, "event_type": None, "status": "completed", "outcome": "HOLD", "steps": [called]}
    return {"classifier": answer, "event_type": answer["event_type"], "steps": [called], "llm_calls": 1}


def _called(out: dict[str, Any] | None) -> int:
    return 0 if out is None else 1


async def reader(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    out, row = await ask_or_fail(
        ctx, "reader", READER_SCHEMAS[str(state["event_type"])], group=FANOUT_GROUP, state=state
    )
    return {"reader": out, "steps": [row], "llm_calls": _called(out)}


async def materiality(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    ctx = runtime.context
    out, row = await ask_or_fail(ctx, "materiality", MaterialityOutput, group=FANOUT_GROUP, state=state)
    return {"materiality": out, "steps": [row], "llm_calls": _called(out)}


async def evidence(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Selects similar past events without seeing their returns; the statistics come later (merge)."""
    ctx = runtime.context
    out, row = await ask_or_fail(ctx, "evidence", EvidenceSelection, group=FANOUT_GROUP, state=state)
    return {"evidence_selection": out, "steps": [row], "llm_calls": _called(out)}


async def skeptic(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Only ever shrinks or vetoes; a failed skeptic simply did not run (05 §5.1 `ran=False`)."""
    ctx = runtime.context
    out, row = await ask_or_fail(ctx, "skeptic", SkepticOutput, state=state)
    merged = state.get("merged")
    flags = [f["code"] for f in (out or {}).get("flags", [])]
    return {
        "skeptic": out,
        # the skeptic's flag codes join the feature vector the rule engine reads
        "merged": None if merged is None else {**merged, "flags": flags},
        "steps": [row],
        "llm_calls": _called(out),
    }


async def compliance(state: KaptanState, runtime: Runtime[RunContext]) -> dict[str, Any]:
    """Veto/escalate only. A quarantined text comes here too, so the refusal is on record (RET)."""
    ctx = runtime.context
    out, row = await ask_or_fail(ctx, "compliance", ComplianceReport, state=state)
    quarantined = bool((state.get("guard") or {}).get("quarantined"))
    if out is not None and out["decision"] == "veto" and quarantined:
        row = {**row, "note_tr": "RET"}
    update: dict[str, Any] = {"compliance": out, "steps": [row], "llm_calls": _called(out)}
    if quarantined:
        update |= {"status": "completed", "outcome": "QUARANTINED"}
    elif out is None:  # no compliance answer: never trade on it
        update |= {"status": "completed", "outcome": "HOLD"}
    elif out["decision"] == "veto":
        update |= {"status": "completed", "outcome": "NO_TRADE"}
    return update
