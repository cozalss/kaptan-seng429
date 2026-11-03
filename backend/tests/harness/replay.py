"""The tests' LLM: recorded outputs, no network, no API keys. Never part of a running system.

The cassette is built from the panel mock's recorded runs (tests/fixtures/demo/runs.json): for every
run it stores what each LLM agent answered, the usage the trace shows, and the tool results the
agents saw (market snapshot, event-study store, sizing inputs). A request is answered only when its
key — agent + prompt version + inputs (ticker and the sha256 of the disclosure text the node
actually read from Postgres) — was recorded; anything else is a `ReplayMissError`, never a guess.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from kaptan.llm.provider import (
    LLMRequest,
    LLMResult,
    LLMUsage,
    ProviderError,
    agent_inputs,
    fingerprint,
    prompt_version,
    request_key,
    validate_output,
)
from tests.harness.fixtures import FIXTURE_DIR

#: Agents whose answers come from a model (Prompt Guard included).
LLM_AGENTS: Final = ("guard", "classifier", "reader", "materiality", "evidence", "skeptic", "compliance")


class ReplayMissError(ProviderError):
    def __init__(self, agent: str, key: str) -> None:
        super().__init__(f"replay: no recording for {agent} ({key[:12]}…)", provider="replay", retryable=False)
        self.agent = agent
        self.key = key


@dataclass(frozen=True, slots=True)
class Recording:
    """One recorded run: answers per agent, usage per node, and the tools' results."""

    run_id: str
    ticker: str
    fingerprint: str
    outputs: Mapping[str, Mapping[str, Any]]
    node_usage: Mapping[str, LLMUsage]
    tools: Mapping[str, Any] = field(default_factory=dict)


def _usage(node: Mapping[str, Any]) -> LLMUsage:
    return LLMUsage(
        model_id=node.get("model_id"),
        tokens_in=int(node.get("tokens_in") or 0),
        tokens_out=int(node.get("tokens_out") or 0),
        latency_ms=int(node.get("latency_ms") or 0),
        cached=bool(node.get("cached")),
    )


def _outputs(e: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    out: dict[str, Mapping[str, Any]] = {}
    if e.get("guard") is not None:
        out["guard"] = {"injection_score": e["guard"]["injection_score"]}
    for agent in ("classifier", "reader", "materiality", "skeptic", "compliance"):
        if e.get(agent) is not None:
            out[agent] = e[agent]
    if e.get("evidence_card") is not None:
        out["evidence"] = e["evidence_card"]["selection"]
    return out


def _source_phrases(e: Mapping[str, Any]) -> list[dict[str, str]]:
    text = next((t["body"] for t in e["texts"] if t["lang"] == "tr"), "")
    return [{"field": s["field"], "quote": text[s["start"] : s["end"]]} for s in e["source_spans"]]


def _tools(r: Mapping[str, Any]) -> dict[str, Any]:
    e, spec = r["explain"], r["spec"]
    card = e.get("evidence_card")
    tools: dict[str, Any] = {
        "source_phrases": _source_phrases(e),
        "run_usage": {
            "tokens_in": e["run"]["tokens_in"],
            "tokens_out": e["run"]["tokens_out"],
            "latency_ms": e["run"]["latency_ms"],
        },
        "features": e.get("merged"),
        "evidence_store": None
        if card is None
        else {
            "stats": card["stats"],
            "strength": card["strength"],
            "retrieved_ids": card["retrieved_ids"],
            "events": e["evidence_events"],
        },
        "sizing": None,
        "sub_type_tr": spec.get("sub_type_tr"),
    }
    p = spec.get("proposal")
    if p is not None:
        tools["sizing"] = {
            "ref_price": p["refPrice"],
            "stop_pct": p["stopPct"],
            "holding_days": p["holding"],
            "expected_edge_bps": p["edgeBps"],
            "est_cost_bps": p["costBps"],
            "requested_notional_try": p["requestedNotional"],
            "entry": p["entry"],
            "escalate": p.get("escalate") or [],
        }
    return tools


def recording_of(r: Mapping[str, Any]) -> Recording:
    e = r["explain"]
    ticker = e["run"]["ticker"]
    text = next(t["body"] for t in e["texts"] if t["lang"] == "tr")
    return Recording(
        run_id=e["run"]["run_id"],
        ticker=ticker,
        fingerprint=fingerprint(ticker, text),
        outputs=_outputs(e),
        node_usage={n["node"]: _usage(n) for n in e["trace"]["nodes"]},
        tools=_tools(r),
    )


class Cassette:
    """All recordings, indexed by request key (LLM answers) and by fingerprint (tools, timings)."""

    def __init__(self, recordings: list[Recording]) -> None:
        self._by_fp = {rec.fingerprint: rec for rec in recordings}
        self._answers: dict[str, tuple[Recording, str]] = {}
        for rec in recordings:
            text_sha = {"ticker": rec.ticker, "text_sha256": rec.fingerprint}
            for agent in rec.outputs:
                key = request_key(LLMRequest(agent=agent, prompt_version=prompt_version(agent), inputs=text_sha))
                self._answers[key] = (rec, agent)

    @classmethod
    def from_runs_file(cls, path: Path = FIXTURE_DIR / "runs.json") -> Cassette:
        with path.open(encoding="utf-8") as fh:
            runs: list[dict[str, Any]] = json.load(fh)
        return cls([recording_of(r) for r in runs])

    def __len__(self) -> int:
        return len(self._by_fp)

    def recording(self, fp: str) -> Recording | None:
        return self._by_fp.get(fp)

    def answer(self, request: LLMRequest) -> tuple[Mapping[str, Any], LLMUsage]:
        key = request_key(request)
        hit = self._answers.get(key)
        if hit is None:
            raise ReplayMissError(request.agent, key)
        rec, agent = hit
        usage = rec.node_usage.get(agent, LLMUsage(model_id=None))
        return rec.outputs[agent], usage


@lru_cache(maxsize=1)
def default_cassette() -> Cassette:
    return Cassette.from_runs_file()


class ReplayProvider:
    """`LLMProvider` that answers from the cassette (deterministic; the usage is the recorded one)."""

    name = "replay"

    def __init__(self, cassette: Cassette | None = None) -> None:
        self.cassette = cassette or default_cassette()

    async def complete(self, request: LLMRequest) -> LLMResult:
        output, usage = self.cassette.answer(request)
        validate_output(request, output, provider=self.name)
        return LLMResult(output=dict(output), usage=usage, provider=self.name)


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


__all__ = [
    "LLM_AGENTS",
    "Cassette",
    "Recording",
    "ReplayMissError",
    "ReplayProvider",
    "ReplayToolbox",
    "agent_inputs",
    "default_cassette",
    "fingerprint",
    "prompt_version",
]
