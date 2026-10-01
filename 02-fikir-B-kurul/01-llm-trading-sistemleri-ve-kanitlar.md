# LLM trading agents, 2024–2026: frameworks, live results, failure modes, verdict

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `05-proje-dokumanlari/_KANONIK-KARARLAR.md` → **Revizyon 3**.


*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026.*

## 1. Frameworks
GitHub stars, licenses and last-push dates pulled from the GitHub API on 2026-09-29.

| Framework | Architecture / roles | Data | License / stars / activity | LangGraph? | Reported result |
|---|---|---|---|---|---|
| **TradingAgents** (Tauric, arXiv 2412.20138) | Fundamental, sentiment, news, technical analysts → bull/bear debate → trader → risk team (aggressive/neutral/conservative) → portfolio manager | Prices, news, social, fundamentals | Apache-2.0, ~109k stars, pushed today; v0.2.x (2026) multi-provider, checkpoint resume, persistent decision log | **Yes** | AAPL +26.6%, Sharpe 8.21 (Jun–Nov 2024). Independent check: buy-and-hold was **+9.1%, not −5.2%** as the paper claims. Look-ahead issue (#203) open. |
| **ai-hedge-fund** (virattt) | "Investor persona" agents (Buffett, Munger…) + valuation, sentiment, risk, portfolio managers | Financial APIs, news | MIT, ~64k stars, active | **Yes** | Education demo, no rigorous results |
| **FinMem** | Single agent, layered memory (short/mid/long) + profiling | News, 10-K/Q | MIT, ~1k stars, **inactive since 2024** | No | Beat baselines on few tickers, short windows |
| **FinAgent** (KDD'24) | Multimodal (charts + text), tool-augmented, reflection | 6 stock/crypto datasets | Partially public | No | "+36% avg profit improvement, 92% return on one dataset" |
| **FinCon** (NeurIPS'24) | Manager–analyst hierarchy, conceptual verbal reinforcement | News, filings, prices | Research code | No | Beat FinMem and FinAgent |
| **FinRobot** (AI4Finance) | Agent platform (forecaster, analyst, report writer), AutoGen | Finnhub, yfinance, SEC | Apache-2.0, ~8.1k stars | No | Mostly report generation, no proven alpha |
| **FinGPT** (AI4Finance) | LoRA-fine-tuned open LLMs for sentiment, forecasting, RAG | HF news/tweets datasets | MIT, ~21k stars | No | Good sentiment F1; component, not trader |
| **AI-Trader** (HKUDS, arXiv 2512.10971) | Live contamination-free benchmark; MCP tools | US stocks, A-shares, crypto | No license, ~22.6k stars | No | "Most agents show poor returns and weak risk management" |

Sources: https://github.com/TauricResearch/TradingAgents · https://arxiv.org/abs/2412.20138 · https://dev.to/trow126/the-most-starred-llm-trading-paper-claims-buy-and-hold-lost-523-it-actually-gained-912-1jj6 · https://github.com/virattt/ai-hedge-fund · https://github.com/pipiku915/FinMem-LLM-StockTrading · https://arxiv.org/abs/2402.18485 · https://arxiv.org/html/2407.06567v3 · https://github.com/AI4Finance-Foundation/FinRobot · https://github.com/AI4Finance-Foundation/FinGPT · https://arxiv.org/abs/2512.10971

## 2. Live and out-of-sample evidence
- **Alpha Arena Season 1** (nof1.ai, 18 Oct – 3 Nov 2025): six models, $10k real money each, crypto perpetuals on Hyperliquid.
  - Profitable: Qwen3 Max +22.3%, DeepSeek V3.1 ~+4.9%.
  - Losing: Claude Sonnet 4.5 −42%, Gemini 2.5 Pro ~−45% to −67%, Grok 4, GPT-5 −63% to −75%.
  - Losers used high leverage (GPT-5 ~17x, Gemini ~14x); Gemini overtraded, ~$1.3k in fees.
  - Sources: https://www.gncrypto.news/news/qwen-wins-alpha-arena-season-1-with-22-percent-returns/ · https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/ · https://www.iweaver.ai/blog/alpha-arena-ai-trading-season-1-results/
- **Alpha Arena Season 1.5** (Nov – 3 Dec 2025): US equities, 8 models × 4 modes, $320k total.
  - **Only 6 of 32 accounts positive. Aggregate −35.2% (−$112.6k).**
  - Winner: "mystery model" Grok 4.20, +12.1%, positive in all 4 modes. Season 1 winner Qwen3 Max **lost in all four**.
  - Nof1: "statistical power is limited… run-to-run variation."
  - No Season 2 as of Aug 2026; Nof1 raised $15M in May 2026.
  - Sources: https://forklog.com/en/ai-model-grok-4-2-triumphs-in-trading-tournament/ · https://github.com/josejuarez96/tradepartner/pull/233 · https://www.traderank.ai/blog/alpha-arena-alternatives-2026
- **StockBench** (Mar–Jun 2025, 20 DJIA stocks, uncontaminated): buy-and-hold +0.4% (MDD −15.2%). Best: Qwen3-235B +2.4%, GLM-4.5 +2.3%, Kimi-K2 +1.9%. Worst: GPT-OSS-20B −2.8%, GPT-OSS-120B −0.9%. **Most failed to beat buy-and-hold.** https://arxiv.org/html/2510.02209
- **FINSABER** (KDD 2026 oral): 20 years, 100+ symbols, biases controlled. **FinMem/FinAgent advantages "deteriorate significantly."** Too conservative in bull, too aggressive in bear. https://arxiv.org/abs/2505.07078 · https://github.com/waylonli/FINSABER
- **InvestorBench** (ACL 2025): 13 LLMs; bigger/proprietary better, **all struggle in volatile markets.** https://aclanthology.org/2025.acl-long.126/

## 3. Known failure modes
1. **Look-ahead bias / memorization** — predictive power ~0 after training cutoff; masking prompts don't stop recall. https://arxiv.org/abs/2512.23847 · https://arxiv.org/pdf/2603.26797
2. **Wrong baselines, tiny test windows** (TradingAgents' wrong buy-and-hold sign; Sharpe 8 over ~105 days; no transaction costs).
3. **Overtrading, fees, leverage misuse** (Alpha Arena S1).
4. **Regime blindness** — bad in bear/volatile periods.
5. **Prompt/seed sensitivity, run-to-run variance.**
6. **Hallucinated numbers, unfaithful reasoning** (TradeTrap: https://arxiv.org/pdf/2512.02261).
7. **Prompt injection/poisoning via news and social media** — spreads between agents. https://arxiv.org/pdf/2608.24069 · https://arxiv.org/pdf/2609.19789
8. **Cost and latency** — dozens of LLM calls per ticker per decision.
9. **Survivorship and cherry-picked tickers.**

## 4. Verdict
**No credible evidence that LLM agents reliably beat buy-and-hold** after costs, long-term, out of sample. Positive paper results are mostly short, in-training-data backtests on cherry-picked tickers. Live tests show most agents losing or matching the market; winners don't repeat.

For the project: paper-trading, news-driven multi-agent system is still a strong LangGraph/RAG showcase. Model on TradingAgents or ai-hedge-fund (the only two major LangGraph ones). Include: buy-and-hold baseline, post-cutoff evaluation, transaction costs, multi-seed variance, prompt-injection defenses. Pitch as "evaluation and risk-aware agent system," not money-maker. **No real money.**

Caveats: Alpha Arena S1 figures for Gemini/DeepSeek vary between secondary sources (nof1 took pages down); nof1 methodology post returned 403.
