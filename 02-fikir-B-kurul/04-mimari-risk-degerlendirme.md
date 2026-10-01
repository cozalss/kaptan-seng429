# Design for an "enterprise" LLM news-trading system (LangGraph, 4 students, $0)

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `05-proje-dokumanlari/_KANONIK-KARARLAR.md` → **Revizyon 3**.


*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026.*

## 1. Architecture

```
[Alpaca News WS] [Finnhub REST poll 60/min] [SEC EDGAR RSS]
          |               |                      |
          +------> Ingestor (async) -------------+
                     | normalize -> SHA256(url+title) + MinHash/SimHash of headline
                     | dedup: Redis SET NX (TTL 48h) + pgvector cosine>0.92 near-dup
                     v
               Redis Stream "news.raw"  (consumer groups, XACK, retry via XPENDING)
                     v
        Relevance filter (NO big LLM): symbol whitelist match -> FinBERT score
        -> |sentiment|>t AND novelty>t -> Flash-Lite yes/no (only if ambiguous)
                     v  (~5-10% of items pass)
     ---------------- LangGraph StateGraph (thread_id = event_id) ----------------
     fan-out: NewsAnalyst | FundamentalsAnalyst (RAG over pgvector: 10-K/10-Q,
              earnings transcripts, past decisions) | Technicals (pure pandas, no LLM)
     -> Bull vs Bear debate (1-2 rounds, structured reports, not chat history)
     -> Trader -> TradeProposal (Pydantic schema)
     -> DETERMINISTIC RiskGate (code, can only reduce/reject)
     -> if notional > threshold or low confidence: interrupt() -> Risk Officer UI
     -> Execution (Alpaca paper, idempotent client_order_id)
     -> Portfolio + reflection memory write (pgvector) + audit record
     -----------------------------------------------------------------------------
     PostgresSaver checkpointer | Postgres (audit, RBAC) | Langfuse traces
     FastAPI + Streamlit/React dashboard | APScheduler: EOD reports, recon, kill-switch checks
```

Pattern follows TradingAgents (Tauric Research, LangGraph): analyst, bull/bear researcher, trader, risk-manager roles; agents communicate via structured reports so context doesn't degrade.

**Run mode:** event-driven Redis Stream as main path; APScheduler for periodic jobs (EOD P&L, reconciliation, polling non-WS sources). Celery is overkill. **Latency:** full graph ~15–60 s on free tiers — fine for news trading, not HFT; say so in demo.

**HITL:** `interrupt(payload)` suspends graph, state saved to checkpointer; resume with `Command(resume={...})` on same `thread_id`. Node re-runs from start → side effects after `interrupt()`. Use PostgresSaver/SqliteSaver, not InMemorySaver.

## 2. Deterministic guardrails (plain Python, unit-tested, never an LLM)
1. **Schema validation:** Pydantic `TradeProposal` (symbol, side, qty, limit_price, confidence 0–1, evidence_ids). Fail → retry once → reject.
2. **Symbol whitelist** (e.g. 20 liquid US large caps).
3. **Max position** ≤5% equity per symbol; **max gross exposure** ≤50%.
4. **Max order notional/qty** (fat finger); **price collar** ±2% of last trade.
5. **Order rate limits** per minute/day; per-symbol cooldown (e.g. 30 min).
6. **Daily loss limit** −2% equity; **drawdown kill switch** −8% from peak — halts new orders AND cancels resting ones (RTS 6 Art. 12). Reset needs Admin + Risk Officer.
7. **Market-hours and stale-data checks.**
8. **Evidence requirement:** reject if `evidence_ids` empty or points to non-retrieved docs.
9. **Idempotency:** unique `client_order_id` per decision.
10. **LLM budget breaker:** quota exhausted → HOLD.

**Enterprise justification:** SEC Rule 15c3-5; MiFID II RTS 6 (EU 2017/589) Art. 12 kill functionality, Art. 15 pre-trade controls; FINRA Regulatory Notice 15-09; ESMA 2026 supervisory briefing.

## 3. Evaluation plan
- **Frameworks:** vectorbt (fast, OSS in maintenance mode) for baselines/sweeps; **own event-driven replay harness** feeding historical news through the same LangGraph (best fit); backtrader effectively frozen; zipline-reloaded active again (v0.6.x, 2026); NautilusTrader and Lean too heavy for 12 weeks.
- **Look-ahead bias:** only post-cutoff periods; point-in-time timestamps, trade next bar open; RAG index `published_at < decision_time`; masking test (Gao et al.); **live forward paper-trading from week ~6 to demo** = strongest evidence.
- **Metrics:** cumulative return, Sharpe, Sortino, max drawdown, Calmar, win rate, turnover, hit rate by signal type, guardrail rejections, HITL approval rate, $/decision, tokens/decision, p50/p95 latency.
- **Baselines:** buy-and-hold SPY; equal-weight whitelist buy-and-hold; 20/50 SMA momentum; FinBERT-only rule (long if positive >0.8, else flat); single-agent LLM (does the debate help?).
- **RAG eval (RAGAS):** faithfulness, context precision/recall, answer relevancy; ~50 hand-labelled questions; run in CI.

## 4. Free-tier budget (verify in AI Studio / Groq console in week 1)

| Stage | Model | Calls/decision | Free limit (as reported) |
|---|---|---|---|
| Filter | FinBERT local + embeddings | 0 LLM | unlimited (CPU) |
| Ambiguous filter | Gemini Flash-Lite | 0–1 | ~15 RPM / ~1,000 RPD* |
| Analysts + bull/bear + trader | Gemini Flash / Groq gpt-oss-120b | ~5–6 | Flash ~10 RPM / 250 RPD*; Groq 30 RPM, 1K RPD, **8K TPM, 200K TPD** |
| Embeddings | Gemini embedding / local bge-small | 1–3 | generous / unlimited |

\*Secondary sources disagree; newer Flash models reportedly get far fewer free requests (~20 RPD).

**Realistic target: 30–60 full decisions/day.** 5 calls × ~4K tokens ≈ 20K tokens/decision; Groq 200K TPD alone ≈ 10 decisions/day → spread across Gemini, Groq, local Ollama. Tricks: technicals in code; 1 debate round; cache per (symbol, doc-hash); batch headlines; precompute filing summaries; **pre-record backup demo run.**

## 5. Enterprise features for the demo
- **Append-only audit log** (Postgres, hash-chained rows): event, filter scores, retrieved chunk IDs/text, agent reports, debate transcript, proposal, each guardrail pass/fail with reason, approver, order, fill.
- **Explainability view:** "Why did we buy AAPL?" — evidence, bull vs bear, confidence.
- **RBAC** (FastAPI + JWT): Analyst (view/annotate), Risk Officer (approve/reject interrupts, kill switch, limits), Admin (users, config, whitelist). Limit changes audited.
- **HITL queue** above notional threshold.
- **Observability:** Langfuse (MIT, self-host) or LangSmith Developer (5K traces/mo, 14-day retention). Prometheus/Grafana optional.
- **Demo script:** inject news → live trace → pause for approval → Risk Officer approves → paper fill → force a loss → kill switch → audit trail.

## Sources
- TradingAgents: https://arxiv.org/abs/2412.20138 , https://github.com/tauricresearch/tradingagents
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- SEC 15c3-5: https://www.law.cornell.edu/cfr/text/17/240.15c3-5 , https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/divisionsmarketregfaq-0
- MiFID II RTS 6: https://ec.europa.eu/finance/securities/docs/isd/mifid/rts/160719-rts-6_en.pdf ; ESMA 2026: https://www.esma.europa.eu/sites/default/files/2026-02/ESMA74-1505669079-10311_Supervisory_Briefing_on_Algorithmic_Trading_in_the_EU.pdf
- FINRA 15-09: https://www.finra.org/rules-guidance/notices/15-09
- Look-ahead bias: https://arxiv.org/html/2512.23847v2 , https://arxiv.org/html/2512.06607v1
- Backtesting landscape: https://autotradelab.com/blog/backtrader-vs-nautilusttrader-vs-vectorbt-vs-zipline-reloaded , https://quanttradingtools.com/python-backtesting-frameworks/
- RAGAS: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
- FinBERT: https://huggingface.co/ProsusAI/finbert
- Alpaca: https://docs.alpaca.markets/us/docs/paper-trading , https://docs.alpaca.markets/us/docs/streaming-real-time-news
- Finnhub: https://finnhub.io/docs/api/rate-limit
- Gemini: https://ai.google.dev/gemini-api/docs/rate-limits , https://www.aifreeapi.com/en/posts/gemini-api-free-tier-complete-guide
- Groq: https://console.groq.com/docs/rate-limits
- Langfuse: https://langfuse.com/self-hosting ; LangSmith: https://www.langchain.com/pricing
