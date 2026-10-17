# Data sources for a news-driven LLM/RAG trading system (~$0)

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.


*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026.*

**Bottom line:** Strongest free stack: **Alpaca** (Benzinga news WS, IEX prices, paper trading) for US; **KAP** (MKK API Portal or scraper) + **Bloomberg HT RSS** + **TCMB EVDS** for Turkey; **Binance websockets** for crypto; **FNSPID** + Alpaca news archive (since 2015) for backtests. Free BIST prices delayed ≥15 min → news-driven intraday on US/crypto; BIST daily or paper.

## 1. Ranked sources

| # | Source | Free tier | Latency | Coverage / history | Notes |
|---|---|---|---|---|---|
| 1 | **Alpaca News API (Benzinga)** | 200 calls/min; WS news stream | Real-time push | US stocks + crypto; ~130 articles/day; archive since 2015 | Free status announced as "limited-time beta" — verify |
| 2 | **KAP via MKK API Portal** | Free; 12 services | Near-real-time (official) | All BIST disclosures | Fallbacks: `kap_sdk`, `kap-client`, `pykap` (scrapers) |
| 3 | **Finnhub** | 60 calls/min; WS trades ~50 symbols | Real-time quotes; news polled | North American company news, past 1 year | Non-commercial only; SEC filings |
| 4 | **SEC EDGAR** (data.sec.gov) | Free, no key; 10 req/s; User-Agent with email | Minutes | All US filings since 1990s | 8-K triggers; 10-K/10-Q for RAG |
| 5 | **Binance websockets** | Free, no login; up to 1024 streams/connection | Real-time | Crypto | |
| 6 | **GDELT DOC 2.0** | Free, no key | 15 min | Global, 65 languages incl. Turkish | Noisy; macro/geopolitics |
| 7 | **RSS**: Bloomberg HT, Habertürk/CNN Türk economy, Bigpara | Free | 1–5 min polling | Turkish market news | Check ToS before storing full text |
| 8 | **TCMB EVDS** | Free API key (in HTTP header since Apr 2024) | Daily | Rates, FX, CPI | `evds`, `evdspy` |
| 9 | **Marketaux** | 100 req/day, 3 articles/req | Near-real-time | Global, sentiment per entity | Enrichment only |
| 10 | **Alpha Vantage NEWS_SENTIMENT** | 25 req/day | Polled | Global | Too few for live |
| 11 | **Massive (ex-Polygon)** | 5 calls/min, EOD, 2y history | EOD | US | Backtest only |
| 12 | **NewsAPI.org** | 100 req/day, **24h delay**, localhost only | 24h | General | Not usable |

## 2. Price data
- **US:** Alpaca free = real-time IEX WS (30 channels, unlimited minute bars) + paper.
- **BIST:** `yfinance` (`THYAO.IS`), `isyatirimhisse` (prices + financials; unofficial, personal use). ≥15 min delay; real-time via licensed vendors (e.g. dxFeed).
- **Crypto:** Binance / BtcTurk websockets.

## 3. Financial NLP
- **English:** FinBERT (`ProsusAI/finbert`) as fast free first-pass filter.
- **LLMs vs FinBERT:** Lopez-Lira & Tang — GPT sentiment on headlines predicts next-day returns, better with larger models; FinBERT labels ~75% neutral. Other studies ~35% better for LLMs.
- **Pipeline:** FinBERT/small model filters and routes → LLM extracts structured event JSON (type, company, direction, surprise, confidence).
- **Turkish:** no established Turkish financial sentiment model. Options: `savasy/bert-base-turkish-sentiment-cased`, `incidelen/bert-base-turkish-sentiment-analysis-cased`, hobby `turkish-finbert` (KAP → BIST); most practical: prompt LLM, or fine-tune BERTurk on KAP headlines labelled with next-day move.

## 4. Vector DB vs structured DB
**Vector DB:** 10-K/10-Q and KAP report chunks; analyst notes; trading rulebook/risk policy; **historical news–outcome pairs** (embed event summary, 1d/5d abnormal return as metadata).
**Structured DB (Postgres):** prices, trades, positions, P&L, macro series, events, sentiment scores. Always filter vector search by `published_at < decision_time`.

Papers:
- **FinMem:** three memory layers with different decay (news short, 10-Q mid, 10-K long) + reflection.
- **FinSrag/FinSeer:** retrieving similar historical price sequences beat no/random retrieval by up to 8% accuracy.

## 5. Backtesting without look-ahead bias
**Datasets:** FNSPID (15.7M news, 29.7M prices, 4,775 S&P 500 companies, 1999–2023; GitHub Zdong104/FNSPID_Financial_News_Dataset); Alpaca/Benzinga archive since 2015; EDGAR; for Turkey build own archive from KAP timestamps.

**Rules:**
1. Use publish timestamp; trade on next bar (next open if outside hours); account for 15-min BIST delay.
2. Point-in-time universes incl. delisted stocks (survivorship).
3. **LLM memorization = look-ahead leak.** GPT-4o recalls S&P 500 closes within 1% for in-training dates. Test only post-cutoff, or mask names/dates; point-in-time models (ChronoGPT, Time Machine GPT) as alternative.
4. Hide future outcome labels from RAG memory during replay.

## Sources
- Alpaca: https://docs.alpaca.markets/us/docs/historical-news-data · https://alpaca.markets/blog/introducing-news-api-for-real-time-fiancial-news/ · https://docs.alpaca.markets/us/docs/about-market-data-api
- Finnhub: https://finnhub.io/pricing · https://finnhub.io/docs/api/company-news
- Marketaux: https://www.marketaux.com/pricing
- Alpha Vantage: https://www.alphavantage.co/premium/
- Massive: https://massive.com/knowledge-base/article/what-is-the-request-limit-for-massives-restful-apis
- NewsAPI: https://apicostcalc.com/newsapi.html
- GDELT: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- SEC EDGAR: https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
- MKK API Portal: https://www.mkk.com.tr/haberler/mkk-api-portal-yayinda · https://apiportal.mkk.com.tr/
- KAP packages: https://pypi.org/project/kap_sdk/ · https://pypi.org/project/kap-client/
- TCMB EVDS: https://github.com/fatihmete/evds · https://urazakgul.github.io/python-blog/posts/post_9/
- isyatirimhisse: https://github.com/urazakgul/isyatirimhisse
- BIST delay: https://dxfeed.com/market-data/equities-etfs/borsa-istanbul-equities/
- Binance: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
- Turkish RSS list: https://github.com/bakinazik/rss
- Lopez-Lira & Tang: https://arxiv.org/abs/2304.07619
- LLMs vs FinBERT: https://arxiv.org/abs/2410.01987
- turkish-finbert: https://github.com/mehmet-karagoz/turkish-finbert
- Turkish sentiment: https://huggingface.co/savasy/bert-base-turkish-sentiment-cased
- FinMem: https://arxiv.org/abs/2311.13743 · https://github.com/pipiku915/FinMem-LLM-StockTrading
- FinSeer/FinSrag: https://arxiv.org/abs/2502.05878
- FNSPID: https://arxiv.org/abs/2402.06698
- Look-ahead bias: https://arxiv.org/html/2309.17322 · https://arxiv.org/html/2605.24564
