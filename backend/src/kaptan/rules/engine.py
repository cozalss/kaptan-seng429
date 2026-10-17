"""The rule engine (05 §5.1, 06 §3–§8): a pure function from features to PROPOSE / NO_TRADE / HOLD.

Consumption order (05 §5.1, first match wins for HOLD): agent failed → abstain → low confidence →
unsupported skeptic veto. Then the event's trigger rules (stop at the first failure), the leakage
filter (E1/E2 halve, E3/E4 skip), edge ≥ 2 × cost and n ≥ 5 similar events. No I/O, no clock.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Literal

from kaptan.rules.events import EVENT_RULES, Check, RuleInput
from kaptan.rules.format import fmt_dec, fmt_pct, fmt_ratio_x, fmt_signed_pct
from kaptan.rules.params import DEFAULT_PARAMS, RuleParams

Outcome = Literal["PROPOSE", "NO_TRADE", "HOLD"]
_EVENT_PREFIX: Final = re.compile(r"^E[1-4]_")

REASON_ORDER: Final = (
    "HOLD_AGENT_FAILED",
    "HOLD_AGENT_ABSTAIN",
    "HOLD_LOW_CONFIDENCE",
    "HOLD_UNSUPPORTED_VETO",
    "SKEPTIC_VETO",
    "AVOID_LIST",
    "NO_EVIDENCE",
    "INJECTION_REVIEW",
    "E_RULE_NOT_MET",
    "EDGE_BELOW_COST",
    "LEAKAGE_HALF",
    "LEAKAGE_SKIP",
    "E_RULE_MET",
)


@dataclass(frozen=True, slots=True)
class RuleResult:
    outcome: Outcome
    reason_codes: tuple[str, ...]
    trace: tuple[Check, ...]
    rules_hash: str
    leakage_multiplier: Decimal = Decimal(1)
    escalate: bool = False

    @property
    def rules_fired(self) -> tuple[str, ...]:
        return tuple(c.rule for c in self.trace if c.passed)

    def as_document(self) -> dict[str, object]:
        """The panel's RuleDecision shape."""
        return {
            "outcome": self.outcome,
            "reason_codes": list(self.reason_codes),
            "rules_fired": list(self.rules_fired),
            "rules_hash": self.rules_hash,
            "trace": [trace_row(c) for c in self.trace],
        }


def trace_row(c: Check) -> dict[str, object]:
    return {
        "rule": c.rule,
        "passed": c.passed,
        "observed": c.observed,
        "threshold": c.threshold,
        "detail_tr": c.detail_tr,
    }


def _sort_codes(codes: list[str]) -> tuple[str, ...]:
    def key(code: str) -> int:
        generic = _EVENT_PREFIX.sub("E_", code)
        return REASON_ORDER.index(generic) if generic in REASON_ORDER else len(REASON_ORDER)

    return tuple(dict.fromkeys(sorted(codes, key=key)))


def _hold_check(x: RuleInput, p: RuleParams) -> tuple[str, Check] | None:
    statuses = dict(x.agent_status)
    if any(s == "failed" for s in statuses.values()):
        bad = ", ".join(k for k, s in statuses.items() if s == "failed")
        return "HOLD_AGENT_FAILED", Check(
            "HOLD.agent_failed", False, bad, "tüm ajanlar ok", "Bir ajan çalışmadı: HOLD."
        )
    if any(s == "abstain" for s in statuses.values()):
        bad = ", ".join(k for k, s in statuses.items() if s == "abstain")
        return "HOLD_AGENT_ABSTAIN", Check(
            "HOLD.agent_abstain", False, bad, "tüm ajanlar ok", "Bir ajan çekimser: HOLD."
        )
    floors = (
        (x.classifier_confidence, p.min_classifier_confidence, "Sınıflandırıcı"),
        (x.reader_confidence, p.min_reader_confidence, "Okuyucu"),
        (x.materiality_confidence, p.min_materiality_confidence, "Önemlilik"),
    )
    for value, floor, who in floors:
        if value is not None and value < floor:
            check = Check(
                "HOLD.low_confidence",
                False,
                fmt_dec(value, 2),
                f"≥ {fmt_dec(floor, 2)}",
                f"{who} güveni eşik altında: HOLD.",
            )
            return "HOLD_LOW_CONFIDENCE", check
    unsupported = not x.skeptic_veto_supported or (
        x.skeptic_confidence is not None and x.skeptic_confidence < p.min_skeptic_veto_confidence
    )
    if x.skeptic_ran and x.skeptic_veto and unsupported:
        check = Check(
            "HOLD.unsupported_veto", False, "veto", "destekli veto", "Şüphecinin vetosu desteklenmiyor: HOLD."
        )
        return "HOLD_UNSUPPORTED_VETO", check
    return None


def _common_checks(x: RuleInput, p: RuleParams) -> tuple[list[Check], list[str], Decimal]:
    """Leakage, edge/cost and evidence count (the rows every proposal shares)."""
    checks: list[Check] = []
    codes: list[str] = []
    m_leak = Decimal(1)
    leak = x.leakage_5d or 0.0
    leak_ok = leak <= p.leak_ret5d_max
    halves = x.event_type in ("E1", "E2")
    leak_detail = (
        "Son 5 seansta önceden fiyatlanma eşiği aşılmadı."
        if leak_ok
        else (
            "Son 5 seansta %8'i aşan yükseliş: boyut yarıya." if halves else "Son 5 seansta %8'i aşan yükseliş: atla."
        )
    )
    checks.append(
        Check("LEAK.ret5d", leak_ok, fmt_signed_pct(leak, 1), f"< {fmt_pct(p.leak_ret5d_max, 0)}", leak_detail)
    )
    if not leak_ok:
        if not halves:
            return checks, ["LEAKAGE_SKIP"], m_leak
        codes.append("LEAKAGE_HALF")
        m_leak = p.leakage_half_multiplier
    edge, cost = x.expected_edge_bps or 0.0, x.est_cost_bps or 0.0
    ratio = edge / cost if cost > 0 else 0.0
    edge_ok = cost > 0 and ratio >= p.min_edge_cost_ratio
    edge_detail = "Beklenen avantaj maliyetin en az iki katı." if edge_ok else "Avantaj maliyeti karşılamıyor."
    checks.append(
        Check("EDGE.edge_cost", edge_ok, fmt_ratio_x(ratio), f"≥ {fmt_ratio_x(p.min_edge_cost_ratio)}", edge_detail)
    )
    if not edge_ok:
        return checks, [*codes, "EDGE_BELOW_COST"], m_leak
    n = x.evidence_n or 0
    n_ok = n >= p.min_evidence_n and x.evidence_card_id is not None
    n_detail = "Yeterli sayıda benzer olay var." if n_ok else "Benzer olay sayısı yetersiz."
    checks.append(Check("EVIDENCE.n_min", n_ok, str(n), f"≥ {p.min_evidence_n}", n_detail))
    if not n_ok:
        codes.append("NO_EVIDENCE")
    return checks, codes, m_leak


def decide(x: RuleInput, params: RuleParams = DEFAULT_PARAMS) -> RuleResult:
    """PROPOSE only when every agent is healthy, the event's rules pass and the common checks pass."""
    hold = _hold_check(x, params)
    if hold is not None:
        code, check = hold
        return RuleResult("HOLD", (code,), (check,), params.rules_hash)

    rules = EVENT_RULES.get(x.event_type)
    if rules is None:
        check = Check("AVOID.not_event", False, x.event_type, "E1–E4", "E1–E4 olayı değil: işlem yok.")
        return RuleResult("NO_TRADE", ("E_RULE_NOT_MET",), (check,), params.rules_hash)

    codes: list[str] = []
    trace: list[Check] = []
    if x.skeptic_ran and x.skeptic_veto:
        codes.append("SKEPTIC_VETO")
    if x.avoid_listed:
        codes.append("AVOID_LIST")
        trace.append(Check("AVOID.list", False, x.ticker, "kaçınma listesi dışı", "Hisse kaçınma listesinde."))

    met = True
    for rule in rules:
        check = rule(x, params)
        trace.append(check)
        if not check.passed:
            met = False
            break
    m_leak = Decimal(1)
    if met:
        common, common_codes, m_leak = _common_checks(x, params)
        trace.extend(common)
        codes.extend(common_codes)
    else:
        codes.append(f"{x.event_type}_RULE_NOT_MET")

    if x.any_injection_flag:
        codes.append("INJECTION_REVIEW")
    blocking = {"SKEPTIC_VETO", "AVOID_LIST", "NO_EVIDENCE", "LEAKAGE_SKIP", "EDGE_BELOW_COST"}
    proposes = met and not blocking.intersection(codes)
    if proposes:
        codes.append(f"{x.event_type}_RULE_MET")
    return RuleResult(
        "PROPOSE" if proposes else "NO_TRADE",
        _sort_codes(codes),
        tuple(trace),
        params.rules_hash,
        leakage_multiplier=m_leak,
        escalate=x.any_injection_flag,
    )
