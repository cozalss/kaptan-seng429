"""Embeddings for the RAG archive: one `Embedder` protocol, a live Gemini backend and a deterministic fake.

- **Live:** Gemini `gemini-embedding-001` (`config/rag.yaml`), `batchEmbedContents` with
  `outputDimensionality = 1024` (Matryoshka truncation, then L2-normalised), key in the `x-goog-api-key`
  header (never the URL), retries/backoff via `kaptan.llm.transport.post_json`.
- **Fake:** feature hashing of Turkish 5-prefix stems (the F5 stemmer) into 1024 dimensions; no network,
  deterministic across processes (sha256, not `hash()`). Tests and the offline eval use it.
- `CachedEmbedder` is the one choke point every caller goes through: person names are masked first
  (KVKK: unmasked text never leaves the machine, the same `mask_persons` the LLM chain uses), then the
  Redis/memory cache (key = model, version, dim, task, sha256 of the masked text), then the daily caps
  (`RAG_EMBED_CAP_RPD` / `RAG_EMBED_CAP_TPD`, provider key `gemini_embed`), batching and pacing.
  Nothing here logs a text, only counts.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
from collections import Counter
from collections.abc import Sequence
from typing import Any, Final, Literal, Protocol

import httpx
from pydantic import SecretStr
from redis.asyncio import Redis

from kaptan.llm.budget import Budget, Caps
from kaptan.llm.mask_persons import mask_persons
from kaptan.llm.provider import ProviderError
from kaptan.llm.store import KVStore, MemoryStore, RedisStore
from kaptan.llm.transport import QuotaExhaustedError, Sleep, post_json
from kaptan.rag.chunking import est_tokens
from kaptan.rag.config import VECTOR_DIM, EmbeddingSpec, default_rag_config
from kaptan.settings import Settings, get_settings
from kaptan.text import norm_key

log = logging.getLogger("kaptan.rag")

Task = Literal["document", "query"]
Vector = list[float]

BUDGET_PROVIDER: Final = "gemini_embed"
CACHE_TTL_S: Final = 30 * 24 * 3600
#: Gemini accepts at most 100 requests per batchEmbedContents call.
GEMINI_MAX_BATCH: Final = 100
FAKE_MODEL: Final = "fake-hash-f5"
FAKE_VERSION: Final = "1"
_STOPWORDS_TEXT: Final = (
    "ve ile bir bu şu o da de ki için olan olarak ilgili hakkında üzere gibi kadar daha en çok her mi mı "
    "veya ya ise ait göre olup olması tarafından şirketimiz şirket aş kap the of and to in"
)
_STOPWORDS: Final = frozenset(_STOPWORDS_TEXT.split())


class EmbeddingError(ProviderError):
    """The embedder could not answer (provider down, cap reached, bad reply)."""


class Embedder(Protocol):
    """What the index and the retriever need: vectors of `dim` for documents and queries."""

    @property
    def model(self) -> str: ...

    @property
    def version(self) -> str: ...

    @property
    def dim(self) -> int: ...

    async def embed_documents(self, texts: Sequence[str]) -> list[Vector]: ...

    async def embed_queries(self, texts: Sequence[str]) -> list[Vector]: ...


class EmbeddingBackend(Protocol):
    """One vendor call for already masked texts (≤ `max_batch` per call)."""

    model: str
    version: str
    dim: int
    max_batch: int
    remote: bool

    async def embed(self, texts: Sequence[str], task: Task) -> list[Vector]: ...


def normalise(values: Sequence[float]) -> Vector:
    norm = math.sqrt(sum(v * v for v in values))
    if norm == 0:
        return [0.0 for _ in values]
    return [v / norm for v in values]


class FakeEmbeddingBackend:
    """Deterministic hashing embedder: bag of F5 stems (Turkish 5-prefix), signed, log-tf, L2-normalised."""

    model = FAKE_MODEL
    version = FAKE_VERSION
    max_batch = 1_000
    remote = False

    def __init__(self, dim: int = VECTOR_DIM) -> None:
        self.dim = dim
        self.calls = 0

    @staticmethod
    def features(text: str) -> Counter[str]:
        words = [w for w in norm_key(text).split() if len(w) > 1 and not w.isdigit() and w not in _STOPWORDS]
        return Counter(w[:5] for w in words)

    def vector(self, text: str) -> Vector:
        values = [0.0] * self.dim
        for feature, tf in self.features(text).items():
            digest = hashlib.sha256(feature.encode("utf-8")).digest()
            slot = int.from_bytes(digest[:4], "big") % self.dim
            sign = 1.0 if digest[4] & 1 else -1.0
            values[slot] += sign * (1.0 + math.log(tf))
        return normalise(values)

    async def embed(self, texts: Sequence[str], task: Task) -> list[Vector]:
        self.calls += 1
        return [self.vector(t) for t in texts]


class GeminiEmbeddingBackend:
    """`models/{model}:batchEmbedContents` over plain httpx (no SDK)."""

    max_batch = GEMINI_MAX_BATCH
    remote = True

    def __init__(
        self, spec: EmbeddingSpec, key: SecretStr, http: httpx.AsyncClient, *, sleep: Sleep | None = None
    ) -> None:
        self.model, self.version, self.dim = spec.model, spec.version, spec.dim
        self._spec, self._key, self._http = spec, key, http
        self._sleep: Sleep = sleep or asyncio.sleep

    def payload(self, texts: Sequence[str], task: Task) -> dict[str, Any]:
        task_type = self._spec.task_document if task == "document" else self._spec.task_query
        return {
            "requests": [
                {
                    "model": f"models/{self.model}",
                    "content": {"parts": [{"text": t}]},
                    "taskType": task_type,
                    "outputDimensionality": self.dim,
                }
                for t in texts
            ]
        }

    async def embed(self, texts: Sequence[str], task: Task) -> list[Vector]:
        url = f"{self._spec.base_url.rstrip('/')}/models/{self.model}:batchEmbedContents"
        headers = {"x-goog-api-key": self._key.get_secret_value(), "Content-Type": "application/json"}
        reply = await post_json(
            self._http,
            url,
            provider=BUDGET_PROVIDER,
            headers=headers,
            payload=self.payload(texts, task),
            timeout_s=self._spec.timeout_s,
            max_retries=self._spec.max_retries,
            sleep=self._sleep,
        )
        embeddings = reply.body.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise EmbeddingError(f"{BUDGET_PROVIDER}: unexpected reply shape", provider=BUDGET_PROVIDER)
        out: list[Vector] = []
        for item in embeddings:
            values = item.get("values") if isinstance(item, dict) else None
            if not isinstance(values, list) or len(values) != self.dim:
                raise EmbeddingError(f"{BUDGET_PROVIDER}: vector of wrong size", provider=BUDGET_PROVIDER)
            out.append(normalise([float(v) for v in values]))
        return out


class CachedEmbedder:
    """Mask → cache → caps → batched backend calls (paced). Implements `Embedder`."""

    def __init__(
        self,
        backend: EmbeddingBackend,
        *,
        store: KVStore | None = None,
        budget: Budget | None = None,
        batch_size: int = 16,
        min_interval_s: float = 0.0,
        sleep: Sleep | None = None,
        mask: bool = True,
    ) -> None:
        self.backend = backend
        self._store = store
        self._budget = budget
        self._batch = max(1, min(batch_size, backend.max_batch))
        self._min_interval_s = min_interval_s
        self._sleep: Sleep = sleep or asyncio.sleep
        self._mask = mask
        self._last_call: float | None = None
        self.remote_calls = 0
        self.cache_hits = 0

    @property
    def model(self) -> str:
        return self.backend.model

    @property
    def version(self) -> str:
        return self.backend.version

    @property
    def dim(self) -> int:
        return self.backend.dim

    def _cache_key(self, text: str, task: Task) -> str:
        raw = f"{self.model}|{self.version}|{self.dim}|{task}|{text}".encode()
        return f"kaptan:rag:emb:{hashlib.sha256(raw).hexdigest()}"

    async def _cached(self, key: str) -> Vector | None:
        if self._store is None:
            return None
        raw = await self._store.get(key)
        if raw is None:
            return None
        try:
            values = json.loads(raw)
        except ValueError:
            return None
        if not isinstance(values, list) or len(values) != self.dim:
            return None
        return [float(v) for v in values]

    async def _pace(self) -> None:
        loop = asyncio.get_running_loop()
        if self._last_call is not None and self._min_interval_s > 0:
            wait = self._min_interval_s - (loop.time() - self._last_call)
            if wait > 0:
                await self._sleep(wait)
        self._last_call = loop.time()

    async def _call(self, texts: list[str], task: Task) -> list[Vector]:
        est = sum(est_tokens(t) for t in texts)
        if self._budget is not None:
            try:
                await self._budget.reserve(BUDGET_PROVIDER, est_tokens=est)
            except ProviderError as exc:
                raise EmbeddingError(str(exc), provider=BUDGET_PROVIDER) from None
        await self._pace()
        try:
            vectors = await self.backend.embed(texts, task)
        except QuotaExhaustedError:
            if self._budget is not None:
                await self._budget.mark_exhausted(BUDGET_PROVIDER)
            raise EmbeddingError(f"{BUDGET_PROVIDER}: daily quota exhausted", provider=BUDGET_PROVIDER) from None
        except EmbeddingError:
            raise
        except ProviderError as exc:
            raise EmbeddingError(str(exc), provider=BUDGET_PROVIDER) from None
        if self.backend.remote:
            self.remote_calls += 1
        if self._budget is not None:
            await self._budget.record(BUDGET_PROVIDER, tokens_in=est, tokens_out=0)
        return vectors

    async def _embed(self, texts: Sequence[str], task: Task) -> list[Vector]:
        prepared = [mask_persons(t).text if self._mask else t for t in texts]
        out: list[Vector | None] = [None] * len(prepared)
        missing: list[int] = []
        for i, text in enumerate(prepared):
            hit = await self._cached(self._cache_key(text, task))
            if hit is None:
                missing.append(i)
            else:
                out[i] = hit
                self.cache_hits += 1
        for start in range(0, len(missing), self._batch):
            batch = missing[start : start + self._batch]
            vectors = await self._call([prepared[i] for i in batch], task)
            for i, vector in zip(batch, vectors, strict=True):
                out[i] = vector
                if self._store is not None:
                    key = self._cache_key(prepared[i], task)
                    await self._store.set(key, json.dumps([round(v, 7) for v in vector]), ttl_s=CACHE_TTL_S)
        if missing:
            log.info("rag embed %s: %d texts, %d from cache", task, len(prepared), len(prepared) - len(missing))
        return [v for v in out if v is not None]

    async def embed_documents(self, texts: Sequence[str]) -> list[Vector]:
        return await self._embed(texts, "document")

    async def embed_queries(self, texts: Sequence[str]) -> list[Vector]:
        return await self._embed(texts, "query")


def embed_caps(settings: Settings) -> dict[str, Caps]:
    return {
        BUDGET_PROVIDER: Caps(requests_per_day=settings.rag_embed_cap_rpd, tokens_per_day=settings.rag_embed_cap_tpd)
    }


def build_embedder(
    settings: Settings | None = None,
    *,
    kind: Literal["gemini", "fake"] | None = None,
    redis: Redis | None = None,
    store: KVStore | None = None,
    http: httpx.AsyncClient | None = None,
    sleep: Sleep | None = None,
) -> CachedEmbedder:
    """`fake` → the hashing embedder (no network). `gemini` → needs GEMINI_API_KEY, else EmbeddingError."""
    settings = settings or get_settings()
    kind = kind or settings.rag_embedder
    if kind == "fake":
        return CachedEmbedder(FakeEmbeddingBackend(), batch_size=FakeEmbeddingBackend.max_batch)
    key = settings.gemini_api_key
    if key is None or not key.get_secret_value().strip():
        raise EmbeddingError("gemini_embed: GEMINI_API_KEY is not set", provider=BUDGET_PROVIDER)
    kv: KVStore = store or (RedisStore(redis) if redis is not None else MemoryStore())
    client = http or httpx.AsyncClient(headers={"User-Agent": "kaptan-backend/0.1"})
    backend = GeminiEmbeddingBackend(default_rag_config().embedding, key, client, sleep=sleep)
    return CachedEmbedder(
        backend,
        store=kv,
        budget=Budget(kv, embed_caps(settings)),
        batch_size=settings.rag_embed_batch,
        min_interval_s=settings.rag_embed_min_interval_s,
        sleep=sleep,
    )


_SHARED: dict[str, CachedEmbedder] = {}


def get_embedder(settings: Settings | None = None) -> CachedEmbedder:
    """One embedder per process and kind; the live one keeps its cache and counters in REDIS_URL."""
    settings = settings or get_settings()
    kind = settings.rag_embedder
    if kind not in _SHARED:
        redis = None if kind == "fake" else Redis.from_url(settings.redis_url.get_secret_value())
        _SHARED[kind] = build_embedder(settings, kind=kind, redis=redis)
    return _SHARED[kind]
