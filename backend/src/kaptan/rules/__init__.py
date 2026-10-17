"""Deterministic rule engine E1–E4 (06 §3–§8): pure functions, no I/O, no clock.

from kaptan.rules import RuleInput, decide
result = decide(RuleInput(event_type="E3", ...))     # → RuleResult(outcome, reason_codes, trace, ...)
"""

from kaptan.rules.engine import RuleResult, decide
from kaptan.rules.events import Check, RuleInput
from kaptan.rules.params import DEFAULT_PARAMS, RuleParams
from kaptan.rules.sizing import Sizing, SizingInput, size

__all__ = [
    "DEFAULT_PARAMS",
    "Check",
    "RuleInput",
    "RuleParams",
    "RuleResult",
    "Sizing",
    "SizingInput",
    "decide",
    "size",
]
