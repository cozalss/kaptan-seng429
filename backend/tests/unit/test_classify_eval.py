"""Classification eval scaffold (08 §1): loader, macro-F1, κ and the model matrix on fake predictions."""

from __future__ import annotations

from pathlib import Path

import pytest

from kaptan.eval.classify import (
    ABSTAIN,
    GoldItem,
    cohen_kappa,
    llm_predictor,
    load_golden,
    macro_f1,
    run_matrix,
)
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage, ProviderError


def test_seed_set_is_twenty_items_and_marked_as_seed() -> None:
    items = load_golden()
    assert len(items) == 20
    assert all(i.seed and i.label_source.startswith("seed:") for i in items)
    assert {i.label for i in items} >= {"E1", "E2", "E3", "IGNORE"}


def test_loader_rejects_bad_labels_and_duplicates(tmp_path: Path) -> None:
    bad = tmp_path / "bad.jsonl"
    bad.write_text('{"id": "a", "disclosure_index": 1, "ticker": "X", "subject": "s", "label": "BUY"}\n', "utf-8")
    with pytest.raises(ValueError, match="label"):
        load_golden(bad)
    dup = tmp_path / "dup.jsonl"
    row = '{"id": "a", "disclosure_index": 1, "ticker": "X", "subject": "s", "label": "E1"}\n'
    dup.write_text(row + "\n" + row, "utf-8")
    with pytest.raises(ValueError, match="duplicate"):
        load_golden(dup)


def test_macro_f1_known_values() -> None:
    assert macro_f1(["E1", "E2"], ["E1", "E2"]) == 1.0
    # E1: tp1 fp1 fn0 → 2/3; E2: tp0 fp0 fn1 → 0 → mean 1/3
    assert macro_f1(["E1", "E2"], ["E1", "E1"]) == pytest.approx(1 / 3)
    with pytest.raises(ValueError):
        macro_f1(["E1"], [])


def test_cohen_kappa_known_values() -> None:
    assert cohen_kappa(["E1", "E2", "E1", "E2"], ["E1", "E2", "E1", "E2"]) == 1.0
    # observed 0.5, expected 0.5 → κ 0
    assert cohen_kappa(["E1", "E1", "E2", "E2"], ["E1", "E2", "E1", "E2"]) == pytest.approx(0.0)
    assert cohen_kappa(["E1", "E1"], ["E1", "E1"]) == 1.0
    with pytest.raises(ValueError):
        cohen_kappa([], [])


async def test_matrix_with_fake_predictors() -> None:
    items = load_golden()

    async def oracle(i: GoldItem) -> str:
        return i.label

    async def always_ignore(i: GoldItem) -> str:
        return "IGNORE"

    out = await run_matrix(items, {"oracle": oracle, "ignore": always_ignore})
    assert out["n"] == 20 and out["seed_only"] is True
    assert out["models"]["oracle"] == {"macro_f1": 1.0, "kappa_vs_gold": 1.0, "accuracy": 1.0, "abstain": 0}
    assert out["models"]["ignore"]["macro_f1"] < 0.5


class _Fake:
    name = "fake"

    def __init__(self, answer: str | None) -> None:
        self.answer = answer
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        if self.answer is None:
            raise ProviderError("down", provider="fake")
        return LLMResult(output={"event_type": self.answer}, usage=LLMUsage(model_id="m"))


async def test_llm_predictor_maps_answers_and_failures() -> None:
    item = load_golden()[0]
    ok = _Fake("E3")
    assert await llm_predictor(ok)(item) == "E3"
    assert ok.requests[0].agent == "classifier"
    assert await llm_predictor(_Fake("BUY"))(item) == ABSTAIN
    assert await llm_predictor(_Fake(None))(item) == ABSTAIN


def test_ragas_is_skipped_without_the_flag() -> None:
    from kaptan.eval.ragas_eval import unavailable_reason

    assert unavailable_reason({}) == "KAPTAN_RAGAS is not 1"
    assert unavailable_reason({"KAPTAN_RAGAS": "1"}) == "no judge key (DEEPSEEK_API_KEY / GEMINI_API_KEY)"
