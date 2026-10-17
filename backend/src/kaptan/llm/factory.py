"""Wiring of the live chain from settings + `config/models.yaml` (keys from env, never from files).

A provider without a key is simply left out of every chain; Prompt Guard needs the Groq key (without it
the guard is rules-only). Counters and the cache use Redis when a client is given, memory otherwise.
"""

from __future__ import annotations

from typing import Final

import httpx
from pydantic import SecretStr
from redis.asyncio import Redis

from kaptan.llm.budget import Budget, Caps
from kaptan.llm.cache import ResponseCache
from kaptan.llm.clients import GeminiClient, ModelClient, OpenAICompatClient
from kaptan.llm.guard import GUARD_PROVIDER, GuardProvider, PromptGuardClient
from kaptan.llm.live import LiveProvider
from kaptan.llm.provider import LLMProvider
from kaptan.llm.registry import ModelsConfig, ProviderSpec, default_models
from kaptan.llm.store import KVStore, MemoryStore, RedisStore
from kaptan.llm.structured import StructuredProvider
from kaptan.settings import Settings

HTTP_LIMITS: Final = httpx.Limits(max_connections=20, max_keepalive_connections=10)


def usable_key(value: SecretStr | None) -> SecretStr | None:
    return value if value is not None and value.get_secret_value().strip() else None


def caps_from(settings: Settings) -> dict[str, Caps]:
    return {
        "gemini": Caps(requests_per_day=settings.llm_cap_gemini_rpd),
        "deepseek": Caps(requests_per_day=settings.llm_cap_deepseek_rpd, usd_per_day=settings.llm_cap_deepseek_usd),
        "groq": Caps(requests_per_day=settings.llm_cap_groq_rpd, tokens_per_day=settings.llm_cap_groq_tpd),
        GUARD_PROVIDER: Caps(requests_per_day=settings.llm_cap_guard_rpd),
    }


def _keys(settings: Settings) -> dict[str, SecretStr | None]:
    return {
        "gemini": usable_key(settings.gemini_api_key),
        "deepseek": usable_key(settings.deepseek_api_key),
        "groq": usable_key(settings.groq_api_key),
    }


def _client(name: str, spec: ProviderSpec, key: SecretStr, http: httpx.AsyncClient) -> ModelClient:
    if spec.kind == "gemini":
        return GeminiClient(name, spec, key, http)
    return OpenAICompatClient(name, spec, key, http)


def build_live_provider(
    settings: Settings,
    *,
    redis: Redis | None = None,
    store: KVStore | None = None,
    http: httpx.AsyncClient | None = None,
    models: ModelsConfig | None = None,
) -> LiveProvider:
    models = models or default_models()
    kv: KVStore = store or (RedisStore(redis) if redis is not None else MemoryStore())
    http = http or httpx.AsyncClient(limits=HTTP_LIMITS, headers={"User-Agent": "kaptan-backend/0.1"})
    budget = Budget(kv, caps_from(settings))
    keys = _keys(settings)
    providers: dict[str, LLMProvider] = {}
    for name, spec in models.providers.items():
        key = keys.get(name)
        if key is None:
            continue
        pricing = spec.price_usd_per_mtok
        providers[name] = StructuredProvider(_client(name, spec, key, http), budget, pricing=pricing)
    guard_key = keys.get(models.guard.provider)
    guard_client = (
        None
        if guard_key is None
        else PromptGuardClient(models.providers[models.guard.provider], models.guard, guard_key, http, budget)
    )
    return LiveProvider(
        models=models,
        providers=providers,
        guard=GuardProvider(guard_client, models.guard),
        budget=budget,
        cache=ResponseCache(kv, ttl_s=settings.llm_cache_ttl_s),
    )
