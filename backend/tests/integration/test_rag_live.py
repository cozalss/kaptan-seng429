"""Live smoke test of the Gemini embedder: 2 real embedding calls (opt-in, `-m live`).

uv run pytest -m live tests/integration/test_rag_live.py
"""

from __future__ import annotations

import math

import pytest

from kaptan.llm.store import MemoryStore
from kaptan.rag.embed import build_embedder
from kaptan.settings import get_settings

pytestmark = pytest.mark.live


async def test_gemini_embeddings_rank_the_matching_disclosure_first() -> None:
    settings = get_settings()
    if settings.gemini_api_key is None:
        pytest.skip("GEMINI_API_KEY not set")
    embedder = build_embedder(settings, kind="gemini", store=MemoryStore())  # no shared cache: really call
    docs = await embedder.embed_documents(
        [
            "[AZTEK | 2026-10-16 | Payların Geri Alınmasına İlişkin Bildirim | ODA | kap:1683372] "
            "Şirketimiz 16.10.2026 tarihinde 10.000 adet pay geri almıştır.",
            "[TMSN | 2026-10-16 | İhale Süreci / Sonucu | ODA | kap:1683277] "
            "Şirketimiz katıldığı ihaleyi kazanmış olup sözleşme imzalanacaktır.",
        ]
    )
    (query,) = await embedder.embed_queries(["pay geri alım işlemleri"])
    assert embedder.remote_calls == 2
    assert all(len(v) == 1024 and abs(math.sqrt(sum(x * x for x in v)) - 1) < 1e-6 for v in [*docs, query])
    cos = [sum(a * b for a, b in zip(query, d, strict=True)) for d in docs]
    assert cos[0] > cos[1]
