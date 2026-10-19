"""RAGAS (08 §2, optional): faithfulness / answer relevancy / context precision on RAG answers.

Off unless `KAPTAN_RAGAS=1` **and** a judge key (`RAGAS_JUDGE_API_KEY`) are set and the optional `ragas`
package is installed (`uv add --optional eval ragas`; not a runtime dependency). Otherwise every call
returns `{"skipped": <reason>}`: CI and offline runs never need a judge. The deterministic retrieval
metrics (recall@k, MRR) live in `kaptan.rag.eval` and always run.
"""

from __future__ import annotations

import importlib.util
import os
from collections.abc import Mapping, Sequence
from typing import Any

METRICS = ("faithfulness", "answer_relevancy", "context_precision")


def unavailable_reason(env: Mapping[str, str] | None = None) -> str | None:
    e = os.environ if env is None else env
    if e.get("KAPTAN_RAGAS") != "1":
        return "KAPTAN_RAGAS is not 1"
    if not e.get("RAGAS_JUDGE_API_KEY"):
        return "no judge key (RAGAS_JUDGE_API_KEY)"
    if importlib.util.find_spec("ragas") is None:
        return "the optional ragas package is not installed"
    return None


def evaluate_rag(samples: Sequence[Mapping[str, Any]], env: Mapping[str, str] | None = None) -> dict[str, Any]:
    """`samples`: {"question", "answer", "contexts": [...], "ground_truth"}. Skips cleanly when disabled."""
    reason = unavailable_reason(env)
    if reason is not None:
        return {"skipped": reason, "n": len(samples)}
    raise NotImplementedError("wire the ragas judge here once a judge key is provisioned")  # pragma: no cover
