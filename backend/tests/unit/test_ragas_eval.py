"""RAGAS-style L2 eval (08 §2): metric maths, a fake judge, the live chain behind respx, the CLI gate."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from kaptan.eval import ragas_eval as rg
from kaptan.llm.factory import build_live_provider
from kaptan.llm.provider import LLMRequest, LLMResult, LLMUsage, ProviderError
from kaptan.llm.store import MemoryStore
from tests.unit.llm_support import DEEPSEEK_URL, GEMINI_URL, MODELS, chat_body, fake_settings

VERDICT: Mapping[str, Any] = {
    "claims": [{"claim": "1. olundu", "supported": True}, {"claim": "sözleşme imzalandı", "supported": False}],
    "answer_relevancy": 0.8,
    "context_useful": [True, False],
}


class FakeJudge:
    """Answers every judge request with a fixed verdict (or fails for listed sample ids)."""

    name = "fake-judge"

    def __init__(self, verdict: Mapping[str, Any] = VERDICT, fail: frozenset[str] = frozenset()) -> None:
        self.verdict, self.fail, self.requests = verdict, fail, list[LLMRequest]()

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        if request.inputs["sample_id"] in self.fail:
            raise ProviderError("quota", provider=self.name)
        return LLMResult(output=dict(self.verdict), usage=LLMUsage(model_id="fake"), provider=self.name)


def test_metric_definitions() -> None:
    assert rg.context_precision([True, False, True]) == pytest.approx((1 + 2 / 3) / 2)
    assert rg.context_precision([False, True]) == pytest.approx(0.5)
    assert rg.context_precision([False, False]) is None
    assert rg.faithfulness(rg.JudgeVerdict.model_validate(VERDICT)) == 0.5
    empty = rg.JudgeVerdict(claims=[], answer_relevancy=0.0, context_useful=[])
    assert rg.faithfulness(empty) is None


def test_seed_set_loads_and_requests_are_cache_stable() -> None:
    samples = rg.load_samples()
    assert len(samples) == 3 and all(s.contexts for s in samples)
    first, again = rg.judge_request(samples[0]), rg.judge_request(samples[0])
    assert first.inputs == again.inputs and first.agent == "judge" and first.output_schema is rg.JudgeVerdict
    assert "SORU:" in (first.document or "") and "BAĞLAM 2:" in (first.document or "")
    assert first.context == {"task": "ragas_judge", "n_contexts": 2}


async def test_evaluate_with_a_fake_judge_lists_failures() -> None:
    samples = rg.load_samples()
    judge = FakeJudge(fail=frozenset({samples[2].sample_id}))
    report = await rg.evaluate_rag(samples, judge)
    assert report["n"] == 3 and report["scored"] == 2
    assert report["failed"] == [{"id": samples[2].sample_id, "error": "ProviderError"}]
    assert report["metrics"] == {"faithfulness": 0.5, "answer_relevancy": 0.8, "context_precision": 1.0}


async def test_short_context_list_counts_missing_as_not_useful() -> None:
    sample = rg.RagSample("s", "q", "a", ("c1", "c2", "c3"))
    score = await rg.score_sample(FakeJudge({**VERDICT, "context_useful": [False, True]}), sample)
    assert score.context_precision == pytest.approx(0.5) and score.claims == 2


@respx.mock
async def test_live_chain_judges_with_deepseek_first_and_caches() -> None:
    route = respx.post(DEEPSEEK_URL).mock(
        return_value=httpx.Response(200, json=chat_body(VERDICT, model=MODELS.providers["deepseek"].model))
    )
    gemini = respx.post(GEMINI_URL)
    async with httpx.AsyncClient() as http:
        live = build_live_provider(fake_settings(), store=MemoryStore(), http=http)
        assert [p.name for p in live.chain_for("judge")][:2] == ["deepseek", "gemini"]
        samples = rg.load_samples()[:1]
        first = await rg.evaluate_rag(samples, live)
        second = await rg.evaluate_rag(samples, live)
    assert first["samples"][0]["provider"] == "deepseek" and not first["samples"][0]["cached"]
    assert second["samples"][0]["cached"] and route.call_count == 1 and gemini.call_count == 0
    sent = json.loads(route.calls.last.request.content)
    assert "RAG HAKEMİ" in sent["messages"][0]["content"] and sent["max_tokens"] <= rg.JUDGE_MAX_TOKENS


def test_gate_needs_the_flag_and_a_judge_key() -> None:
    with_keys = fake_settings()
    no_keys = fake_settings(gemini=None, deepseek=None)
    assert rg.unavailable_reason({}, with_keys) == "KAPTAN_RAGAS is not 1"
    assert rg.unavailable_reason({"KAPTAN_RAGAS": "1"}, no_keys) == "no judge key (DEEPSEEK_API_KEY / GEMINI_API_KEY)"
    assert rg.unavailable_reason({"KAPTAN_RAGAS": "1"}, None) is not None
    assert rg.unavailable_reason({"KAPTAN_RAGAS": "1"}, with_keys) is None
    assert rg.judge_keys(fake_settings(deepseek=" ")) == ["gemini"]


def test_cli_skips_without_the_flag_and_writes_the_report(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KAPTAN_RAGAS", raising=False)
    out = tmp_path / "r" / "ragas.json"
    assert rg.main(["--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8")) == {"skipped": "KAPTAN_RAGAS is not 1", "n": 3}


def test_cli_with_an_injected_judge(tmp_path: Path) -> None:
    out = tmp_path / "ragas.json"
    assert rg.main(["--limit", "1", "--out", str(out)], judge=FakeJudge()) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["scored"] == 1


def test_cli_live_path_runs_through_the_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(settings: Any, samples: Any) -> dict[str, Any]:
        return {"scored": len(samples)}

    monkeypatch.setenv("KAPTAN_RAGAS", "1")
    monkeypatch.setattr(rg, "get_settings", fake_settings)
    monkeypatch.setattr(rg, "_live_judge_run", fake_run)
    assert rg.main(["--limit", "2"]) == 0
