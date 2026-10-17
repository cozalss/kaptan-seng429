"""LLM access for the agent graph: one `LLMProvider` protocol, replay (M1) and live (M2) behind it."""

from __future__ import annotations

from typing import Any

from kaptan.llm.provider import LLMProvider, LLMRequest, LLMResult, LLMUsage, ProviderChain, ProviderError
from kaptan.llm.replay import ReplayMissError, ReplayProvider

_LIVE: dict[int, LLMProvider] = {}


def get_provider(llm_mode: str, *, settings: Any = None, redis: Any = None) -> LLMProvider:
    """`replay` → recorded answers (no network). `live` → the masked, cached, budgeted provider chain
    (Gemini Flash-Lite → DeepSeek → Groq gpt-oss, Prompt Guard 2 for `guard`); one per process and Redis
    client, so the cache, counters and HTTP connections are shared across runs."""
    if llm_mode == "replay":
        return ReplayProvider()
    if llm_mode != "live":
        raise ValueError(f"unknown LLM_MODE: {llm_mode!r}")
    from kaptan.llm.factory import build_live_provider
    from kaptan.settings import Settings, get_settings

    resolved = settings if isinstance(settings, Settings) else get_settings()
    slot = id(redis)
    if slot not in _LIVE:
        _LIVE[slot] = build_live_provider(resolved, redis=redis)
    return _LIVE[slot]


__all__ = [
    "LLMProvider",
    "LLMRequest",
    "LLMResult",
    "LLMUsage",
    "ProviderChain",
    "ProviderError",
    "ReplayMissError",
    "ReplayProvider",
    "get_provider",
]
