"""Classification eval scaffold (08 §1): golden set, macro-F1, Cohen's κ and a model-matrix runner.

Golden set format (JSONL, UTF-8, one object per line):

    {"id": "kap-1683354", "disclosure_index": 1683354, "ticker": "MILKS", "subject": "Finansal Rapor",
     "summary": "...", "text_tr": "... (optional)", "label": "E4",
     "label_source": "human:<initials>" | "seed:subject_map", "seed": false}

`label` is one of E1, E2, E3, E4, IGNORE. `golden/seed_v0.jsonl` is a **20-item seed** taken from the
committed KAP fixtures and labelled by the subject map only (`seed: true`): it exercises the harness,
it is not ground truth. The 300-item set of 08 §1 is human labelling work (two annotators; κ between
them is reported with `cohen_kappa`).

`run_matrix` scores any number of predictors (an async `item → label` callable); `llm_predictor`
wraps an `LLMProvider` (the live chain, or a single model of it) on the Classifier contract.
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

from kaptan.domain.schemas.agents import ClassifierOutput
from kaptan.llm.provider import LLMProvider, LLMRequest, ProviderError
from kaptan.llm.replay import agent_inputs, prompt_version

LABELS: Final = ("E1", "E2", "E3", "E4", "IGNORE")
SEED_FILE: Final = Path(__file__).resolve().parent / "golden" / "seed_v0.jsonl"
ABSTAIN: Final = "ABSTAIN"


@dataclass(frozen=True, slots=True)
class GoldItem:
    item_id: str
    disclosure_index: int
    ticker: str
    subject: str
    summary: str
    text_tr: str
    label: str
    label_source: str
    seed: bool


def load_golden(path: Path = SEED_FILE) -> list[GoldItem]:
    items: list[GoldItem] = []
    with path.open(encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            if not line.strip():
                continue
            raw = json.loads(line)
            label = str(raw["label"])
            if label not in LABELS:
                raise ValueError(f"{path.name}:{n}: label {label!r} not in {LABELS}")
            items.append(
                GoldItem(
                    item_id=str(raw["id"]),
                    disclosure_index=int(raw["disclosure_index"]),
                    ticker=str(raw["ticker"]),
                    subject=str(raw["subject"]),
                    summary=str(raw.get("summary", "")),
                    text_tr=str(raw.get("text_tr") or raw.get("summary") or raw["subject"]),
                    label=label,
                    label_source=str(raw.get("label_source", "")),
                    seed=bool(raw.get("seed", False)),
                )
            )
    if len({i.item_id for i in items}) != len(items):
        raise ValueError(f"{path.name}: duplicate ids")
    return items


def macro_f1(gold: Sequence[str], pred: Sequence[str], labels: Sequence[str] = LABELS) -> float:
    """Unweighted mean F1 over `labels` (a label absent from both sides scores 0 and is skipped)."""
    if len(gold) != len(pred):
        raise ValueError("gold and pred differ in length")
    scores: list[float] = []
    for lab in labels:
        tp = sum(g == lab and p == lab for g, p in zip(gold, pred, strict=True))
        fp = sum(g != lab and p == lab for g, p in zip(gold, pred, strict=True))
        fn = sum(g == lab and p != lab for g, p in zip(gold, pred, strict=True))
        if tp + fp + fn == 0:
            continue
        scores.append(2 * tp / (2 * tp + fp + fn))
    return sum(scores) / len(scores) if scores else 0.0


def cohen_kappa(a: Sequence[str], b: Sequence[str]) -> float:
    if len(a) != len(b) or not a:
        raise ValueError("need two equally long, non-empty label lists")
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b, strict=True)) / n
    ca, cb = Counter(a), Counter(b)
    expected = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return 1.0 if expected == 1 else (observed - expected) / (1 - expected)


Predictor = Callable[[GoldItem], Awaitable[str]]


def llm_predictor(provider: LLMProvider) -> Predictor:
    """The Classifier contract on a provider; a failed/abstaining call counts as ABSTAIN (a miss)."""

    async def predict(item: GoldItem) -> str:
        request = LLMRequest(
            agent="classifier",
            prompt_version=prompt_version("classifier"),
            inputs=agent_inputs(item.ticker, item.text_tr),
            output_schema=ClassifierOutput,
            run_id=f"eval-{item.item_id}",
            document=item.text_tr,
            context={"ticker": item.ticker, "subject": item.subject},
        )
        try:
            result = await provider.complete(request)
        except ProviderError:
            return ABSTAIN
        label = str(result.output.get("event_type") or ABSTAIN)
        return label if label in LABELS else ABSTAIN

    return predict


async def run_matrix(items: Sequence[GoldItem], predictors: Mapping[str, Predictor]) -> dict[str, Any]:
    gold = [i.label for i in items]
    out: dict[str, Any] = {"n": len(items), "seed_only": all(i.seed for i in items), "models": {}}
    for name, predict in predictors.items():
        pred = [await predict(i) for i in items]
        out["models"][name] = {
            "macro_f1": round(macro_f1(gold, pred), 4),
            "kappa_vs_gold": round(cohen_kappa(gold, pred), 4),
            "accuracy": round(sum(g == p for g, p in zip(gold, pred, strict=True)) / len(items), 4),
            "abstain": sum(p == ABSTAIN for p in pred),
        }
    return out
