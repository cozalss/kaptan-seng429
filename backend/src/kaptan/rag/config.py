"""`config/rag.yaml`: the embedding model (pinned ID, vector size), chunker and hybrid-search knobs.

Loading validates the whole file, so a typo fails at startup instead of on the first disclosure.
The vector size is fixed by migration 0012 (`vector(1024)`); a model with another size needs a new
column or table and a re-embedding (04 ADR-002).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Final, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from kaptan.settings import BACKEND_DIR

RAG_FILE: Final = BACKEND_DIR / "config" / "rag.yaml"
#: The column size of rag.rag_chunks.embedding (migration 0012).
VECTOR_DIM: Final = 1024


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class EmbeddingSpec(_Strict):
    provider: Literal["gemini"] = "gemini"
    base_url: str
    model: str
    version: str
    dim: int = Field(default=VECTOR_DIM, ge=VECTOR_DIM, le=VECTOR_DIM)
    max_input_tokens: int = Field(default=2048, gt=0)
    timeout_s: float = Field(default=30, gt=0)
    max_retries: int = Field(default=2, ge=0, le=5)
    task_document: str = "RETRIEVAL_DOCUMENT"
    task_query: str = "RETRIEVAL_QUERY"


class ChunkingSpec(_Strict):
    single_max_tokens: int = Field(default=500, gt=0)
    target_tokens: int = Field(default=400, gt=0)
    max_tokens: int = Field(default=700, gt=0)
    overlap_max_tokens: int = Field(default=80, ge=0)
    query_max_chars: int = Field(default=2400, gt=100)


class HybridSpec(_Strict):
    rrf_k: int = Field(default=60, gt=0)
    leg_limit: int = Field(default=50, gt=0, le=500)
    ef_search: int = Field(default=100, gt=0, le=1000)
    trigram_max_words: int = Field(default=12, ge=0)


class RagConfig(_Strict):
    version: int
    embedding: EmbeddingSpec
    chunking: ChunkingSpec = ChunkingSpec()
    hybrid: HybridSpec = HybridSpec()


def load_rag_config(path: Path = RAG_FILE) -> RagConfig:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return RagConfig.model_validate(data)


@lru_cache(maxsize=1)
def default_rag_config() -> RagConfig:
    return load_rag_config()
