"""One real judge call (opt-in: `uv run pytest -m live tests/integration/test_ragas_live.py`, ~1 cent or less)."""

from __future__ import annotations

import pytest

from kaptan.eval import ragas_eval as rg
from kaptan.settings import get_settings

pytestmark = pytest.mark.live


async def test_the_live_judge_scores_one_seed_sample() -> None:
    settings = get_settings()
    if not rg.judge_keys(settings):
        pytest.skip("no DEEPSEEK_API_KEY / GEMINI_API_KEY")
    report = await rg._live_judge_run(settings, rg.load_samples()[:1])
    assert report["scored"] == 1, report["failed"]
    sample = report["samples"][0]
    assert 0.0 <= sample["answer_relevancy"] <= 1.0 and sample["claims"] >= 1
    assert sample["faithfulness"] is not None and sample["faithfulness"] >= 0.5
