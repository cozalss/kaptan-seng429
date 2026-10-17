"""Replay mode (`LLM_MODE=replay`): recorded LLM outputs, no network, no API keys.

The cassette is built from the panel mock's recorded runs (tests/fixtures/demo/runs.json): for every
run it stores what each LLM agent answered, the usage the trace shows, and the tool results the
agents saw (market snapshot, event-study store, sizing inputs). A request is answered only when its
key — agent + prompt version + inputs (ticker and the sha256 of the disclosure text the node
actually read from Postgres) — was recorded; anything else is a `ReplayMissError`, never a guess.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from kaptan.demo.fixtures import FIXTURE_DIR
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage, ProviderError, request_key, validate_output

#: Agents whose answers come from a model (Prompt Guard included).
LLM_AGENTS: Final = ("guard", "classifier", "reader", "materiality", "evidence", "skeptic", "compliance")
PROMPT_VERSION: Final = "1.1.0"


def prompt_version(agent: str) -> str:
    return f"{agent}@{PROMPT_VERSION}"


def fingerprint(ticker: str, text_tr: str) -> str:
    """What a node hashes into its request: the ticker and the exact (masked) disclosure text."""
    return hashlib.sha256(f"{ticker}\n{text_tr}".encode()).hexdigest()


def agent_inputs(ticker: str, text_tr: str) -> dict[str, str]:
    return {"ticker": ticker, "text_sha256": fingerprint(ticker, text_tr)}


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
