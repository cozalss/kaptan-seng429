"""kaptan.rag.embed: the fake embedder, the masking/caching/caps choke point and the Gemini client (respx)."""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from datetime import date

import httpx
import pytest
import respx
from pydantic import SecretStr

from kaptan.llm.budget import Budget, Caps
from kaptan.llm.store import MemoryStore
from kaptan.llm.transport import QuotaExhaustedError
from kaptan.rag import embed as emb
from kaptan.rag.config import default_rag_config
from kaptan.rag.embed import (
    BUDGET_PROVIDER,
    CachedEmbedder,
    EmbeddingError,
    FakeEmbeddingBackend,
    GeminiEmbeddingBackend,
    Task,
    Vector,
    build_embedder,
    normalise,
)
from kaptan.settings import Settings, get_settings

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents"
FAKE_KEY = "test-key-not-real"


class Recorder:
    """A backend that records what it was sent (to prove masking) and answers with the fake vectors."""

    model, version, dim, max_batch, remote = "rec", "1", 1024, 3, True

    def __init__(self, error: Exception | None = None) -> None:
        self.sent: list[list[str]] = []
        self.error = error
        self._fake = FakeEmbeddingBackend()

    async def embed(self, texts: Sequence[str], task: Task) -> list[Vector]:
        self.sent.append(list(texts))
        if self.error is not None:
            raise self.error
        return [self._fake.vector(t) for t in texts]


async def no_sleep(_: float) -> None:
    return None


def _norm(v: Sequence[float]) -> float:
    return math.sqrt(sum(x * x for x in v))


def _settings(**update: object) -> Settings:
    return get_settings().model_copy(update=update)


async def test_fake_vectors_are_deterministic_normalised_and_similar_for_similar_text() -> None:
    fake = FakeEmbeddingBackend()
    a, b, c = await fake.embed(["Pay geri alım işlemleri", "Payların geri alınması", "İhale sonucu"], "document")
    assert a == FakeEmbeddingBackend().vector("Pay geri alım işlemleri")
    assert len(a) == 1024 and abs(_norm(a) - 1) < 1e-9
    cos = lambda x, y: sum(p * q for p, q in zip(x, y, strict=True))  # noqa: E731
    assert cos(a, b) > cos(a, c)
    assert FakeEmbeddingBackend().vector("ve ile 2026") == [0.0] * 1024  # stopwords and numbers only
    assert normalise([0.0, 0.0]) == [0.0, 0.0]


async def test_names_are_masked_before_any_backend_sees_them() -> None:
    rec = Recorder()
    embedder = CachedEmbedder(rec, store=MemoryStore())
    await embedder.embed_documents(["Yönetim Kurulu Üyesi Mehmet ÖZTÜRK 1.000 pay aldı."])
    assert rec.sent == [["Yönetim Kurulu Üyesi KİŞİ_1 1.000 pay aldı."]]
    assert "ÖZTÜRK" not in json.dumps(rec.sent, ensure_ascii=False)


async def test_cache_batching_and_counts() -> None:
    rec = Recorder()
    store = MemoryStore()
    embedder = CachedEmbedder(rec, store=store, batch_size=10)  # capped by the backend's max_batch (3)
    texts = [f"metin {chr(97 + i)}" for i in range(7)]
    first = await embedder.embed_documents(texts)
    assert [len(b) for b in rec.sent] == [3, 3, 1] and embedder.remote_calls == 3
    again = await embedder.embed_documents(texts)
    assert all(a == pytest.approx(b, abs=1e-6) for a, b in zip(again, first, strict=True))
    assert embedder.remote_calls == 3 and embedder.cache_hits == 7
    await embedder.embed_queries(texts[:1])  # another task type: not the document's cache entry
    assert embedder.remote_calls == 4
    assert (embedder.model, embedder.version, embedder.dim) == ("rec", "1", 1024)


async def test_a_corrupt_cache_entry_is_a_miss() -> None:
    rec = Recorder()
    store = MemoryStore()
    embedder = CachedEmbedder(rec, store=store, mask=False)
    await store.set(embedder._cache_key("x", "document"), "not json", ttl_s=60)
    await embedder.embed_documents(["x"])
    await store.set(embedder._cache_key("y", "document"), "[1, 2]", ttl_s=60)
    await embedder.embed_documents(["y"])
    assert embedder.remote_calls == 2


async def test_daily_caps_stop_the_embedder() -> None:
    store = MemoryStore()
    budget = Budget(store, {BUDGET_PROVIDER: Caps(requests_per_day=1)}, today=lambda: date(2026, 10, 18))
    embedder = CachedEmbedder(Recorder(), store=store, budget=budget)
    await embedder.embed_documents(["bir"])
    with pytest.raises(EmbeddingError, match="cap"):
        await embedder.embed_documents(["iki"])
    usage = await budget.usage(BUDGET_PROVIDER)
    assert usage.requests == 1 and usage.tokens_in > 0


async def test_provider_errors_become_embedding_errors_and_quota_marks_the_day() -> None:
    store = MemoryStore()
    budget = Budget(store, {}, today=lambda: date(2026, 10, 18))
    quota = CachedEmbedder(Recorder(QuotaExhaustedError("q", provider=BUDGET_PROVIDER)), store=store, budget=budget)
    with pytest.raises(EmbeddingError, match="quota"):
        await quota.embed_documents(["a"])
    assert (await budget.usage(BUDGET_PROVIDER)).exhausted
    other = CachedEmbedder(Recorder(emb.ProviderError("boom", provider="x")))
    with pytest.raises(EmbeddingError, match="boom"):
        await other.embed_queries(["a"])
    passthrough = CachedEmbedder(Recorder(EmbeddingError("shape", provider="x")))
    with pytest.raises(EmbeddingError, match="shape"):
        await passthrough.embed_queries(["a"])


async def test_pacing_waits_between_calls() -> None:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    embedder = CachedEmbedder(Recorder(), batch_size=1, min_interval_s=5.0, sleep=record, mask=False)
    await embedder.embed_documents(["a", "b"])
    assert len(waits) == 1 and 0 < waits[0] <= 5.0


def _gemini(**kw: object) -> GeminiEmbeddingBackend:
    return GeminiEmbeddingBackend(default_rag_config().embedding, SecretStr(FAKE_KEY), httpx.AsyncClient(), **kw)  # type: ignore[arg-type]


@respx.mock
async def test_gemini_backend_sends_the_key_in_the_header_and_normalises() -> None:
    route = respx.post(GEMINI_URL).mock(
        return_value=httpx.Response(
            200, json={"embeddings": [{"values": [3.0] + [0.0] * 1023}, {"values": [1.0] * 1024}]}
        )
    )
    vectors = await _gemini(sleep=no_sleep).embed(["a", "b"], "query")
    request = route.calls.last.request
    assert request.headers["x-goog-api-key"] == FAKE_KEY and FAKE_KEY not in str(request.url)
    body = json.loads(request.content)
    assert body["requests"][0] == {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": "a"}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": 1024,
    }
    assert vectors[0][0] == pytest.approx(1.0) and abs(_norm(vectors[1]) - 1) < 1e-9


@respx.mock
@pytest.mark.parametrize(
    "reply",
    [{"embeddings": [{"values": [1.0] * 10}]}, {"nothing": True}, {"embeddings": [{"values": [1.0] * 1024}] * 2}],
)
async def test_gemini_backend_rejects_bad_shapes(reply: dict[str, object]) -> None:
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json=reply))
    with pytest.raises(EmbeddingError):
        await _gemini(sleep=no_sleep).embed(["a"], "document")


@respx.mock
async def test_gemini_daily_quota_reply_is_marked_exhausted() -> None:
    respx.post(GEMINI_URL).mock(
        return_value=httpx.Response(429, json={"error": {"message": "Quota exceeded: requests per day"}})
    )
    store = MemoryStore()
    budget = Budget(store, {}, today=lambda: date(2026, 10, 18))
    embedder = CachedEmbedder(_gemini(sleep=no_sleep), store=store, budget=budget)
    with pytest.raises(EmbeddingError):
        await embedder.embed_documents(["a"])
    assert (await budget.usage(BUDGET_PROVIDER)).exhausted


def test_build_embedder_kinds() -> None:
    fake = build_embedder(_settings(rag_embedder="fake"))
    assert fake.model == "fake-hash-f5" and isinstance(fake.backend, FakeEmbeddingBackend)
    with pytest.raises(EmbeddingError, match="GEMINI_API_KEY"):
        build_embedder(_settings(gemini_api_key=None), kind="gemini")
    live = build_embedder(_settings(gemini_api_key=SecretStr(FAKE_KEY), rag_embed_batch=7), kind="gemini")
    assert live.model == "gemini-embedding-001" and live._batch == 7


def test_get_embedder_is_shared_per_kind(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(emb, "_SHARED", {})
    s = _settings(rag_embedder="fake")
    assert emb.get_embedder(s) is emb.get_embedder(s)
    live = emb.get_embedder(_settings(rag_embedder="gemini", gemini_api_key=SecretStr(FAKE_KEY)))
    assert live.model == "gemini-embedding-001"
