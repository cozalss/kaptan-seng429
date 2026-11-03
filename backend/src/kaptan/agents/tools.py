"""Read-only tools the agents and the deterministic nodes consult (05 §3), behind one protocol.

`kaptan.evidence.LiveToolbox` answers `features` / `evidence_store` with point-in-time SQL (price
context, market-model event study) and delegates the rest to a base toolbox, `NoTools` in a running
system; pick one per run with `kaptan.evidence.toolbox_for(conn, disclosure, settings.llm_mode)`.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol


class Toolbox(Protocol):
    def features(self, fp: str) -> Mapping[str, Any] | None:
        """Point-in-time feature snapshot (market data, history aggregates) for the merge node."""

    def evidence_store(self, fp: str) -> Mapping[str, Any] | None:
        """Event-study results for the evidence selection: stats, strength, retrieved ids, events."""

    def sizing(self, fp: str) -> Mapping[str, Any] | None:
        """Sizer inputs: reference price, ATR stop %, edge/cost bps, budget, holding days, entry."""

    def sub_type_label(self, fp: str) -> str | None:
        """Turkish label of the event's sub-type for the approval card."""

    def source_phrases(self, fp: str) -> list[Mapping[str, str]]:
        """Verbatim phrases to highlight in the TR text (field → quote)."""

    def node_latency_ms(self, fp: str, node: str) -> int | None:
        """Recorded latency of a deterministic node (None → measure it)."""

    def run_usage(self, fp: str) -> Mapping[str, int] | None:
        """Billed tokens and wall latency of the whole run (None → sum the nodes)."""


class NoTools:
    """Knows nothing: an unknown answer makes the graph HOLD, it is never made up."""

    def features(self, fp: str) -> Mapping[str, Any] | None:
        return None

    def evidence_store(self, fp: str) -> Mapping[str, Any] | None:
        return None

    def sizing(self, fp: str) -> Mapping[str, Any] | None:
        return None

    def sub_type_label(self, fp: str) -> str | None:
        return None

    def source_phrases(self, fp: str) -> list[Mapping[str, str]]:
        return []

    def node_latency_ms(self, fp: str, node: str) -> int | None:
        return None

    def run_usage(self, fp: str) -> Mapping[str, int] | None:
        return None
