"""The only texts an alert can carry, and which stream event means which one.

`message_for` takes the kind and nothing else, so no field of an event can reach the text: a ticker, a company,
an amount, a price or a direction cannot leak through a server that is not ours.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final, Literal

AlertKind = Literal["suggestion", "day_halt", "stopped", "part_down", "test"]

MESSAGES: Final[Mapping[AlertKind, str]] = {
    "suggestion": "KAPtan: yeni bir önerin var.",
    "day_halt": "KAPtan: günlük zarar sınırına gelindi, yeni öneri durdu.",
    "stopped": "KAPtan durduruldu.",
    "part_down": "KAPtan: bir parça çalışmıyor.",
    "test": "KAPtan: deneme bildirimi.",
}


def message_for(kind: AlertKind) -> str:
    return MESSAGES[kind]


def kind_for_event(event: str, data: Mapping[str, Any]) -> AlertKind | None:
    """The alert a desk-stream event calls for (None: nothing to tell).

    `halt` and `kill_switch` carry the whole RiskStatus and are also published when the state is lifted, so the
    state itself decides; a card that is already decided is not a new suggestion.
    """
    if event == "approval.requested":
        return "suggestion" if data.get("status") == "pending" else None
    if event == "halt":
        return "day_halt" if data.get("halted_today") is True else None
    if event == "kill_switch":
        return "stopped" if data.get("kill_switch") == "on" else None
    return None
