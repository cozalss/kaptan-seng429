"""Read-only tools the agents and the deterministic nodes consult (05 §3), behind one protocol.

M2 implements them with point-in-time SQL (`get_market_snapshot`, `event_returns`, the sizer's
budget) and measures node latency; in replay mode `ReplayToolbox` returns what the recorded run saw,
so the graph is deterministic end to end (same input → same Explain, timings included).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from kaptan.llm.replay import Cassette, Recording, default_cassette


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


class ReplayToolbox:
    """Answers from the cassette; an unknown disclosure gets empty answers (and the graph HOLDs)."""

    def __init__(self, cassette: Cassette | None = None) -> None:
        self.cassette = cassette or default_cassette()

    def _rec(self, fp: str) -> Recording | None:
        return self.cassette.recording(fp)

    def _tool(self, fp: str, name: str) -> Any:
        rec = self._rec(fp)
        return None if rec is None else rec.tools.get(name)

    def features(self, fp: str) -> Mapping[str, Any] | None:
        value: Mapping[str, Any] | None = self._tool(fp, "features")
        return value

    def evidence_store(self, fp: str) -> Mapping[str, Any] | None:
        value: Mapping[str, Any] | None = self._tool(fp, "evidence_store")
        return value

    def sizing(self, fp: str) -> Mapping[str, Any] | None:
        value: Mapping[str, Any] | None = self._tool(fp, "sizing")
        return value

    def sub_type_label(self, fp: str) -> str | None:
        value: str | None = self._tool(fp, "sub_type_tr")
        return value

    def source_phrases(self, fp: str) -> list[Mapping[str, str]]:
        value: list[Mapping[str, str]] | None = self._tool(fp, "source_phrases")
        return value or []

    def node_latency_ms(self, fp: str, node: str) -> int | None:
        rec = self._rec(fp)
        usage = None if rec is None else rec.node_usage.get(node)
        return None if usage is None else usage.latency_ms

    def run_usage(self, fp: str) -> Mapping[str, int] | None:
        value: Mapping[str, int] | None = self._tool(fp, "run_usage")
        return value
