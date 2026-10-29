"""The Azure OpenAI slot of the live chain (FR-21, 05 §1.4 Rev. 3): off unless configured, after Groq,
before Ollama; the deployment URL, `api-key` header and api-version, against a mocked transport (respx)."""

from __future__ import annotations

import httpx
import respx
from pydantic import SecretStr

from kaptan.domain.schemas.agents import MaterialityOutput
from kaptan.llm.factory import azure_spec, build_live_provider
from kaptan.llm.live import LiveProvider
from kaptan.llm.provider import LLMRequest
from kaptan.llm.replay import default_cassette
from kaptan.llm.store import MemoryStore
from kaptan.settings import Settings, production_problems
from tests.unit.llm_support import DEEPSEEK_URL, GEMINI_URL, GROQ_URL, MODELS, chat_body, fake_settings

ENDPOINT = "https://kaptan-test.openai.azure.com"
DEPLOYMENT = "kaptan-gpt4o-mini"
AZURE_URL = f"{ENDPOINT}/openai/deployments/{DEPLOYMENT}/chat/completions"
REC = next(r for r in default_cassette()._by_fp.values() if r.run_id == "run-demo-e3-ornek")


def _settings(on: bool = True, **keys: str | None) -> Settings:
    update: dict[str, object] = {"azure_openai_endpoint": None, "azure_openai_api_key": None,
                                 "azure_openai_deployment": None}  # fmt: skip
    if on:
        update = {"azure_openai_endpoint": ENDPOINT + "/", "azure_openai_api_key": SecretStr("test-azure-key"),
                  "azure_openai_deployment": DEPLOYMENT}  # fmt: skip
    return fake_settings(**keys).model_copy(update=update)


def _live(settings: Settings) -> LiveProvider:
    return build_live_provider(settings, store=MemoryStore(), http=httpx.AsyncClient())


async def _instant(_: float) -> None:
    return None


def test_off_unless_endpoint_key_and_deployment_are_all_set() -> None:
    assert "azure" not in _live(_settings(on=False)).available
    half = _settings().model_copy(update={"azure_openai_deployment": " "})
    assert "azure" not in _live(half).available and azure_spec(MODELS.providers["azure"], half) is None
    live = _live(_settings().model_copy(update={"ollama_base_url": "http://127.0.0.1:11434/v1"}))
    assert [p.name for p in live.chain_for("reader")] == ["gemini", "deepseek", "groq", "azure", "ollama"]
    spec = azure_spec(MODELS.providers["azure"], _settings())
    assert spec is not None and spec.base_url == ENDPOINT and spec.model == DEPLOYMENT


@respx.mock
async def test_falls_back_to_azure_with_the_deployment_url_and_api_key_header() -> None:
    down = httpx.Response(503, json={"error": {"message": "overloaded"}})
    for url in (GEMINI_URL, DEEPSEEK_URL, GROQ_URL):
        respx.post(url).mock(return_value=down)
    azure = respx.post(url__startswith=AZURE_URL).mock(
        return_value=httpx.Response(200, json=chat_body(REC.outputs["materiality"], model="gpt-4o-mini"))
    )
    live = _live(_settings())
    for provider in live._providers.values():
        provider._client._sleep = _instant  # type: ignore[attr-defined]
    request = LLMRequest("materiality", "materiality@1.1.0", {"x": 1}, output_schema=MaterialityOutput, document="t")
    result = await live.complete(request)
    assert result.provider == "azure" and azure.call_count == 1
    sent = azure.calls.last.request
    assert sent.url.params["api-version"] == "2024-10-21"
    assert sent.headers["api-key"] == "test-azure-key" and "authorization" not in sent.headers
    assert b'"response_format":{"type":"json_object"}' in sent.content.replace(b" ", b"")


def test_azure_alone_is_enough_for_live_mode_in_prod_checks() -> None:
    live = _live(_settings(gemini=None, deepseek=None, groq=None))
    assert live.available == ("azure",)
    base = _settings(gemini=None, deepseek=None, groq=None).model_copy(update={"llm_mode": "live"})
    assert not any("LLM_MODE=live" in p for p in production_problems(base))
    off = _settings(on=False, gemini=None, deepseek=None, groq=None).model_copy(
        update={"llm_mode": "live", "ollama_base_url": None}
    )
    assert any("LLM_MODE=live" in p for p in production_problems(off))
