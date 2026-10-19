"""The local Ollama slot of the live chain (M3 B3, FR-21): off by default, last after Groq, respx only."""

from __future__ import annotations

import httpx
import respx

from kaptan.domain.schemas.agents import MaterialityOutput
from kaptan.llm.factory import build_live_provider, ollama_spec
from kaptan.llm.live import LiveProvider
from kaptan.llm.provider import LLMRequest
from kaptan.llm.replay import default_cassette
from kaptan.llm.store import MemoryStore
from tests.unit.llm_support import DEEPSEEK_URL, GEMINI_URL, GROQ_URL, MODELS, chat_body, fake_settings

OLLAMA = "http://127.0.0.1:11434/v1"
REC = next(r for r in default_cassette()._by_fp.values() if r.run_id == "run-demo-e3-ornek")


def _live(ollama: str | None, **keys: str | None) -> LiveProvider:
    settings = fake_settings(**keys).model_copy(update={"ollama_base_url": ollama})
    return build_live_provider(settings, store=MemoryStore(), http=httpx.AsyncClient())


async def _instant(_: float) -> None:
    return None


def test_off_by_default_and_last_in_every_chain() -> None:
    assert "ollama" not in _live(None).available
    live = _live(OLLAMA + "/")
    assert [p.name for p in live.chain_for("reader")] == ["gemini", "deepseek", "groq", "ollama"]
    assert [p.name for p in live.chain_for("classifier")] == ["groq", "gemini", "deepseek", "ollama"]
    assert live.describe()["default_chain"] == ["gemini", "deepseek", "groq"]
    assert ollama_spec(MODELS.providers["ollama"], OLLAMA + "/").base_url == OLLAMA


@respx.mock
async def test_falls_back_to_ollama_when_the_cloud_chain_fails() -> None:
    down = httpx.Response(503, json={"error": {"message": "overloaded"}})
    for url in (GEMINI_URL, DEEPSEEK_URL, GROQ_URL):
        respx.post(url).mock(return_value=down)
    local = respx.post(f"{OLLAMA}/chat/completions").mock(
        return_value=httpx.Response(
            200, json=chat_body(REC.outputs["materiality"], model=MODELS.providers["ollama"].model)
        )
    )
    live = _live(OLLAMA)
    for provider in live._providers.values():
        provider._client._sleep = _instant  # type: ignore[attr-defined]
    request = LLMRequest("materiality", "materiality@1.1.0", {"x": 1}, output_schema=MaterialityOutput, document="t")
    result = await live.complete(request)
    assert result.provider == "ollama" and local.call_count == 1
    sent = local.calls.last.request
    assert sent.headers["Authorization"] == "Bearer ollama"  # placeholder, Ollama needs no key
    assert b'"response_format":{"type":"json_object"}' in sent.content.replace(b" ", b"")


def test_only_ollama_is_enough_for_live_mode() -> None:
    live = _live(OLLAMA, gemini=None, deepseek=None, groq=None)
    assert live.available == ("ollama",)
