"""RAG over the KAP disclosure archive (M2, 07 §9–§12): chunking, embeddings, `rag.rag_chunks`, hybrid search.

Modules: `config` (config/rag.yaml), `chunking` (Turkish-aware), `embed` (Embedder: Gemini / fake),
`store` + `index` (backfill CLI `python -m kaptan.rag.index`, ingest hook `index_new_disclosures`),
`hybrid` (`similar_disclosures`: dense + Turkish full text + trigram, RRF, no look-ahead),
`agent_context` (`attach_similar`: "benzer geçmiş bildirimler" for the analysts, live mode only),
`eval` (offline recall@k on the committed KAP fixtures). Kept import-light on purpose.
"""
