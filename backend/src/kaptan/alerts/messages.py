"""The only texts an alert can carry, and which stream event means which one.

`message_for` takes the kind and nothing else, so no field of an event can reach the text: a ticker, a company,
an amount, a price or a direction cannot leak through a server that is not ours.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final, Literal

AlertKind = Literal["suggestion", "part_down", "test", "watch", "price", "weekly"]

MESSAGES: Final[Mapping[AlertKind, str]] = {
    "suggestion": "KAPtan: yeni bir önerin var.",
    "part_down": "KAPtan: bir parça çalışmıyor.",
    "test": "KAPtan: deneme bildirimi.",
    "watch": "KAPtan: izlediğin bir şirketten yeni bildirim var.",
    "price": "KAPtan: bir fiyat uyarın tetiklendi.",
    "weekly": "KAPtan: haftalık özetin hazır.",
}


def message_for(kind: AlertKind) -> str:
    return MESSAGES[kind]


def kind_for_event(event: str, data: Mapping[str, Any]) -> AlertKind | None:
    """The alert a desk-stream event calls for (None: nothing to tell).

    A card that is already decided is not a new suggestion.
    """
    if event == "approval.requested":
        return "suggestion" if data.get("status") == "pending" else None
    return None
