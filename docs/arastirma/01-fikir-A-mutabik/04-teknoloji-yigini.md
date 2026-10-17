# Recommended 2026 stack: LLM + RAG + agents, 4 students, ~$0

*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026. Bu yığın her iki fikir için de geçerlidir.*

| Layer | Pick | Why / cost |
|---|---|---|
| Main LLM | **Gemini Flash (3 Flash / 2.5 Flash)** via `langchain-google-genai` | Free, no card, good Turkish, tool calling, 1M context. Third-party trackers (Sep 2026): ~10 RPM / 250K TPM / 1,000–1,500 RPD — **confirm in AI Studio**. Pro models reportedly no longer free. |
| Fallback / fast LLM | **Groq free tier** (gpt-oss-120b/20b, llama-3.3-70b) | 30 RPM, ~1K RPD, only **6–12K TPM** → use for routing/classifier nodes. **OpenRouter `:free`**: 20 RPM, 50 RPD (1,000 RPD after one-time $10 top-up). |
| "Enterprise-safe" LLM | **Azure for Students** ($100/yr, no card) → Azure OpenAI mini model | Data not used for training. Keep for demo and final eval runs. |
| Local/offline | **Ollama: qwen3.5:9b / 4b** | Native tool calling; small models unreliable → offline/privacy demo only. |
| Embeddings | **bge-m3** (1024-dim, 8K ctx, dense+sparse), local | Free; strong Turkish (TR-MTEB mean 63.8). Alternatives: Qwen3-Embedding-0.6B, multilingual-e5-large, gemini-embedding-001 (~$0.15/M tokens). |
| Vector DB | **pgvector on Postgres 16/17** | One DB for documents, users/RBAC, **row-level security**, hybrid search (pgvector + `tsvector` `turkish` config, RRF merge), LangGraph checkpointer. Chroma as dev baseline. Pinecone free: us-east-1 only, pauses after 3 weeks idle. |
| Agents | **LangGraph + LangChain 1.x** | See below. |
| Eval | **RAGAS** (faithfulness, context precision/recall, answer relevancy), Gemini as judge | Turkish golden set of 50–100 Q/A. |
| Observability | **LangSmith Developer** (free, 5K traces/mo, 14-day retention, 1 seat) or **Langfuse Cloud Hobby** | Self-hosted Langfuse v3 needs 6 containers, ~4 CPU / 16 GB RAM — heavy for laptops. |
| Backend / Frontend | **FastAPI** (SSE, JWT) + **Next.js / React** | |
| Infra | **Docker Compose**: `api`, `web`, `postgres(pgvector)`, optional `ollama` | One `docker compose up`. |

## LangGraph features worth showcasing
1. **Human-in-the-loop:** `interrupt()` + resume with `Command(resume=...)`; or `HumanInTheLoopMiddleware` on `create_agent`.
2. **Persistence:** `PostgresSaver` (`langgraph-checkpoint-postgres`) — memory by `thread_id`, time travel, resumable runs.
3. **Multi-agent:** current docs recommend subagents-as-tools (supervisor), handoffs, or router. Avoid the older `langgraph-supervisor` package; docs point to "Deep Agents" for built-in multi-agent.
4. **Streaming:** `stream_mode=["messages","updates"]` over SSE.

## Gotchas
- **Rate limits:** one key per student; retry/backoff on 429 (Groq sends `retry-after`); cache embeddings; don't embed via rate-limited API.
- **Gemini free-tier data may be used for training** → synthetic/public docs only; say so in the report.
- **Turkish tokenization:** many more tokens per word than English; budget TPM; chunk by tokens.
- **Dotted/dotless i:** `"I".lower()` → `"i"`, Turkish needs `"ı"`; use Postgres `turkish` FTS config.
- **Interrupt caveats:** on resume the whole node re-runs → code before `interrupt()` must be idempotent; never wrap `interrupt()` in bare `try/except`.
- **Small local models** garble tool calls → validate args with Pydantic.
- **LangSmith retention 14 days** → export eval results.
- **RAGAS with free judge** is slow → fixed subset, cache results.

## Sources
- Gemini limits: https://pecollective.com/tools/gemini-free-tier-guide/ ; https://ai.google.dev/gemini-api/docs/rate-limits
- Groq: https://console.groq.com/docs/rate-limits ; https://tokenmix.ai/blog/groq-free-tier-limits-2026
- OpenRouter: https://openrouter.zendesk.com/hc/en-us/articles/39501163636379
- Azure for Students: https://azure.microsoft.com/en-us/free/students
- Ollama qwen3.5 tool calling: https://x.com/ollama/status/2028510184788926567
- TR-MTEB: https://aclanthology.org/2025.findings-emnlp.471.pdf ; Qwen3-Embedding: https://arxiv.org/pdf/2506.05176
- Pinecone: https://docs.pinecone.io/release-notes/2026
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts ; multi-agent: https://docs.langchain.com/oss/python/langchain/multi-agent
- LangSmith pricing: https://inference.net/content/langsmith-pricing/
- Langfuse self-hosting: https://langfuse.com/self-hosting
- RAGAS: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/

**Not verified:** exact Gemini per-model numbers, Langfuse Cloud Hobby quota, GitHub Models free limits.
