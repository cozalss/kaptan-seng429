"""RAGAS-style L2 eval (08 §2, optional): faithfulness / answer relevancy / context precision of RAG answers.

The judge is the live LLM chain itself (`kaptan.llm`): one structured call per sample, agent `judge`
(prompt `judge@eval-1.0.0`, chain DeepSeek → Gemini in `config/models.yaml`), so every call goes through
person-name masking, the Redis response cache (a re-run of the same set costs nothing) and the daily
budget caps (LLM_CAP_*). No `ragas` package: the three metrics are computed here from the judge's verdict,
following the RAGAS definitions:

- faithfulness = supported claims / claims of the answer (None when the answer makes no claim);
- answer_relevancy = the judge's 0..1 grade of how directly the answer addresses the question;
- context_precision = mean over relevant positions k of precision@k (RAGAS average precision).

Off unless `KAPTAN_RAGAS=1` and a judge key (DEEPSEEK_API_KEY or GEMINI_API_KEY) is set: otherwise the
result is `{"skipped": <reason>}` and the CLI exits 0, so CI and offline runs never need a judge.

    KAPTAN_RAGAS=1 uv run python -m kaptan.eval.ragas_eval --out reports/ragas.json   # 3 seed samples
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Final

from pydantic import BaseModel, ConfigDict, Field

from kaptan.llm.provider import LLMProvider, LLMRequest, ProviderError
from kaptan.settings import ConfigError, Settings, get_settings

log = logging.getLogger("kaptan.eval.ragas")

METRICS: Final = ("faithfulness", "answer_relevancy", "context_precision")
JUDGE_AGENT: Final = "judge"
JUDGE_PROMPT: Final = "judge@eval-1.0.0"
JUDGE_PROVIDERS: Final = ("deepseek", "gemini")
SEED_FILE: Final = Path(__file__).resolve().parent / "golden" / "ragas_v0.jsonl"
MAX_CONTEXTS: Final = 8
MAX_CONTEXT_CHARS: Final = 2_000
JUDGE_MAX_TOKENS: Final = 700


class ClaimCheck(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    claim: str = Field(max_length=400)
    supported: bool


class JudgeVerdict(BaseModel):
    """What the judge returns for one sample (schema-checked like every agent output)."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    claims: list[ClaimCheck] = Field(max_length=12)
    answer_relevancy: float = Field(ge=0, le=1)
    context_useful: list[bool] = Field(max_length=MAX_CONTEXTS)


@dataclass(frozen=True, slots=True)
class RagSample:
    sample_id: str
    question: str
    answer: str
    contexts: tuple[str, ...]
    ground_truth: str | None = None


@dataclass(frozen=True, slots=True)
class SampleScore:
    sample_id: str
    faithfulness: float | None
    answer_relevancy: float
    context_precision: float | None
    claims: int
    provider: str
    cached: bool


def load_samples(path: Path = SEED_FILE) -> list[RagSample]:
    out: list[RagSample] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        contexts = tuple(str(c)[:MAX_CONTEXT_CHARS] for c in row["contexts"][:MAX_CONTEXTS])
        truth = row.get("ground_truth")
        out.append(RagSample(str(row["id"]), str(row["question"]), str(row["answer"]), contexts, truth))
    return out


def faithfulness(verdict: JudgeVerdict) -> float | None:
    if not verdict.claims:
        return None
    return sum(c.supported for c in verdict.claims) / len(verdict.claims)


def context_precision(useful: Sequence[bool]) -> float | None:
    """RAGAS average precision over the ranked contexts; None when no context is useful."""
    hits, total = 0, 0.0
    for k, flag in enumerate(useful, start=1):
        if flag:
            hits += 1
            total += hits / k
    return None if hits == 0 else total / hits


def judge_document(sample: RagSample) -> str:
    parts = [f"SORU:\n{sample.question}", f"YANIT:\n{sample.answer}"]
    parts += [f"BAĞLAM {i}:\n{c}" for i, c in enumerate(sample.contexts, start=1)]
    return "\n\n".join(parts)


def judge_request(sample: RagSample) -> LLMRequest:
    document = judge_document(sample)
    digest = hashlib.sha256(document.encode("utf-8")).hexdigest()
    return LLMRequest(
        agent=JUDGE_AGENT,
        prompt_version=JUDGE_PROMPT,
        inputs={"sample_id": sample.sample_id, "sha256": digest},
        output_schema=JudgeVerdict,
        max_output_tokens=JUDGE_MAX_TOKENS,
        document=document,
        context={"task": "ragas_judge", "n_contexts": len(sample.contexts)},
    )


async def score_sample(judge: LLMProvider, sample: RagSample) -> SampleScore:
    result = await judge.complete(judge_request(sample))
    verdict = JudgeVerdict.model_validate(dict(result.output))
    useful = list(verdict.context_useful[: len(sample.contexts)])
    useful += [False] * (len(sample.contexts) - len(useful))  # a short list: missing = not useful
    return SampleScore(
        sample_id=sample.sample_id,
        faithfulness=faithfulness(verdict),
        answer_relevancy=verdict.answer_relevancy,
        context_precision=context_precision(useful),
        claims=len(verdict.claims),
        provider=result.provider,
        cached=bool(result.usage.cached or result.extra.get("cache") == "hit"),
    )


def _mean(values: Sequence[float | None]) -> float | None:
    kept = [v for v in values if v is not None]
    return round(sum(kept) / len(kept), 4) if kept else None


async def evaluate_rag(samples: Sequence[RagSample], judge: LLMProvider) -> dict[str, Any]:
    """Score every sample; a sample the chain cannot judge (quota, bad output) is listed, never fatal."""
    scores: list[SampleScore] = []
    failed: list[dict[str, str]] = []
    for sample in samples:
        try:
            scores.append(await score_sample(judge, sample))
        except (ProviderError, ValueError) as exc:
            failed.append({"id": sample.sample_id, "error": type(exc).__name__})
    metrics = {m: _mean([getattr(s, m) for s in scores]) for m in METRICS}
    return {"n": len(samples), "scored": len(scores), "failed": failed, "metrics": metrics,
            "samples": [asdict(s) for s in scores]}  # fmt: skip


def judge_keys(settings: Settings) -> list[str]:
    keys = {"deepseek": settings.deepseek_api_key, "gemini": settings.gemini_api_key}
    return [n for n in JUDGE_PROVIDERS if (k := keys[n]) is not None and k.get_secret_value().strip()]


def unavailable_reason(env: Mapping[str, str] | None = None, settings: Settings | None = None) -> str | None:
    e = os.environ if env is None else env
    if e.get("KAPTAN_RAGAS") != "1":
        return "KAPTAN_RAGAS is not 1"
    if settings is None or not judge_keys(settings):
        return "no judge key (DEEPSEEK_API_KEY / GEMINI_API_KEY)"
    return None


async def _live_judge_run(settings: Settings, samples: Sequence[RagSample]) -> dict[str, Any]:
    import httpx
    import redis.asyncio as aioredis

    from kaptan.llm.factory import HTTP_LIMITS, build_live_provider

    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        await redis.ping()
        shared: Any = redis
    except Exception as exc:  # no Redis: per-process counters and cache (caps still apply to this run)
        log.warning("ragas: Redis unreachable (%s), budget and cache are in memory", type(exc).__name__)
        shared = None
    async with httpx.AsyncClient(limits=HTTP_LIMITS) as http:
        try:
            judge = build_live_provider(settings, redis=shared, http=http)
            return await evaluate_rag(samples, judge)
        finally:
            await redis.aclose()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.eval.ragas_eval", description="RAGAS-style L2 eval")
    p.add_argument("--golden", type=Path, default=SEED_FILE)
    p.add_argument("--limit", type=int, default=10, help="at most this many samples (cost guard)")
    p.add_argument("--out", type=Path, default=None, help="write the JSON report here")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None, *, judge: LLMProvider | None = None) -> int:
    args = parse_args(argv)
    samples = load_samples(args.golden)[: max(0, args.limit)]
    if judge is not None:
        report = asyncio.run(evaluate_rag(samples, judge))
    else:
        try:
            settings: Settings | None = get_settings()
        except ConfigError:
            settings = None
        reason = unavailable_reason(None, settings)
        if reason is not None or settings is None:
            report = {"skipped": reason or "no configuration", "n": len(samples)}
        else:
            report = asyncio.run(_live_judge_run(settings, samples))
    text = json.dumps(report, ensure_ascii=False, indent=1)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
