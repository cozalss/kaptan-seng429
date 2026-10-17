# Where does news-driven trading have documented, persistent edge?

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.

## Evidence review and strategy design for an LLM multi-agent news-trading system (SENG429)

*Prepared 29 Sep 2026. Scope: US anomalies, BIST/KAP event studies, crypto, and evidence specific to LLMs, followed by a concrete strategy design. All claims are cited. Where a source is a blog or industry note rather than peer-reviewed or preprint research, it is marked **[industry]**. Preprints are marked **[preprint]**.*

---

## 0. TL;DR

1. **Numeric, simple, widely watched news is priced within seconds to minutes. A system that decides in 15–60 s cannot trade it.** This covers earnings beats and misses, big-exchange crypto listings, ETF approvals, index changes and headline sentiment on large caps. Classic PEAD has been essentially dead for non-microcap US stocks since about 2006 (Martineau 2022; Subrahmanyam 2025). For the post-2016 period, Christensen–Timmermann–Veliyev (JFE 2025) find post-announcement trading returns consistent with efficient pricing.
2. **Persistent edge survives where information is qualitative, complex, low-attention, or in small and illiquid names.** Examples are earnings-call language (PEAD.txt; "Fast Numbers, Slow Language" 2026), insider transactions, dividend and buyback news, and the full text of disclosures rather than headlines (Lopez-Lira & Tang v6, 2025). Even there, the edge is thin. Lopez-Lira & Tang's GPT-4 headline strategy **turns unprofitable at 20 bps round-trip costs**, and its Sharpe ratio decayed from 6.54 (2021Q4) to 1.22 (Jan–May 2024) as LLM adoption rose.
3. **LLMs add value as classifiers and feature extractors, not as free decision-makers.** Free-deciding agents fail out of sample: FINSABER (KDD 2026), StockBench, Alpha Arena 1.5. Constrained designs, where the LLM proposes or extracts and a deterministic engine decides, are the ones that hold up out of sample (e.g., Huang et al. 2026, crypto factors).
4. **BIST/KAP is the best venue for a slow retail system, but only conditionally.** Turkish price adjustment to KAP disclosures is measurably **slower** than in developed markets, and event-driven profits were available (Ersan, Şimşir, Şimşek & Hasan, *Emerging Markets Review* 2021). There is little HFT, disclosures are long, Turkish and often in PDF (a real LLM advantage), commissions are near zero and equity capital gains carry 0% withholding. The costs are serious: pre-announcement leakage (Şimşir & Şimşek 2022), reversals after hyped events (bonus issues, earnings run-ups), price limits, manipulation risk in low-float names (the Sept 2026 fund/manipulation crisis) and in practice a long-only constraint.
5. **Recommended strategy: "LLM event classifier + evidence-based rule engine" on BIST, long-only, entering at the next open or the same session (not racing the first seconds), holding 5–40 trading days.** Trade four event families: (a) company buyback **executions**, (b) insider/controlling-shareholder **purchases**, (c) **material** new contracts, tenders and orders, filtered by contract-value/revenue, and (d) earnings where the LLM reads the full report (inflation-adjusted TMS 29 figures and qualitative text) rather than the headline. A fifth family, negative/regulatory events (SPK tedbir, VBTS, dilutive rights issues, bonus-issue hype), is used only as **exit/avoid filters**. Expected realistic edge: **0.5–2% abnormal return per trade, before costs, in the best buckets. That is low single-digit annual alpha at best, possibly zero.** You must replicate this on your own point-in-time KAP event database before any real money is used.

---

## 1. Evidence standard used

| Grade | Meaning |
|---|---|
| A | Peer-reviewed, large sample, recent (post-2010) data, costs discussed |
| B | Peer-reviewed but old data or small sample; or strong preprint with OOS design |
| C | Turkish event studies with small samples, old periods, or methodological weaknesses (daily data, event-day ambiguity, parametric tests, no costs) |
| D | Industry/blog data, anecdotes |

A general warning applies to everything below. **Published anomalies lose about 58% of their returns after publication** (McLean & Pontiff, *JF* 2016, 97 predictors; 26% lower out of sample, 58% lower post-publication). The decline is largest for anomalies concentrated in illiquid, high-idiosyncratic-risk stocks. Treat every in-sample number in this document as an upper bound.

---

## 2. United States: which information-event anomalies survive?

| Event | Classic evidence | Status in 2020s | Survives for slow retail? |
|---|---|---|---|
| **PEAD (numeric earnings surprise)** | Bernard & Thomas 1989; quarterly hedge returns of 5–6% in 1970s–80s, falling to about 2–3% in the 2010s (Fink 2021 review) | **Dead for non-microcaps since ~2006**: "stock prices fully reflect earnings surprises on the announcement date" (Martineau, *CFR* 2022). Subrahmanyam (2025, 2001–2024): drift t = 2.18 with all stocks, **t = 1.43 once microcaps (3% of market value) are removed** (UCLA Anderson Review). Christensen, Timmermann & Veliyev (*JFE* 2025): earnings almost always cause *jumps*; post-announcement strategy returns consistent with efficient pricing after 2016. | **No** (grade A) |
| **Text-based PEAD (earnings-call language)** | Meursault, Liang, Routledge & Scanlon, *JFQA* 2023: SUE.txt drift is *larger* than classic PEAD and "considerable even in recent years when the classic PEAD is close to zero" | Yu et al. 2026 [preprint], S&P 1500, OOS 2024–25: numeric surprise IC peaks at announcement and decays by next open. **Call-transcript LLM sentiment peaks on the next trading day** (IC 0.11, t = 4.04; Q5–Q1 153 bp; Sharpe 2.28 gross, long-short, next-open entry). Beyond one trading day, IC turns negative. Aggregated *news* sentiment was weak (Sharpe 0.42). | **Maybe**: 1-day horizon, needs timely transcripts and low costs (A/B) |
| **Management guidance** | Guidance generates about 200 bp drift to the next earnings date; the market under-weights guidance relative to earnings (*European Accounting Review* 2018) | Not recently re-tested at scale; guidance is now parsed by machines at release | Weak/untested (B) |
| **Analyst forecast revisions** | Post-revision drift is a well-documented anomaly (e.g., *Accounting & Finance* 2025) | Still reported. Chen, Kelly & Xiu find analyst-related news gives "the most profitable signals" among topics. Requires I/B/E/S-grade data. | Data-limited for a student (B) |
| **8-K event types** | Lerman & Livnat (*RAS* 2010): some items show drift up to 90 days | Dolphin et al. 2026 [preprint]: the most price-reactive events sit in catch-all **Item 8.01**; an LLM taxonomy with 119 event types reaches 93% precision at high confidence. No drift analysis for 2022–2026. | Classification value yes; drift unproven (B) |
| **Insider purchases (Form 4)** | Cohen, Malloy & Pomorski (2012): opportunistic buys earn about 82 bp/month | **Weakened.** Oenschläger & Möllenhoff (*FRL* 2025), post-SOX intraday: returns are "positive but lower," vanish with realistic trade sizes, and are concentrated in illiquid stocks. An industry study of 47,458 buys over 2020–2025 **[industry]**: +2.56% 1-year excess, but a placebo shift removes the timing effect, and the opportunistic/routine split does not replicate. Lopez-Lira & Tang: insider-transaction news *does* show significant 1–2 day drift (26 bp) and is the category where GPT-4 beats GPT-3.5 most. | Small, microcap-heavy; marginal after costs (A/B) |
| **Buyback announcements** | Ikenberry, Lakonishok & Vermaelen 1995; Peyer & Vermaelen 2009: about 3% announcement return plus a large long-run drift | **Fu & Huang (2016): long-run abnormal returns after repurchases and SEOs disappear for 2003–2012 events** | Short-term only (A) |
| **Index inclusion (S&P 500)** | 7.4% abnormal return in the 1990s | **<1% in the last decade**; deletions about 0.1% in 2010–2020 (Greenwood & Sammon, "The Disappearing Index Effect," NBER w30748) | **No** (A) |
| **Earnings-announcement premium** | Frazzini & Lamont 2007; Barber et al. 2013, 46 countries, >11%/yr | Reported to have disappeared in the US after the 2004 8-K reform (Heitz et al. 2020, as cited) | No in US; unknown in BIST |

**US conclusion.** A slow retail system has essentially no edge on *numeric* US news. The residual edge is in (i) qualitative text (earnings calls, complex disclosures), with a 1-day horizon, and (ii) small and illiquid names where costs eat most of it. US data access is excellent (free EDGAR, real-time 8-K and Form 4), so the US is a good **control/benchmark track**. It is a poor primary alpha venue for this project.

---

## 3. BIST / KAP: what Turkish event studies say

### 3.1 Market-structure facts that matter

- **Speed of adjustment in Turkey is slower than in developed markets.** Ersan, Şimşir, Şimşek & Hasan (*Emerging Markets Review* 47, 2021) exploit the rule that all firms must disclose on KAP/PDP first. They find "market reaction times to corporate announcements are slower than documented in recent studies," positive news is absorbed faster than negative news, and there are **"sizable profit opportunities for investors following event-driven strategies."** HFT activity *slows* adjustment. (Grade A; exact minute-level numbers are behind a paywall.)
- **Leakage before disclosure.** Şimşir & Şimşek (*JIFMIM* 80, 2022) use e-signature timestamps from 2009–2017. They find abnormal trading **immediately after firms privately upload disclosures to KAP servers, before public release**, strongest for announcements that later get a positive reaction. Your system will often be second in line. (Grade A)
- **Pre-event run-ups appear in several Turkish studies:** operational and restructuring news (Eyüboğlu & Bulut 2016), financial statements (Bozkurt et al. 2015) and buybacks in high-P/B and small firms (Karakuş et al. 2017).
- **Price limits (±10% daily) delay price discovery.** Bildik & Gülay (*J. Financial Research* 2006, 1998–2002) found more **continuations than reversals** after limit hits. Aktaş, Kryzanowski & Zhang (*IJIMEFM* 2022, 1-second BIST-50 data) support magnet and delayed-price-discovery effects. A stock locked at *tavan* on news day 0 mechanically pushes part of the adjustment to day +1. This is one of the few structural sources of drift that does not rely on investor irrationality.
- **Volume-shock asymmetry.** Özdemir (*İşletme Araştırmaları Dergisi*) studied 3,233 abnormal-volume events in BIST-100, 2017–2025. Negative shocks show **continuation (negative CAR t+1..t+10)**. Excess returns concentrate **overnight (+1.23%) vs intraday (−0.29%)**. Buying the open after good news tends to be worse than buying before.
- **Costs and taxes (retail, 2026).** Zero- or near-zero-commission brokers exist (Midas, Enpara; about 0.01% plus 5% BSMV on some platforms) ([hisse.net 2026](https://www.hisse.net/haber/bankalarin-borsa-istanbul-da-bakim-ve-komisyon-ucretleri-2026-48274); [Midas fees](https://www.getmidas.com/ucretler/)). **BIST equity capital gains carry 0% withholding** under GVK Geçici 67 ([PwC 2026](https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html)). **The binding cost is the bid-ask spread and impact in small caps, not commission.** Short-selling is restricted in practice for retail, so plan for a long-only book.
- **Regime risk: the September 2026 crisis.** SPK capped fund holdings relative to real free float on 28 Aug 2026. About 210 bn TL left funds by 16 Sep. Pusula Portföy declared it could not meet redemptions. BIST-100 fell more than 7.5% intraday on 16 Sep (closing −5.54%, circuit breaker triggered). SPK liquidated 130 funds and filed criminal complaints against 38 people over manipulation in low-float stocks ([Kısa Dalga](https://kisadalga.net/haber/gundem/fonlardan-borsaya-yayilan-krizi-anlama-kilavuzu-satis-dalgasi-nasil-basladi-spk-neden-130-fon-icin-tasfiye-karari-aldi-140429)). **Low-float small caps, where Turkish event studies find the biggest reactions, are also where manipulation lives.** Any BIST strategy needs a free-float and liquidity floor.

### 3.2 Event-type evidence (Turkish literature)

| KAP event | Study | Result | Drift after day 0? | Verdict |
|---|---|---|---|---|
| **Firm-specific news, 5 classes** (BIST-30, 2003–2012, 2,143 news items) | Eyüboğlu & Bulut, *UİİİD-IJEAS* 16:113–138 (2016) | Investors react most to **operational**, then restructuring and financial news. Operational: AAR day 0 = **+5.0%** (t = 3.47). ACAR(0,+5) = 5.1%, ACAR(0,+10) = 9.1%. Days +1..+10 sum to about +4% but are individually insignificant except +10. Restructuring: pre-event ACAR(−10,0) = 5.8%, which indicates leakage. | Some, noisy | Candidate (C) |
| **Buyback programme announcements** (100 notices, 2014–2016) | Karakuş, Zor & Yılmaz Küçük, *Muhasebe ve Finansman Dergisi* (2017) | Day 0 about **+2%**. CAR(−1,+1) about 3%. Low-P/B firms: day 0 +2.5%, day +1 +0.5% (ns), days +2..+10 ≈ 0. Large firms: shorter, smaller effect. Small firms: about +1% on days −2 and −1 (leakage). | **Little**: mostly day 0/+1 | Announcement alone is not tradable slowly (C) |
| **Buyback decisions** (95 firms, 2022–2023) | Küçükçolak, Küçükoğlu & İlter Küçükçolak, *EPFAD* (2025) | Significant positive effect; **strongest in 10- and 21-day windows**. Returns correlate with BIST-100, so part may be market beta. | Possibly | Candidate (C) |
| **Insider trades incl. buyback executions** (BIST-100, 2015–2020, 2,131 KAP notices) | Ünal, *Akademik Araştırmalar ve Çalışmalar Dergisi* 14(26) (2022) | Excess over BIST-100 from **trade date**: company **buyback executions** (n = 711) +0.9% at 1 week, +2.0% at 1 month, +3.4% at 3 months. **Managers' purchases** (n = 89) +1.1% / +1.5% / +4.4%. "Investor" purchases (n = 221) +2.1% / **+7.7%** / 22.5%. Controlling-shareholder buys +0.4% / 1.7% / 1.0%. Foreign funds show no significant effect. Insiders mainly *time the market* (they buy after falls). | **Yes**, gradual over 1–3 months | **Best BIST candidate** (C, needs replication with disclosure date) |
| **Insider trades** (2007–2008) | Tahaoğlu & Güner (2011), cited in Ünal | Insiders beat the market on buys and sells; sell signals persist longer | Yes | Supportive (C) |
| **Annual financial statements** (167 firms, 2012) | Bozkurt, Öksüz & Karakuş, *Maliye Finans Yazıları* 103 (2015) | Top ROI-improvement portfolio: about **+1.5%/day for 5 days before** release, CAR(−5,0) = 7.5%, then **−0.8% on days +1..+2**, CAR(0,+2) = −1.5%. **Run-up then reversal**, the opposite of PEAD. | **Reversal** | Do not chase earnings beats; test "fade" or text-based variants only (C) |
| **Bonus issues (bedelsiz)**, SPK approval (2016–2017) | Erol & Aytekin, *MAKÜ İİBF Dergisi* (2018) | Positive CAR on day +1, then **significantly negative CAR on days +2, +3 and +5** | **Reversal** | **Avoid / exit signal** (C) |
| **Bonus issues** (2012–2014) | *Sosyal Bilimler Araştırmaları Dergisi* (2018) | No positive AAR after announcement; **negative AAR on day +4** | Reversal | Avoid (C) |
| **Capital increases** (Star Market) | Kaderli & Başkaya, *Aydın İktisat Fak. Dergisi* 2(1) | Prices react; ARs keep rising within 5–10 days (small sample) | Some | Weak (C) |
| **Index inclusion/exclusion** (BIST-30/50/100/Dividend) | Epöz Aydıner & Altay, *Ankara Üni. SBF Dergisi* 75(4) (2020) | Inclusion positive, exclusion negative; price-pressure hypothesis | Pressure, then likely reversal; changes are rule-based and anticipated | Not a news edge (C) |
| **Turkish event-study methodology** | Başdaş & Oran, *Borsa Istanbul Review* 14(3) (2014), review of 75 studies | Most use market-adjusted returns and parametric tests without model discussion; clustering risk | — | Methodological caution |

**Key BIST takeaways**

1. **Most measurable reaction happens on day 0, and often before it (leakage).** A slow system cannot capture the day-0 jump reliably, especially for after-hours disclosures that gap at the next opening auction.
2. **Hype events reverse:** bonus issues (bedelsiz) and good earnings run up before the announcement and reverse after it. These are *anti-signals* for a buyer.
3. **Gradual drift is documented for signals from "who is buying":** company buyback **executions** and insider/major-investor **purchases**. Over 1–3 months this is the form of evidence most compatible with a daily-decision system.
4. **Operational news (new contracts, orders)** shows large day-0 reactions with some continuation. The LLM's job here is **materiality** (contract value vs revenue, binding contract vs MoU, related-party or not), which headline readers and most retail do poorly.
5. **The Turkish literature is thin.** Samples are small, periods old (mostly pre-2020), and designs daily with event-day ambiguity. Almost nothing covers 2021–2026, the high-inflation, retail-mania, TMS 29 regime. **You need to run your own event studies.** That is itself a strong, publishable SENG429 deliverable.

---

## 4. Crypto news: listings, hacks, ETFs

| Event | Evidence | Speed / drift | Verdict |
|---|---|---|---|
| **Exchange listings** | Blockchain Research Lab WP (2019): event-day CAAR 5.7% (max 14.7%). **Most abnormal return builds *before* the event; afterwards returns are negative.** The Tie [industry], 1,844 listings 2025–26: price **peaks before listing day** and BTC-adjusted gains mean-revert within ~2 weeks. Listing premium "compressed significantly since 2023." "The durable benefit of a major exchange listing is volume, not price." | Seconds (bots watch the announcement API); front-running suspected | **No** for a 15–60 s system |
| **Upbit/Bithumb (Korea) listings** | Large pumps still occur in 2025 (DataMaxi+ [industry]: maximum expected returns 51.9% / 108.9%) | Pump happens in the first seconds to minutes; a slow system becomes exit liquidity | No |
| **Spot BTC/ETH ETF approvals** | *Borsa Istanbul Review* (2025) intraday event study; FRL 2024: **muted reaction at approval** because the approval was expected after the Oct 2023 court ruling | Priced in advance | No |
| **Hacks and exploits** | *Economics Letters* 2025 (1,449 events, 38 coins, 2022–2024): negative events dominate; security shocks cause sharp short-term drops, worse for small caps | Minutes. Long-only systems can only *avoid*. | Exit/avoid filter only |
| **Macro news** | ~10-minute absorption; small caps react to BTC shocks within about 1 minute | Minutes | No |

Constrained-LLM crypto factor research does survive OOS (Huang et al. 2026 [preprint]: 44.55% annualized, Sharpe 1.55 net of 5 bp, 2024–25). The alpha is in **small, illiquid tokens** and disappears when cap-weighted, so it is a capacity-limited *factor* strategy, not a news strategy. Turkish crypto tax: the March 2026 bill (0.03% transaction tax plus 10% withholding) was withdrawn, so the regime is declaration-based. Regulation remains uncertain.

**Crypto conclusion:** news in crypto is a speed game against bots and insiders. A 15–60 s LLM pipeline is structurally last. Do not choose crypto for news trading.

---

## 5. What LLMs themselves demonstrably add

### 5.1 LLM as reader/classifier: evidence of value

- **Lopez-Lira & Tang, "Can ChatGPT Forecast Stock Price Movements?"** (arXiv 2304.07619 v6, Oct 2025). US data from Oct 2021 to May 2024, 4,123 stocks, post-cutoff headlines.
  - GPT-4 gets about **90% hit rate on the *non-tradable* initial reaction**. The drift lasts **1–2 trading days**. The long-short gets **34 bp/day before costs** (Sharpe 2.97).
  - Drift is stronger for **small stocks** (interaction t = 4.75) and **negative news**, which you cannot short in BIST.
  - **Costs:** still profitable at 5–10 bp round-trip; **"A transaction cost of 20 bps round-trip makes the strategy unprofitable."**
  - **Decay:** Sharpe **6.54 (2021Q4) → 3.68 (2022) → 2.33 (2023) → 1.22 (Jan–May 2024)**, consistent with LLM adoption.
  - **Topic heterogeneity, the key result for event selection:**
    - *Earnings reports, strategic partnerships and clinical trials* are **priced efficiently**; drift is insignificant (−4.7, +4.3, −11.4 bp).
    - *Insider transactions, dividend announcements and healthcare conferences* show **significant drift** (26.3, 22.3, 34.2 bp).
  - Entering 15 minutes after an intraday headline and holding to the next day's close gives about 30 bp.
- **Chen, Kelly & Xiu, "Expected Returns and Large Language Models"** (SSRN 4416687). LLM embeddings of full news beat technical signals and bag-of-words. Results are robust across **16 markets and 13 languages**. Prices respond slowly to news. **Analyst-related news** gives the strongest signals, and AI-generated summaries help.
- **Kirtac (arXiv 2609.23703, Sep 2026)** [preprint]. Fine-tuned decoder LLMs (LLaMA-3) beat FinBERT and dictionaries on OOS data from Jun 2024 to Jan 2026. The long-short Sharpe is 2.85 net of **5 bp**, value-weighted, with a 10% ADV cap. Gains concentrate in **linguistically complex articles** and less liquid stocks. The dictionary strategy loses money.
- **Yu et al., "Fast Numbers, Slow Language"** (arXiv 2606.29734, 2026) [preprint]. Numeric surprises are priced within minutes. The LLM's reading of call *language* is tradable the next day. Aggregated *news* sentiment is weak.
- **Lehner & Lopez-Lira, "ChatGPT as a Time Capsule"** (arXiv 2604.21433, 2026) [preprint]. A frozen-checkpoint LLM "outlook score" predicts **one-month** returns (+1.22%/month per SD, t = 4.25) and later revenue growth. Predictive power *rises* with horizon. This is useful for slow systems: the LLM aggregates dispersed qualitative information that prices absorb gradually.
- **Dolphin et al. (arXiv 2607.08346, 2026)** [preprint]. LLM event extraction from 8-Ks with a 119-type taxonomy reaches **93% precision at high confidence (55% of corpus)**. Two-stage scoring is essential for calibration. This is a direct template for a KAP event classifier.

### 5.2 LLM as free decision-maker: evidence of failure

- **FINSABER** (Li et al., KDD 2026, arXiv 2505.07078) covers 20 years and 100+ symbols. Previously reported LLM advantages "deteriorate significantly." The LLMs are **too conservative in bull markets and too aggressive in bear markets**.
- **StockBench** (arXiv 2510.02209): LLM agents "rarely outperform simple baselines." Static financial knowledge does not translate into trading skill.
- **Alpha Arena Season 1.5** (nof1.ai, US equities, Nov–Dec 2025): most model accounts lost money. Claude Sonnet 4.5 −32%, Gemini-3-Pro −24%, GPT-5.1 −1.4%. Only a few accounts were profitable ([ForkLog](https://forklog.com/en/ai-model-grok-4-2-triumphs-in-trading-tournament/)).

### 5.3 Validity traps specific to LLM backtests

- **Look-ahead bias and memorisation.** Only test on data after the model's knowledge cutoff (Sarkar & Vafa 2024; Lopez-Lira, Tang & Zhu 2025; Look-Ahead-Bench arXiv 2601.13770).
- **Distraction effect.** Glasserman & Lin (arXiv 2309.17322) show that company names distort LLM sentiment, especially for large firms. In-sample, **anonymized headlines outperformed**. Anonymize firm identity in the classification prompt and pass fundamentals as structured data.
- **Adoption decay.** Assume any LLM-extractable signal decays. Lopez-Lira & Tang's Sharpe roughly halved each year.

---

## 6. Synthesis: where is the edge for a slow system?

Edge ≈ (information complexity × low attention × limits to arbitrage) − (speed competition + leakage + costs).

| Venue | Speed competition | Leakage | Costs for retail | LLM advantage (complex text) | Drift evidence | Overall for 15–60 s, daily |
|---|---|---|---|---|---|---|
| **US large/mid** | Extreme (ms) | Low | Very low | Low: many LLM users already | Mostly gone; text signals 1 day | Weak (control track) |
| **US small/micro** | High | Medium | Spread-heavy | Medium | Present but cost-eaten | Weak |
| **Crypto** | Extreme (bots, API) | **High** (front-running) | Low fees, high slippage in alts | Low | Reversal after listings | **No** |
| **BIST via KAP** | **Low–medium** (slower adjustment, little HFT) | **High** (pre-upload trading) | Near-zero commission, 0% stopaj, spread in small caps | **High**: Turkish, long PDFs, TMS 29 inflation accounting, few LLM competitors | Gradual for buyback executions and insider buys; day-0 for contracts; reversal for hype | **Best, conditionally** |

**Recommendation: BIST via KAP as the primary (paper, then small real money) market, with a US/EDGAR paper track as a methodological control.** Crypto should be excluded from news trading.

---

## 7. Concrete strategy: "LLM event classifier + evidence-based rule engine" (BIST)

### 7.1 Architecture (LangGraph)

```
KAP poller (every 15–30 s; web listing, or the official KAP Veri Yayın Servisi REST
if you get a data contract via Borsa İstanbul)
   │
   ▼
[1] Parser/Normaliser (deterministic): form type, company code, timestamp, attachments → text
   │
   ▼
[2] Classifier agent (LLM, structured JSON output, firm name anonymised)
     → event_type (taxonomy below), direction, numbers (amount, currency, share count,
       price range), binding? (contract vs MoU/niyet mektubu), related-party?, is_correction?,
       novelty (first vs repeat), confidence (two-stage re-scoring as in Dolphin et al.)
   │
   ▼
[3] Materiality agent (LLM + tools): pulls last 4Q financials (KAP XBRL), computes
     contract_value / trailing revenue, buyback_amount / market cap, insider buy / insider's
     prior holding, TMS 29-adjusted operating profit change
   │
   ▼
[4] Precedent RAG agent: retrieves the K most similar past events (same firm, same type,
     same sector) from YOUR event-study DB, with realised CAR(+1,+5/+20) → base rate + dispersion
   │
   ▼
[5] Skeptic agent (red team): lists reasons it is a false positive — duplicate/correction,
     boilerplate, related-party contract, non-binding, price already moved > X% in the prior
     5 days (leakage), low free float/VBTS/SPK tedbir, rights-issue dilution, hype pattern
   │
   ▼
[6] RULE ENGINE (pure Python, no LLM): applies pre-registered rules from §7.3 to the
     structured features → TRADE / NO-TRADE, size
   │
   ▼
[7] Risk manager (deterministic): exposure, sector, liquidity caps, regime filter, kill-switch
   │
   ▼
Paper broker / real broker API; full audit log (every agent output stored)
```

**The LLM never decides "buy/sell".** It outputs features and confidence. Debate is used only to *veto* (steps 4–5), and its value is measured by ablation (see §7.6).

### 7.2 Event taxonomy (KAP → classes)

| Class | KAP sources | Role |
|---|---|---|
| E1 Buyback execution | "Geri Alınan Paylara İlişkin Bildirim," pay geri alım programı işlemleri | **Long signal** |
| E2 Insider / major-holder purchase | "Pay Alım Satım Bildirimi" (yönetici, YK üyesi, hâkim ortak, ≥5% holders) | **Long signal** |
| E3 Material new business | "Yeni İş İlişkisi," "Özel Durum Açıklaması (Genel)" for ihale kazanımı, sipariş, sözleşme | **Long signal** (materiality-gated) |
| E4 Earnings (full report) | "Finansal Rapor," "Faaliyet Raporu," investor presentation | **Long signal**, text-based only |
| N1 Regulatory/negative | SPK bülteni tedbir/işlem yasağı, VBTS measures, trading halts, auditor qualified opinion, bedelli/tahsisli dilution, bedelsiz hype | **Avoid/exit filter only** |

### 7.3 Pre-registered rules (starting hypotheses; recalibrate on your own event study)

**Universe filter, applied always.** Include only stocks meeting all of these:
- 20-day average traded value ≥ 50 m TL.
- Actual free float ≥ 25%.
- Not under VBTS or any SPK/BIST tedbir.
- Not in the watch-list (izleme) market.
- Position ≤ 1% of 20-day ADV.

These filters directly respond to the Sep 2026 manipulation crisis.

**Leakage filter, applied always.** If the stock is up > 8% over the 5 sessions before the disclosure (market-adjusted), the signal is **downgraded**: half size for E1/E2, skip for E3/E4. This is based on the Şimşir & Şimşek pre-upload trading evidence and the run-up/reversal pattern in Bozkurt et al.

**E1 Buyback execution (strongest evidence of gradual drift: Ünal 2022).**
- **Entry:** at the next session's opening auction or a limit order within the session. Require **cumulative executions over the last 10 sessions of ≥ 0.25% of shares outstanding**, or ≥ 3 separate execution notices. Clustered buying is a stronger signal than a single token execution.
- **Exit:** time stop at **20 trading days**, extendable to 40 if executions continue. Exit early if the company announces a sale of repurchased shares ("alınan payların satılması"), which reverses the signal.
- **Expected edge (to verify):** +1–3% market-adjusted over 1 month, gross. Weak from a single study with trade-date timing.

**E2 Insider / controlling-shareholder purchase.**
- **Entry:** the next open after disclosure, if the buyer is a manager/board member or a controlling shareholder, the purchase is ≥ 1 m TL or ≥ 0.1% of float, and it is an **open-market purchase**. Exclude transfers, inheritance, exercise/allotment, block deals between group companies and pledge-related trades; the LLM reads the free-text field.
- **Boost:** multiple insiders within 30 days (a cluster), or a purchase after a ≥ 15% 3-month decline. Insiders time dips, per Ünal.
- **Exit:** 20 trading days; 60 if a cluster.
- **Expected edge:** managers +1.5% at 1 month and +4.4% at 3 months vs BIST-100 historically. US evidence shows the post-2020 decay is significant.

**E3 Material new business / tender / order.**
- **Gate:**
  - contract_value / trailing-12-month revenue ≥ 10%, *or* ≥ 5% if margin-accretive;
  - the contract is binding (not MoU / niyet mektubu);
  - it is not with a related party or group company;
  - it is not a renewal of an existing contract;
  - precedent RAG shows a positive median CAR(+1,+5) for this firm/type, where there are ≥ 5 precedents.
- **Entry:** during the session if the price has moved < +4% since the disclosure timestamp; otherwise at the next open, *only if* day 0 closed **locked at the upper limit** (delayed price discovery, Bildik & Gülay) or the gap is < +4%.
- **Exit:** **5 trading days** (time stop), or a hard stop at −6%.
- **Expected edge:** highly uncertain. Operational news continued about 4% after day 0 in BIST-30 over 2003–2012; in the US, partnership news is priced instantly. **This needs your own replication most.**

**E4 Earnings, text-based (not headline beat).**
- Features from the LLM:
  - change in TMS 29 inflation-adjusted operating profit and net cash from operations;
  - tone and guidance statements in the faaliyet raporu / investor presentation;
  - one-off items (monetary gain/loss, revaluation) separated out.
- **Entry:** the next open, only if the *quality-adjusted* surprise is positive **and** the stock did not run up > 8% in the prior 10 sessions. Bozkurt et al. show headline-good earnings reverse after release.
- **Exit:** 5–10 trading days.
- **Rationale:** in the US, qualitative language is priced a day late (Yu et al. 2026; PEAD.txt). In BIST, inflation accounting makes the headline *net profit* misleading. That is exactly the "complex information" where LLM advantage and underreaction coincide. This is a hypothesis, not established evidence.

**N1 Avoid/exit filters (never trade long into these; exit if held).**
- SPK tedbir or işlem yasağı on the stock or its insiders.
- VBTS measures.
- Bedelsiz approval hype: day +2..+5 reversal (Erol & Aytekin 2018).
- Bedelli/tahsisli dilution.
- Qualified audit opinion.
- The stock entering the watch-list market.

### 7.4 Position sizing and portfolio rules

- **Risk budget:**
  - 0.5% of equity at risk per trade (distance to hard stop × shares);
  - max position 10% of equity;
  - max 8–10 concurrent positions;
  - max 25% in one sector (holding companies count separately).
- **Size scaling:** base size × evidence weight (E1/E2 = 1.0, E4 = 0.7, E3 = 0.5 until replicated) × classifier confidence (≥ 0.8 required) × leakage multiplier (0.5 if flagged).
- **Regime filter:** if BIST-100 is below its 50-day moving average *and* 20-day realised volatility is above the 80th percentile (e.g., the Sep 2026 crash), halve gross exposure and take no new E3 trades.
- **Benchmark:** BIST-100 total return (buy-and-hold XU100 ETF), measured in TL **and** in USD. Required because of the FINSABER/StockBench lesson: beating cash is not the bar.
- **Cost model in backtests:** commission 0.02% plus 5% BSMV, plus half-spread from the actual order book. Stress test at 30 bp round-trip in small caps. Lopez-Lira & Tang died at 20 bp.

### 7.5 Realistic expectations

| Item | Estimate |
|---|---|
| Trades/year | ~40–100 (E1/E2 dominate) |
| Gross abnormal return per trade (best buckets) | +0.5% to +2% |
| Round-trip cost (liquid mid-caps) | 0.1–0.3% |
| Hit rate | 52–58% |
| Portfolio alpha vs BIST-100 | **0 to +5%/yr**, with a wide confidence interval; could be negative after decay |
| Probability the paper phase shows significant alpha within 6 months | Low: sample sizes are too small for significance. Judge on process metrics plus the sign of alpha. |

Be honest in the project report. The deliverable is a **rigorous, auditable event-driven system with measured edge**, not a money machine.

### 7.6 How the multi-agent + RAG design earns its keep, and how to prove it

1. **Reading the full disclosure** (PDF attachments, Turkish legalese, amounts in foreign currency, binding vs non-binding). This is where headline sentiment fails (Kirtac 2026: gains in "linguistically complex" text; Chen–Kelly–Xiu: context matters).
2. **Materiality computation.** Contract value / revenue and buyback size / market cap need tool calls and the firm's financials. This is the biggest false-positive killer for "yeni iş ilişkisi," a very frequent KAP category.
3. **Precedent retrieval (RAG over your own event DB).** It turns each event into a base rate ("this firm's last 7 contract announcements: median CAR(+1,+5) = −0.4%") and replaces LLM intuition with evidence.
4. **Skeptic veto.** Detects corrections, duplicates, related-party deals, leakage and manipulation markers.
5. **Ablation protocol (report this in SENG429).** Compare on the same paper-trading period:
   - (a) rules on KAP form type only (no LLM);
   - (b) plus the classifier;
   - (c) plus materiality;
   - (d) plus RAG;
   - (e) plus skeptic debate.

   Metrics: precision of "tradable event" labels vs a hand-labelled set, CAR of accepted vs rejected events, net P&L, and LLM cost per event. If (e) is no better than (c), drop the debate.

### 7.7 Validation plan before real money

1. **Build a point-in-time KAP event database for 2018–2026**: disclosure timestamp to the second, form type, text, attachments, and daily plus (if possible) intraday prices. Check KAP terms of use. Commercial real-time access goes through the Borsa İstanbul data contract for KAP Veri Yayın Servisi.
2. **Run your own event studies** per class. Use a market model on BIST-100, BMP/Corrado tests and firm-clustered errors. Start the implementable windows at the **first executable price after the timestamp**, not day 0 close-to-close.
3. **Split the data:** design on 2018–2022, validate on 2023–2024, **holdout 2025–Sep 2026** (touched once). For LLM features, use only data after the model's knowledge cutoff for any claimed OOS result, or anonymise.
4. **Pre-register rules** (§7.3) before looking at the holdout.
5. **Paper trade** for ≥ 3 months and ≥ 50 closed trades, with live KAP polling and realistic fills.
6. **Real money only if** holdout CAR is positive after costs for that class (t ≥ 2), paper-trading alpha is non-negative, and the maximum drawdown is within limits. Start with a small, capped amount you can afford to lose.
7. **Kill switch:** stop a class if a rolling 30-trade net alpha is < 0 and t < −1, or if drawdown exceeds 15%.

---

## 8. What to explicitly NOT build

- A free-form "the LLM reads news and decides to buy/sell" agent. FINSABER, StockBench and Alpha Arena all show this fails.
- Headline-sentiment racing on US large caps (drift is gone at > 20 bp costs, and it is decaying).
- Crypto listing/ETF/hack news trading (bots and front-running; price peaks before the event).
- Chasing BIST bedelsiz announcements or "beat" earnings headlines (documented reversals).
- Low-float BIST small caps without free-float and liquidity filters (the Sep 2026 manipulation crisis).

---

## 9. References

### US anomalies and market efficiency
- Martineau, C. (2022). Rest in Peace Post-Earnings Announcement Drift. *Critical Finance Review* 11(3–4), 613–646. https://www.nowpublishers.com/article/Details/CFR-0122 ; SSRN https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3111607
- Subrahmanyam, A. (2025). Keeping it Simple: How Can Post-Earnings Return Drift Exist and Not Exist Simultaneously? Summary: https://anderson-review.ucla.edu/is-post-earnings-announcement-drift-a-thing-again/
- Fink, J. (2021). A review of the Post-Earnings-Announcement Drift. *J. Behavioral and Experimental Finance*. https://www.sciencedirect.com/science/article/pii/S2214635020303750
- Christensen, K., Timmermann, A., Veliyev, B. (2025). Warp speed price moves: Jumps after earnings announcements. *JFE* 167. https://arxiv.org/abs/2601.08962
- Meursault, V., Liang, P.J., Routledge, B., Scanlon, M. (2023). PEAD.txt: Post-Earnings-Announcement Drift Using Text. *JFQA* 58(6). https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3778798
- McLean, R.D., Pontiff, J. (2016). Does Academic Research Destroy Stock Return Predictability? *JF*. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2156623
- Greenwood, R., Sammon, M. (2022/2025). The Disappearing Index Effect. NBER w30748. https://www.nber.org/system/files/working_papers/w30748/w30748.pdf
- Fu, F., Huang, S. (2016). The Persistence of Long-Run Abnormal Returns Following Stock Repurchases and Offerings. *Management Science*. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1936187
- Ikenberry, Lakonishok, Vermaelen (1995). Market Underreaction to Open Market Share Repurchases. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=226564
- Cohen, L., Malloy, C., Pomorski, L. (2012). Decoding Inside Information. *JF*. NBER WP https://www.nber.org/system/files/working_papers/w16454/w16454.pdf
- Oenschläger, E., Möllenhoff, S. (2025). Insider filings as trading signals — Does it pay to be fast? *Finance Research Letters* 72, 106514. https://ideas.repec.org/a/eee/finlet/v72y2025ics1544612324015435.html
- Equibles [industry]. What Happens After an Insider Buys? Evidence from 47,458 purchases (2020–2025). https://equibles.com/research/what-happens-after-an-insider-buys-evidence-from-47-458-open-market-purchases
- Zhao, H. (2026) [preprint]. Insider Purchases Far Below the 52-Week High (microcaps). https://arxiv.org/pdf/2602.06198
- Lerman, A., Livnat, J. (2010). The new Form 8-K disclosures. *Review of Accounting Studies*. https://link.springer.com/article/10.1007/s11142-009-9114-7
- Dolphin, R. et al. (2026) [preprint]. Grounded Event Extraction from SEC 8-K Filings with a Fine-Grained Taxonomy. https://arxiv.org/html/2607.08346v1
- The Information Content of Guidance and Earnings (2018). *European Accounting Review* 27(1). https://www.tandfonline.com/doi/abs/10.1080/09638180.2016.1231074
- Analysts' cash flow forecasts and the underreaction to earnings forecast revisions (2025). *Accounting & Finance*. https://www.tandfonline.com/doi/full/10.1080/00014788.2025.2545847
- Frazzini, A., Lamont, O. (2007). The Earnings Announcement Premium and Trading Volume. https://www.nber.org/papers/w13090
- Barber, B., De George, E., Lehavy, R., Trueman, B. (2013). The earnings announcement premium around the globe. *JFE* 108. https://webuser.bus.umich.edu/rlehavy/BDLT.pdf

### BIST / KAP
- Ersan, O., Şimşir, Ş.A., Şimşek, K.D., Hasan, A. (2021). The speed of stock price adjustment to corporate announcements: Insights from Turkey. *Emerging Markets Review* 47, 100778. https://ideas.repec.org/a/eee/ememar/v47y2021ics1566014120305872.html
- Şimşir, Ş.A., Şimşek, K.D. (2022). The market impact of private information before corporate announcements: Evidence from Turkey. *JIFMIM* 80, 101624. https://research.sabanciuniv.edu/id/eprint/44293/
- Eyüboğlu, K., Bulut, H.İ. (2016). Şirketlere Özgü Haberlerin Hisse Performansına Etkisi: BİST-30 Şirketleri Örneği. *UİİİD-IJEAS* 16, 113–138. https://dergipark.org.tr/tr/download/article-file/202106
- Ünal, S. (2022). Borsa İstanbul'da İçeriden Öğrenenlerin Getirileri. *Akademik Araştırmalar ve Çalışmalar Dergisi* 14(26), 158–172. https://doi.org/10.20990/kilisiibfakademik.972633 ; https://dergipark.org.tr/tr/download/article-file/1885235
- Karakuş, R., Zor, İ., Yılmaz Küçük, Ş. (2017). Pay Geri Alım İlanlarının Hisse Getirisine Etkisi. *Muhasebe ve Finansman Dergisi*. https://dergipark.org.tr/tr/download/article-file/431654
- Küçükçolak, R.A., Küçükoğlu, S., İlter Küçükçolak, N. (2025). Borsa İstanbul'da Hisse Geri Alım Kararlarına İlişkin Ampirik Bir Analiz. *EPFAD*. https://dergipark.org.tr/tr/pub/epfad/article/1621302
- Bozkurt, İ., Öksüz, S., Karakuş, R. (2015). Finansal Tablo İlanlarının Hisse Getirileri Üzerindeki Etkisi: BİST'de Ampirik Bir Uygulama. *Maliye Finans Yazıları* 103, 113–140. https://dergipark.org.tr/tr/download/article-file/296222
- Erol, A.F., Aytekin, S. (2018). BIST Pay Piyasası Şirketlerinin Bedelsiz Sermaye Artırımı Duyurularının Hisse Senedi Getirileri Üzerindeki Etkisinin Değerlendirilmesi. *MAKÜ İİBF Dergisi*. DOI 10.30798/makuiibf.439219. https://dergipark.org.tr/tr/download/article-file/607742
- Bedelsiz Sermaye Artırımı Duyurularının Şirketlerin Piyasa Değerlerine Etkisi: Borsa İstanbul Örneği (2018). https://dergipark.org.tr/en/pub/sobbiad/issue/36421/412528
- Kaderli, Y., Başkaya, H. Halka Açık Firmalarda Sermaye Arttırımı Duyurularının Hisse Senedi Üzerindeki Etkisinin Ölçülmesi. *Aydın İktisat Fak. Dergisi* 2(1). https://dergipark.org.tr/tr/download/article-file/390163
- Epöz Aydıner, H., Altay, E. (2020). Endeks Etkisi: Getiri Oranlarının Endeks Değişimlerine Olan Reaksiyonunun Borsa İstanbul'da Analizi. *Ankara Üni. SBF Dergisi* 75(4). https://dergipark.org.tr/en/download/article-file/726904
- Başdaş, Ü., Oran, A. (2014). Event studies in Turkey. *Borsa Istanbul Review* 14(3), 167–188. https://www.sciencedirect.com/science/article/pii/S2214845014000271
- Bildik, R., Gülay, G. (2006). Are price limits effective? Evidence from the Istanbul Stock Exchange. *J. Financial Research* 29, 383–403. https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1475-6803.2006.00185.x
- Aktaş, O.U., Kryzanowski, L., Zhang, J. (2022). Price-limit effectiveness: evidence from the Borsa Istanbul. *IJIMEFM* 15(3). https://www.emerald.com/insight/content/doi/10.1108/IMEFM-04-2020-0151/full/html
- Özdemir, K. Borsa İstanbul'da Olağan Dışı İşlem Hacmi Artışları Sonrasında Kısa Vadeli Fiyat Davranışı. *İşletme Araştırmaları Dergisi*. https://www.isarder.org/index.php/isarder/article/view/2695
- KAP Veri Yayın Servisi (REST API, requires a data contract with Borsa İstanbul). https://kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873
- September 2026 fund/manipulation crisis: https://kisadalga.net/haber/gundem/fonlardan-borsaya-yayilan-krizi-anlama-kilavuzu-satis-dalgasi-nasil-basladi-spk-neden-130-fon-icin-tasfiye-karari-aldi-140429 ; SPK işlem yasakları: https://idariyaptirimlar.spk.gov.tr/IslemYasaklari
- Taxes/costs: PwC GVK Geçici 67 (2026) https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html ; commission survey https://www.hisse.net/haber/bankalarin-borsa-istanbul-da-bakim-ve-komisyon-ucretleri-2026-48274 ; Midas fees https://www.getmidas.com/ucretler/

### Crypto
- Blockchain Research Lab (2019). Market Reaction to Exchange Listings of Cryptocurrencies. https://www.blockchainresearchlab.org/wp-content/uploads/2019/10/Exploring-Market-Reactions-to-Exchange-Listings-of-Cryptocurrencies-BRL-working-paper3.pdf
- The Tie [industry] (2026). What Does an Exchange Listing Actually Deliver in 2026? https://www.thetie.io/insights/what-does-an-exchange-listing-actually-deliver-in-2026
- DataMaxi+ [industry]. Korean Exchange Listing Alpha. https://medium.com/@datamaxiplus/the-rise-of-korean-exchange-listing-alpha-capturing-upbit-and-bithumb-listing-pumps-9c9055388f15
- The reaction of cryptocurrencies to the approval of spot Bitcoin and Ethereum ETFs: an intraday event study (2025). *Borsa Istanbul Review*. https://www.sciencedirect.com/science/article/pii/S221484502500153X
- Spot cryptocurrency ETFs (2024). *FRL*. https://www.sciencedirect.com/science/article/abs/pii/S1544612324011796
- Market reactions to crypto-specific announcements (2025). *Economics Letters*. https://www.sciencedirect.com/science/article/abs/pii/S0165176525001429
- Exploring volatility reactions in cryptocurrency markets using intraday macroeconomic news (2025). https://www.sciencedirect.com/science/article/pii/S1059056025006720
- Huang, Y. et al. (2026) [preprint]. From Hypotheses to Factors: Constrained LLM Agents in Cryptocurrency Markets. https://arxiv.org/html/2604.26747v1
- Turkish crypto tax status 2026 (bill withdrawn 27.03.2026): https://vergimerkezi.com.tr/turkiye-kripto-vergi-rehberi-2026-stopaj-fifo-beyan/

### LLM-specific
- Lopez-Lira, A., Tang, Y. (2023–2025, v6). Can ChatGPT Forecast Stock Price Movements? Return Predictability and Large Language Models. https://arxiv.org/abs/2304.07619 ; SSRN https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788
- Chen, Y., Kelly, B., Xiu, D. Expected Returns and Large Language Models. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416687
- Kirtac, K. (2026) [preprint]. Financial Language Models as Applied AI Systems for News-Based Trading under Market Frictions. https://arxiv.org/pdf/2609.23703
- Yu, D., Liu, Z., Zhang, H., He, H. (2026) [preprint]. Fast Numbers, Slow Language: Bridging Quantitative and Qualitative Earnings Signals. https://arxiv.org/pdf/2606.29734
- Lehner, S., Lopez-Lira, A. (2026) [preprint]. ChatGPT as a Time Capsule: The Limits of Price Discovery. https://arxiv.org/html/2604.21433v1
- Glasserman, P., Lin, C. Assessing Look-Ahead Bias in Stock Return Predictions Generated by GPT Sentiment Analysis. https://arxiv.org/abs/2309.17322
- Look-Ahead-Bench (2026). https://arxiv.org/pdf/2601.13770
- Li, W. et al. (KDD 2026). FINSABER: Can LLM-based Financial Investing Strategies Outperform the Market in Long Run? https://arxiv.org/abs/2505.07078 ; code https://github.com/waylonli/FINSABER
- StockBench: Can LLM Agents Trade Stocks Profitably in Real-World Markets? https://arxiv.org/abs/2510.02209
- Alpha Arena (nof1.ai). https://nof1.ai/ ; Season 1.5 results: https://forklog.com/en/ai-model-grok-4-2-triumphs-in-trading-tournament/

---

*Caveats: Several Turkish PDFs were read in full from DergiPark. Paywalled papers (Ersan et al. 2021; Şimşir & Şimşek 2022; Fu & Huang 2016) are summarised from abstracts and indexing pages, so the exact minute-level and profit numbers were not verified. Industry sources are flagged and should not anchor rules without replication.*
