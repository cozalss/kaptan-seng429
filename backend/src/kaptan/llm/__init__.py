"""LLM access for the agent graph: one `LLMProvider` protocol, replay now, live providers in M2."""

from __future__ import annotations

from kaptan.llm.provider import LLMProvider, LLMRequest, LLMResult, LLMUsage, ProviderChain, ProviderError
from kaptan.llm.replay import ReplayMissError, ReplayProvider


def get_provider(llm_mode: str) -> LLMProvider:
    """`LLM_MODE=replay` → recorded answers. `live` (Gemini/Groq/DeepSeek chain) arrives with M2."""
    if llm_mode == "replay":
        return ReplayProvider()
    raise NotImplementedError("LLM_MODE=live: Gemini, Groq ve DeepSeek sağlayıcıları M2'de gelecek")


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
