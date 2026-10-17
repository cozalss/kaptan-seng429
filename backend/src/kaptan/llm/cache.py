"""Response cache (04 Q5 "Redis LLM cache", 05 §9 item 4): the same disclosure re-run costs nothing.

Key = sha256(agent, prompt version, prompt template sha256, schema, inputs, document sha256, context).
The template hash means an edited prompt never reuses an old answer; the document hash means a
corrected disclosure text never does either. Only validated outputs are stored.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final

from kaptan.llm.provider import LLMRequest, LLMUsage
from kaptan.llm.store import KVStore

DEFAULT_TTL_S: Final = 30 * 24 * 3600


def cache_key(request: LLMRequest, prompt_sha256: str = "") -> str:
    document = request.document or ""
    canonical = json.dumps(
        {
            "agent": request.agent,
            "prompt_version": request.prompt_version,
            "prompt_sha256": prompt_sha256,
            "schema": None if request.output_schema is None else request.output_schema.__name__,
            "inputs": request.inputs,
            "document_sha256": hashlib.sha256(document.encode("utf-8")).hexdigest(),
            "context": request.context,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class CachedAnswer:
    output: Mapping[str, Any]
    usage: LLMUsage
    provider: str


class ResponseCache:
    def __init__(self, store: KVStore, *, ttl_s: int = DEFAULT_TTL_S) -> None:
        self._store = store
        self._ttl_s = ttl_s

    @staticmethod
    def _key(key: str) -> str:
        return f"kaptan:llm:cache:{key}"

    async def get(self, key: str) -> CachedAnswer | None:
        raw = await self._store.get(self._key(key))
        if raw is None:
            return None
        try:
            doc = json.loads(raw)
            u = doc["usage"]
            usage = LLMUsage(
                model_id=u.get("model_id"),
                tokens_in=int(u.get("tokens_in", 0)),
                tokens_out=int(u.get("tokens_out", 0)),
                latency_ms=0,
                cached=True,
            )
            return CachedAnswer(output=doc["output"], usage=usage, provider=str(doc["provider"]))
        except (ValueError, KeyError, TypeError):  # a corrupt entry is a miss, never a crash
            return None

    async def put(self, key: str, output: Mapping[str, Any], usage: LLMUsage, provider: str) -> None:
        doc = {
            "output": dict(output),
            "provider": provider,
            "usage": {"model_id": usage.model_id, "tokens_in": usage.tokens_in, "tokens_out": usage.tokens_out},
        }
        await self._store.set(self._key(key), json.dumps(doc, ensure_ascii=False), ttl_s=self._ttl_s)
