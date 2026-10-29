"""The model registry (`config/models.yaml`): pinned model IDs, endpoints, timeouts and chains per agent.

Model IDs exist only in that file (05 §1.4); code asks the registry. Loading validates the whole file,
so a typo fails at startup instead of on the first disclosure.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Final, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from kaptan.settings import BACKEND_DIR

MODELS_FILE: Final = BACKEND_DIR / "config" / "models.yaml"
ProviderKey = Literal["gemini", "deepseek", "groq", "azure", "ollama"]
#: Fallbacks appended to every live chain when configured (FR-21, 05 §1.4 Rev. 3:
#: … → Groq → Azure for Students → Ollama → HOLD).
LOCAL_TAIL: tuple[ProviderKey, ...] = ("azure", "ollama")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Pricing(_Strict):
    """USD per 1M tokens (estimates for the daily cost cap; free tiers have none)."""

    input_cache_hit: float = Field(ge=0)
    input_cache_miss: float = Field(ge=0)
    output: float = Field(ge=0)

    def cost_usd(self, tokens_in: int, tokens_out: int, cache_hit_in: int = 0) -> float:
        miss = max(0, tokens_in - cache_hit_in)
        return (cache_hit_in * self.input_cache_hit + miss * self.input_cache_miss + tokens_out * self.output) / 1e6


class ProviderSpec(_Strict):
    kind: Literal["gemini", "openai", "azure"]
    base_url: str
    model: str
    timeout_s: float = Field(default=45, gt=0)
    max_retries: int = Field(default=2, ge=0, le=5)
    thinking_level: Literal["minimal", "low", "medium", "high"] | None = None
    response_format: Literal["json_object", "json_schema"] = "json_object"
    reasoning_effort: Literal["low", "medium", "high"] | None = None
    #: gpt-oss spends completion tokens on reasoning: added on top of the agent's output budget.
    reasoning_buffer_tokens: int = Field(default=768, ge=0)
    price_usd_per_mtok: Pricing | None = None


class GuardSpec(_Strict):
    provider: ProviderKey = "groq"
    model: str
    chunk_chars: int = Field(default=1_500, gt=100)
    max_chunks: int = Field(default=8, ge=1)
    timeout_s: float = Field(default=20, gt=0)
    rule_score: float = Field(default=0.95, ge=0, le=1)


class AgentSpec(_Strict):
    chain: tuple[ProviderKey, ...] | None = None
    max_output_tokens: int = Field(default=1_200, gt=0)


class ModelsConfig(_Strict):
    version: int
    providers: dict[ProviderKey, ProviderSpec]
    guard: GuardSpec
    default_chain: tuple[ProviderKey, ...]
    agents: dict[str, AgentSpec] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _chains_known(self) -> ModelsConfig:
        chains = [self.default_chain, *(a.chain for a in self.agents.values() if a.chain)]
        for chain in chains:
            missing = [p for p in chain if p not in self.providers]
            if missing:
                raise ValueError(f"chain names unknown providers: {missing}")
        if self.guard.provider not in self.providers:
            raise ValueError(f"guard provider {self.guard.provider!r} is not configured")
        return self

    def chain_for(self, agent: str) -> tuple[ProviderKey, ...]:
        spec = self.agents.get(agent)
        return spec.chain if spec is not None and spec.chain else self.default_chain

    def max_output_tokens(self, agent: str, requested: int) -> int:
        spec = self.agents.get(agent)
        return min(requested, spec.max_output_tokens) if spec is not None else requested


def load_models(path: Path = MODELS_FILE) -> ModelsConfig:
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return ModelsConfig.model_validate(raw)


@lru_cache(maxsize=1)
def default_models() -> ModelsConfig:
    return load_models()
