# Real-Money Execution Venue Selection for the News-Driven LLM Trading Bot

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.


**Research date:** 29 September 2026
**Scope:** Where should a Python multi-agent system (LangGraph + RAG over pgvector) that trades on incoming news send its orders? This covers (a) the course demo, which runs on paper or testnet, and (b) the student's personal real-money phase, a small amount in his own account after 4–6 weeks of paper trading.
**Legend:** **[V]** verified directly on a primary source during this research · **[S]** secondary source (blog, news or aggregator) · **[U]** unverified or inferred. Check these yourself before relying on them.

---

## 0. TL;DR

1. **Deniz Yatırım Algolab no longer exists.** It shut down on **31 Dec 2025**. The platform and its API were closed, algolab.com.tr now resets connections, and the maintained Python wrapper's README carries a shutdown notice (commit dated 23 Jan 2026). **[V]** No other Turkish broker offers a free, open, self-serve Python REST/WebSocket API to retail clients today. **[S/U]** For BIST, the realistic automated routes are paid, Windows-desktop-bound terminal bridges (Matriks IQ "Dışarıdan Emir Kabulü", or iDeal). The alternative is a brand-new third party, TradeWize, which is not yet proven.
2. **#1 for the personal real-money phase: BtcTurk | Kripto, spot, TRY pairs.** It has the best-documented local API, with official docs and published rate limits. It has HMAC auth, a single-IP whitelist, and API keys that **cannot withdraw at all**. It is supported by CCXT. Funding is a TRY bank transfer, with no SWIFT or FX leg. There are no monthly data or API fees, and it is on the SPK temporary list. Caveats: two hot-wallet hacks (2024 and 2025), no testnet, and crypto tax is uncertain in Turkey.
3. **#1 for the course demo: Alpaca paper trading.** It is free and available worldwide as a paper-only account. It has the best Python SDK (`alpaca-py`). The paper API is identical to the live one. It has a built-in **Benzinga news REST and WebSocket feed** (history back to 2015), which is ideal for RAG and for showing the demo.
4. **Architecture implication:** put a `BrokerAdapter` interface behind the LangGraph "execution" node. Implement `AlpacaPaperAdapter` for the demo and `BtcTurkAdapter` in shadow/paper mode for the 4–6 week validation, then flip the latter to live. BIST (via Matriks IQ DEK) and US equities (via IBKR) can be phase-2 adapters.

---

## 1. Turkish brokers (BIST equities and VİOP)

### 1.1 Deniz Yatırım – Algolab (**discontinued**)

| Item | Finding | Status |
|---|---|---|
| Service status | "Maalesef Algolab Platformu ve API hizmeti 31.12.2025 itibarıyla kullanıma kapatılmıştır." (README of the reference Python wrapper; the commit "Update README with shutdown notice for AlgoLab" is dated 2026-01-23) | **[V]** https://github.com/atillayurtseven/AlgoLab |
| Website | `www.algolab.com.tr` resets TCP connections (curl error 35, tested 29 Sep 2026) | **[V]** |
| Deniz Yatırım algo page | Now lists only HFT/colocation and data-vendor terminals (ideAlgo, Matriks IQ, Matriks Kahin). Algolab is not mentioned. | **[V]** https://www.denizyatirim.com/AlgorithmicOperations |
| Community | The wrapper's author says on X: "Algolab de tarih oldu. Sanırım ücretsiz api sağlayan bir yer [kalmadı]…". Search snippets add that paid alternatives are not priced for individuals. | **[S]** https://x.com/atillayurtseven/status/2014456483946131533 |
| Historical API (for reference only) | REST + WebSocket. Login with API key, username and password, then an **SMS OTP** (`LoginUser` → `LoginUserControl`). The session had to be kept alive with `SessionRefresh`, which the wrapper called every 15 min. Client-side throttle ~1 request per 1.1 s. Functions covered equities and VİOP: SendOrder (market/limit), ModifyOrder, DeleteOrder, DeleteOrderViop, GetViopCustomerOverall, GetCandleData, Portfolio, RiskSimulation. Live data and depth were available "upon request". | **[V]** (code in `algolab.py`) + **[S]** https://www.algolab.com.tr/ApiService (cached description) |

**Conclusion:** Algolab is not an option. Its design is still worth knowing: a broker-grade BIST API in Turkey tends to require SMS OTP logins and session keep-alives. That is hostile to unattended bots, and any successor is likely to be similar.

### 1.2 Matriks IQ – "Dışarıdan Emir Kabulü (DEK)" API (the only **documented** Python-reachable BIST route)

| Item | Finding | Status |
|---|---|---|
| Mechanism | The MatriksIQ desktop terminal opens a **local TCP socket on port 18890**. Your program connects and exchanges **JSON messages terminated with `char(11)`**. Commands: ListAccounts, ListPositions, ListOrders, NewOrder, CancelOrder, EditOrder, KeepAlive, AccountInfo, Filled/Cancelled orders, plus pushed order/position/connection-state events. An official .NET client exists; **other languages (Python) must speak the JSON protocol directly**. | **[V]** API guide PDF v1.6 (17.04.2023): https://www.matriksdata.com/website/uploads/0_matriksiq-disaridanemirkabuluapi.pdf ; C# lib: https://github.com/MatriksIQ/ApiClient |
| Python feasibility | Yes, through a raw socket and JSON. A Matriks support thread shows a user doing exactly this from Python. | **[V]** https://destek.matriksdata.com/?qa=13569%2Fdisaridan-emir-kabul-apisi-kullanimi |
| Test environment | The API guide examples show a "[Matriks Deneme Ortamı]" brokerage (test environment). Support offered a temporary DEK licence for testing. | **[V]** PDF p.5 ; https://destek.matriksdata.com/?qa=9434/api-ba%C4%9Flant%C4%B1s%C4%B1 |
| Brokers | 34 brokers supported auto-trading through Matriks IQ (list dated 2022), including Deniz, Gedik, İnfo, İş, Osmanlı, Halk, Vakıf, Tacirler, Ünlü, Şeker, A1 and others. | **[V]** (2022 list) https://destek.matriksdata.com/?qa=9913/matriks-otomatik-satim-yapilabilen-kurumlar-hangileridir |
| Cost (1 Jan 2025 list at one broker) | IQ Terminal screen fee **₺1,073/mo**, ALGO **₺1,073/mo**, **DEK ₺3,540/mo**, plus BIST data licences (e.g. PD2 ₺665, VD2 ₺665, AKD ₺139). Fees may be refunded if you generate 5× the licence cost in commission. **2026 prices are likely higher (inflation) [U].** | **[V]** https://www.aktifbank.com.tr/uploads/20250509104629568.pdf |
| Operational constraints | A Windows desktop app must be running and logged in during the session. You depend on the terminal's uptime. Broker login may still require OTP when the terminal starts **[U]**. | **[V]/[U]** |
| VİOP | Supported (ExchangeId values for equity and derivatives). | **[V]** |

**Verdict:** This route technically works for BIST and VİOP. It costs roughly **₺5,000+/month** before data in 2025 prices, and needs an always-on Windows host. For a "small amount" account that fixed cost will very likely exceed any expected alpha. It is a **phase-2 option only**.

### 1.3 Other Turkish brokers and vendors

| Venue | Retail Python API? | Notes | Status |
|---|---|---|---|
| **Gedik Yatırım** | No public retail API found. | Gedik Trader has an in-app "algorithmic trading" button. MetaTrader 5 is offered for FX/VİOP (MQL5, not Python-native; a MT5 Python package exists but is Windows-only **[U]**). | **[S]** https://gedik.com/islem-kanallarimiz/gedik-trader |
| **Osmanlı Yatırım** | No REST/FIX retail API documented. | Algo only through Matriks, MatriksIQ, iDeal, FXPlus and TradingView. Licences are free if commission thresholds are met. Commissions go "as low as 1 in 10,000" for algo users. A **₺50,000 portfolio** is needed for campaigns. | **[V]** https://www.osmanlimenkul.com.tr/finansal-planlama/urunlerimiz/algoritmik-islemler/algoritmik-islemler2 |
| **İnfo Yatırım** | No retail API found. | Offers "kişiye özel algoritmik portföy yönetimi" (their robots, your strategy) and infox. | **[S]** https://infoyatirim.com/hizmetler/algoritmik-portfoy-yonetimi |
| **Garanti BBVA Yatırım** | No. | Algo through the İdeAlgo module (call 444 0 630). The "Garanti BBVA API Store" is for banking, not brokerage. | **[S]** https://www.garantibbvayatirim.com.tr/islem-kanallarimiz/diger-islem-kanallari |
| **İş Yatırım / QNB** | No public retail API found. | Matriks and iDeal bridges are available. | **[U]** |
| **Midas** | **No.** "Algoritmik işlem ve API erişimi sunulmamaktadır." Zero-commission BIST. | Reverse-engineering the app would breach the ToS. | **[S]** |
| **ÜNLÜ Menkul** | Coding editor on a platform. No Python API documented. | | **[V]** https://www.unlumenkul.com/algoritmik-trade/ |
| **iDeal / ideAlgo** | Scripting is in the terminal's own .NET-style language, **not Python**. Needs Windows 11 and 16 GB RAM. ideAlgo licence **₺2,024/mo** (Jan 2025). | | **[V]** https://idealdata.com.tr/urunler/idealgo/ + Aktifbank PDF |
| **FT Teknoloji** | FIX API and Java-socket API, sold to brokers. A retail client must apply through a broker that uses FT. | Institutional-grade. Availability to a student is unlikely **[U]**. | **[S]** https://ftteknoloji.com.tr/kurumsal-urunler/api-islem-sistemleri/ |
| **TradeWize** (new, Sep 2026) | Claims a **REST Developer API and an MCP server** for sending orders to linked broker accounts, with the BIST live-data licence included in its packages. | Monthly subscription (pricing is JS-rendered; "1.500 TL" appears on the page, context unclear). **Integrated brokers are not listed publicly.** FintekWins notes that API data distribution is still pending Borsa İstanbul approval. It is too new to trust with money. **Worth a low-cost trial in 2027.** | **[V]** site text https://www.tradewize.com.tr/ ; **[S]** https://www.fintekwins.com/tradewize-algoritmik-islem-altyapisini-web-api-ve-yapay-zeka-ile-birlestiriyor/ ; docs at https://developer.tradewize.com.tr (timed out) |

**BIST data without a broker API:** real-time BIST data requires a Borsa İstanbul licence through a licensed vendor (https://borsaistanbul.com/tr/sayfa/60). Libraries such as `borsapy` (https://github.com/saidsurucu/borsapy) provide **delayed or scraped** data only. That is fine for research and RAG, but not for execution-grade signals.

**BIST's strong point is news.** KAP (Kamuyu Aydınlatma Platformu) disclosures are primary, structured and time-stamped. They are the best news source of any venue here for an LLM. Python wrappers such as `kap_sdk` (https://pypi.org/project/kap_sdk/) and `pykap` (https://github.com/cemsinano/pykap) scrape KAP; there is no official retail API **[S]**.

**BIST costs and tax:** commissions range from 0 (Midas, Enpara) to about 0.1–0.15%, plus 5% BSMV on the commission **[S]** (https://www.yatirimx.com.tr/piyasa/komisyon-oranlari-dusuk-olan-araci-kurumlar-2026/20916). **Tax is the simplest of all venues.** Under GVK Geçici 67, the withholding rate on BIST equity trading gains for individuals is **0%, and no declaration is needed**. The March 2026 changes hit non-TEFAS equity-intensive hedge funds (now 15%), not direct shares **[S]** (https://www.getmidas.com/destek/borsa-istanbul/bist-piyasa-bilgileri/borsa-istanbul-uzerinden-islemlerim-icin-ne-kadar-vergi-odemem-gerekiyor ; https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html).

---

## 2. Crypto venues (TRY pairs)

### 2.1 Regulatory status (SPK), as of Aug–Sep 2026

- The SPK publishes a **"Faaliyette Bulunanlar Listesi (Geçici Liste)"**. It states explicitly that being on the list **does not mean the entity is licensed**. **[V]** https://spk.gov.tr/kurumlar/kripto-varlik-hizmet-saglayicilar/faaliyette-bulunanlar-listesi
- The current list includes **Btcturk Kripto Varlık Alım Satım Platformu AŞ**, **Binance Turkey Kripto Varlık Alım Satım Platformu AŞ**, **OKX TR Kripto Varlık Alım Satım Platformu AŞ** and **Paribu**. **[V]**
- The 7 Aug 2026 update had 55 entities (46 platforms and 9 custody applicants). Coino, Icrypex and WH Last Stop moved to the liquidation list. **[S]** https://fintechtime.com/2026/08/spk-kripto-varlik-hizmet-saglayicilari-gecici-listesini-acikladi/
- **Practical rule:** use only a platform on this list. Do not use offshore Binance.com or similar as a Turkish resident.

### 2.2 BtcTurk | Kripto

| Item | Finding | Status |
|---|---|---|
| Base URLs | REST `https://api.btcturk.com` (v1 private, v2 public). Graph API `graph-api.btcturk.com`. WebSocket `wss://ws-feed-pro.btcturk.com`. Servers are in Azure West Europe. | **[V]** https://docs.btcturk.com/docs/general-information ; https://docs.btcturk.com/docs/websocket-feed/authentication |
| Auth | HMAC-SHA256 with public and private key. Nonce is a ms timestamp with ±5 s tolerance. WebSocket login is by HMAC (message type 114). | **[V]** |
| Key permissions | Total Funds, Trade, Account, WebSocket. **There is no withdrawal permission in the API at all.** A key can be restricted to **one IP**. More than 50 consecutive unauthorised requests block the IP. | **[V]** https://docs.btcturk.com/docs/api-access-permissions ; **[S]** https://btcturkpro.zendesk.com/hc/en-us/articles/360013452717-BtcTurk-Kripto-API |
| Rate limits | Order POST: **300/60 s and 10/1 s**. Order DELETE: same. Order GET: 900/60 s. Balances: 120/60 s. Ticker: 600/60 s. OrderBook: 180/60 s. OHLC: 120/60 s. WebSocket: 15 connections/min (subscriptions are not counted). A 429 response includes `Retry-After`. | **[V]** https://docs.btcturk.com/docs/private-endpoints/rate-limits |
| Python | Official docs include Python samples. **CCXT supports `btcturk`**. The official full SDK is C# (https://github.com/BTCTrader/broker-api-csharp-v2). | **[V]** CCXT repo `python/ccxt/btcturk.py` |
| Order types | Market, limit, stop-limit (per API docs) **[S]**. Spot only. | **[S]** |
| Fees (spot) | TRY pairs at entry tier are about **0.12% maker / 0.20% taker**, falling with 30-day volume (down to about 0.01%/0.08%). | **[S]** https://btcturkpro.zendesk.com/hc/tr/articles/360011916377-BtcTurk-Kripto-da-Komisyonlar (403 to bots) ; https://www.rfp.wiki/crypto/exchanges-trading/crypto-retail-exchanges/btcturk |
| Testnet / sandbox | **None documented.** Paper trading must be simulated locally against the live order book (easy to build). | **[V]** (absent from FAQ) |
| Real-time data cost | Free (public WebSocket order book and trades). | **[V]** |
| Security history | **June 2024: ~$55M** hot-wallet loss. **14 Aug 2025: ~$48M** hot-wallet exploit, with deposits and withdrawals paused. | **[S]** https://www.coindesk.com/business/2025/08/14/turkish-crypto-exchange-btcturk-witnesses-usd48m-of-suspicious-outflows-amid-hack-fears ; https://www.halborn.com/blog/post/explained-the-btcturk-hack-august-2025 |
| SPK | On the temporary list (platform and custody). | **[V]** |

### 2.3 OKX TR

| Item | Finding | Status |
|---|---|---|
| API | Same v5 API as global OKX. REST `https://tr.okx.com`. The docs list WebSockets at `wss://ws.okx.com:8443/ws/v5/{public,private,business}`. Python SDK `python-okx` (pass the TR domain). | **[V]** https://tr.okx.com/docs-v5/en/ ; https://pypi.org/project/python-okx/ |
| Security | Up to **20 IPs per key**. Keys with trade permission and no IP binding **expire after 14 days of inactivity**. There is a withdraw permission, so **never enable it**. Travel-rule fields apply to TR withdrawals (2025-03-03). | **[V]** |
| Order rate | Per-instrument limits shared between REST and WS. Generous (e.g. sub-account 1000 order requests per 2 s). | **[V]** |
| Demo trading | The global OKX has a full demo environment (`x-simulated-trading`, `wspap.okx.com`). **The TR docs list only "Production Trading Services"**. Demo references in the TR docs are inherited code samples (`flag="1"`). Whether demo works for a TR account is **not confirmed**. | **[U]** |
| Fees | Regular-tier spot fees are commonly cited as 0.08% maker / 0.10% taker (global). TRY pairs have their own fee group ("Spot TRY" groupId 3). **The exact TR rate is unverified.** | **[S]/[U]** https://tr.okx.com/en/learn/okx-trde-islem-ucretleri-nasil-hesaplanir-ve-dusurulur |
| SPK | On the temporary list. | **[V]** |

### 2.4 Binance TR (binance.tr / trbinance.com)

| Item | Finding | Status |
|---|---|---|
| API | Its **own API** (not Binance.com's): base `https://www.binance.tr` (some calls use `https://api.binance.me`). WebSocket `wss://www.binance.tr` or `wss://stream-tr.2meta.app` depending on symbol type. Weight-based IP rate limits with 429 and 418 bans (2 min to 3 days). | **[V]** https://www.binance.tr/apidocs/ |
| Python | No official SDK. Community libraries exist (`BinanceTrApi` on PyPI; C# `emin-karadag/BinanceTr`). **Not in CCXT** (no `binancetr` module today). | **[V]** (CCXT) / **[S]** https://pypi.org/project/BinanceTrApi |
| Fees | TRY pairs ~0.10% maker / 0.15% taker; crypto/crypto 0.10%/0.10%; BNB discount. | **[S]** https://www.btchaber.com/kripto-komisyon-oranlari-2026/ (the official schedule https://www.binance.tr/fees/schedule renders only after login) |
| Testnet | None for TR. | **[U]** |
| SPK | On the temporary list. | **[V]** |

### 2.5 Crypto tax (Turkey, 2026)

- The March 2026 bill (0.03% crypto transaction tax plus quarterly withholding on SPK-licensed platforms, FIFO) was **withdrawn on 27 Mar 2026**. **No crypto-specific tax law is in force.** **[S]** https://gokaygul.com/tr/blog/kripto-varlik-vergilendirme-2026/ (dated 9 Jul 2026) ; KPMG summary of the bill: https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/kripto-varliklarin-vergilendirilmesi-ve-diger-bazi-vergi-ve-sosyal-guvenlik-konularina-iliskin-duzenlemeler-iceren-kanun-teklifi-tbmm-ye-sunuldu/4469
- **Not tax-free.** Frequent automated trading risks classification as **ticari kazanç (GVK md. 37)**, with an annual declaration. CARF reporting will increase visibility. **Keep a full trade ledger. The bot must log every fill with a TL value anyway.** Consult an SMMM before going live. **[S]**

---

## 3. US equities from Turkey

### 3.1 Alpaca

| Item | Finding | Status |
|---|---|---|
| Paper trading | Free. **"Paper Only Account"** available to anyone (non-US included). Same API as live. | **[V]** (support-site category text) https://alpaca.markets/support/countries-alpaca-is-available |
| Live account for a Turkish resident | Alpaca says it supports many non-US residents "depending on country of residence". The country list is **not published** ("contact support@alpaca.markets"; page updated 2026-02-19). Turkey is named only among countries where **partners** (Broker API) opened accounts. **Direct individual eligibility for Turkey is UNVERIFIED. Email support before planning on it.** | **[U]** https://alpaca.markets/learn/live-trading-account-non-us ; https://alpaca.markets/about-us |
| Onboarding | W-8BEN, a foreign tax ID, ID and selfie. Funding from $1 after approval (method depends on country). | **[V]** |
| Data | **Basic (free):** real-time IEX only (~2.5% of volume), 30 WebSocket symbols, 200 API calls/min, latest 15 min of SIP history restricted. **Algo Trader Plus: $99/mo** for full SIP, 10k calls/min. | **[V]** https://docs.alpaca.markets/us/docs/about-market-data-api |
| **News** | **Benzinga** news over REST (history since 2015, ~130+ articles/day) and a real-time WebSocket at `wss://stream.data.alpaca.markets/v1beta1/news`. Commonly available on the free plan. **Confirm the plan entitlement [U].** | **[V]** https://docs.alpaca.markets/us/docs/streaming-real-time-news ; https://docs.alpaca.markets/us/docs/historical-news-data |
| Python | `alpaca-py` (official). Commission-free equities. | **[V]** |

### 3.2 Interactive Brokers (IBKR)

| Item | Finding | Status |
|---|---|---|
| Turkish residents | Accepted. Turkey is listed as available per brokerage-comparison sites (June 2026). **The serving entity (IB LLC vs IB UK) is not confirmed.** A 2022/2024 Turkish guide says IB LLC. If it is IB UK, EU-style PRIIPs rules may block US-domiciled ETFs. | **[S]** https://brokerchooser.com/turkey ; https://www.finansalyazar.com/interactive-brokersta-turkiyeden-hesap-acilisi/ ; **[U]** entity |
| Minimums | No minimum deposit for standard accounts. | **[S]** |
| API | TWS API (official Python client) and the community `ib_async` library. Requires **TWS or IB Gateway running**, with a daily restart and re-auth (2FA on a weekly cycle) **[S/U]**. Free **paper account** mirrors live. | **[V]** https://www.interactivebrokers.com/campus/ibkr-api-page/market-data-subscriptions/ |
| Data | Real-time US data needs subscriptions, e.g. the US Securities Snapshot & Futures Value Bundle ~$10/mo, **waived at ≥$30/mo in commissions**. API snapshot quotes cost $0.01 (US equities) with a $1/mo waiver. News feeds are separate subscriptions. | **[S]** https://www.interactivebrokers.com/en/pricing/market-data-pricing.php |
| Funding and FX | SWIFT from a Turkish bank (bank fees are typically tens of USD per transfer **[U]**). IBKR FX conversion is cheap (≈0.2 bp, $2 minimum **[U]**). The 2022 claim of free TRY EFT is **unverified for 2026**. | **[U]** |
| W-8BEN | Required. Treaty rate on US dividends for TR residents is commonly cited as 20%. **US capital gains are not taxed in the US** for non-residents. | **[S]** |

### 3.3 Turkish tax on foreign stock gains

- Gains from selling foreign-listed shares are **değer artış kazancı** and must be **declared in the annual return (March). There is no exemption amount**, so even 1 TL of gain is declarable. Losses on foreign securities in the same year can be offset. **[S]** https://www.yapikredi.com.tr/medium/file/yabanci-hisse-senedi-gelirlerinde-2026-yili-vergi-durumu_71999/view ; https://www.logo.com.tr/blog/blog-detay/yurt-disi-borsa-kazanclari
- Cost and proceeds are converted to TL **at CBRT rates on each trade date**. The **FX gain is taxable**. Cost can be indexed by Yİ-ÜFE only if the increase is ≥10%. Progressive income-tax brackets apply. **[S]**
- **Consequence for a bot making many trades:** a heavy annual reconciliation burden and TL-inflation-driven "phantom" FX gains. This is the worst tax-simplicity score of the four markets.

---

## 4. Decision matrix

Scores run from 1 (poor) to 5 (excellent) for **this student's use case**: Python, small capital, a news-driven LLM bot with multi-second latency, and a Turkish resident. The **weighted total** uses these weights: API 20%, data cost 10%, fees 10%, paper mode 10%, legal 15%, tax 10%, news 15%, LLM-bot fit 10%.

| Venue | API quality (Python) | Real-time data cost | Trading fees | Paper / testnet | Legal clarity (TR resident) | Tax simplicity | News-data availability | Fit for news-driven LLM bot | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|
| **BtcTurk (crypto spot, TRY)** | **5** – official docs, published limits, CCXT, no-withdraw keys **[V]** | **5** – free WS **[V]** | 3 – ~0.12/0.20% **[S]** | 2 – none; local shadow-sim **[V]** | 4 – SPK temporary list **[V]** | 2 – no special law; ticari kazanç risk **[S]** | 3 – crypto news plentiful but noisy (CryptoPanic, X, exchange announcements) | **4** – 24/7, TRY rails, tiny sizes OK | **3.75** |
| OKX TR (crypto spot, TRY) | 4 – `python-okx`, CCXT `okx` (TR host needs config) **[V/U]** | 5 | 4 – ~0.08/0.10% **[S/U]** | 3 – demo exists globally; **TR unverified** | 4 **[V]** | 2 | 3 | 4 | 3.65 |
| Binance TR (crypto spot, TRY) | 3 – own API, no official SDK, not in CCXT **[V]** | 5 | 3.5 – ~0.10/0.15% **[S]** | 1 | 4 **[V]** | 2 | 3 | 3.5 | 3.13 |
| **BIST via Matriks IQ DEK** (any of ~30 brokers) | 2 – local JSON socket to a Windows GUI; OTP/uptime issues **[V/U]** | 1 – ≈₺5k+/mo incl. DEK+IQ (2025) **[V]** | 4 – down to ~0.01–0.1% **[S]** | 3 – Matriks test env / temp licence **[V]** | **5** – SPK-regulated brokers | **5** – 0% stopaj, no beyan **[S]** | **5** – KAP primary disclosures (scraped) | 3 – great news edge, but cost and session-hours kill it at small size | **3.35** |
| BIST via TradeWize API/MCP | 3? – REST + MCP claimed **[V claim]** | 3? – live-data licence bundled **[V claim]** | 4 (broker's) | 1–2 **[U]** | 3 – new, broker list and approvals unclear **[S]** | 5 | 5 | 4? | ~3.4 (**too unverified**) |
| Alpaca (US equities) – **paper** | **5** – `alpaca-py`, REST + WS **[V]** | 4 – free IEX; $99 SIP **[V]** | 5 – $0 commission | **5** – paper-only accounts worldwide **[V]** | n/a (paper) | n/a | **5** – Benzinga REST+WS built in **[V]** | **5** for demo | — (demo) |
| Alpaca (US equities) – **live** | 5 | 4 | 5 (+FX/SWIFT costs) | 5 | **2 – TR eligibility unverified [U]** | 1 – full beyan, TL/FX calc, no exemption | 5 | 4 | 3.85 *if eligible*; otherwise **not available** |
| IBKR (US equities) – live | 3.5 – powerful but TWS/Gateway ops **[V/S]** | 3 – ~$10/mo unless $30 comm **[S]** | 4 – low comm + FX/SWIFT | 4 – free paper account | 4 – accepts TR residents **[S]**, entity **[U]** | 1 | 4 – news via paid subs (or external) | 3.5 | 3.30 |

(Weighted totals are indicative arithmetic, not precise measurements.)

---

## 5. Recommendations

### 5.1 #1 for the personal real-money phase: **BtcTurk | Kripto, spot TRY pairs**

Reasons:
1. **It is the only mature, officially documented, self-serve API in Turkey** that fully meets the bot's needs, now that Algolab is gone. It has published rate limits (10 orders/s), HMAC auth, a Python path through CCXT or raw REST/WS, and free real-time order-book and trade streams. **[V]**
2. **API keys cannot withdraw** (the permission set is balances, trade, account and WebSocket only), and a key can be locked to one IP. If the LLM agent, a prompt-injected news item, or a leaked `.env` goes wrong, the worst case is bad trades, not stolen funds. **[V]**
3. **There are no fixed costs.** No data licence, no terminal, no API subscription. This matters when the capital is small. The Matriks route costs about ₺5k/month. **[V]**
4. **TRY funding goes over domestic bank transfer.** There is no SWIFT, no W-8BEN and no foreign FX leg. You can start with very small amounts. **[S]**
5. It is on the **SPK temporary operating list**. **[V]**

Required mitigations:
- **Custody risk** (hacked in 2024 and 2025): keep only the bot's trading float on the exchange and sweep profits to the bank regularly. Treat the float as money you can lose.
- **No testnet:** build a **shadow-paper engine** that consumes BtcTurk's live WS order book and simulates fills, including taker fee, spread and latency. Run it for 4–6 weeks with identical code paths, then switch the adapter to live with hard caps: maximum position size, maximum daily loss, a kill switch, and a whitelist of pairs such as BTCTRY, ETHTRY and USDTTRY.
- **Tax:** log every fill with its TL value and fees, and talk to an SMMM about ticari kazanç exposure before scaling up.
- **Runner-up:** **OKX TR**, which has lower fees and an excellent SDK. If its demo mode is confirmed to work for TR accounts, it offers paper and live on the same API. Verify this by creating a demo API key from a TR account before you choose it.

### 5.2 #1 for the course demo: **Alpaca paper trading (US equities, with the integrated Benzinga news stream)**

Reasons: it is free and open to non-US users as a paper-only account **[V]**. The official `alpaca-py` SDK is excellent. The paper and live APIs are identical, so the demo looks like real trading. Most importantly, **news and market data come from the same vendor with timestamps**. That enables a clean end-to-end story (news WS → LangGraph agents → RAG over pgvector with history since 2015 → order → fill), plus reproducible backtests on historical news. Nothing in the Turkish ecosystem gives a grader a smoother, less risky live demo.

Alternative demo (if the course requires a Turkish market): BtcTurk shadow-paper, which is the same engine you will later run live. KAP-scraped BIST news against delayed BIST prices is suitable only for offline evaluation.

### 5.3 Suggested architecture decision (to be recorded as an ADR)

- `BrokerAdapter` protocol with `place_order`, `cancel`, `positions`, `balances`, `stream_fills`.
  - `AlpacaPaperAdapter` (demo)
  - `BtcTurkShadowAdapter`, then `BtcTurkLiveAdapter` (personal)
  - Later: `MatriksDekAdapter` (BIST, local socket 18890) and `IbkrAdapter`
- `NewsSource` protocol:
  - `AlpacaBenzingaSource` (demo)
  - Crypto sources (exchange announcements, CryptoPanic-type aggregator **[U]**, curated RSS)
  - `KapSource` (BIST, phase 2)
- A risk-gate node sits between the LLM decision and the adapter. It is deterministic and not LLM-driven: size caps, a loss limit and a kill switch.

### 5.4 Open items to verify before real money

1. Does Alpaca accept **individual** live accounts for Turkey tax residents? Email support@alpaca.markets.
2. Does **OKX TR demo trading** work for TR-entity accounts (API key and `x-simulated-trading`)?
3. BtcTurk **current official fee table** (the zendesk page blocks bots, so read it in a browser).
4. Matriks IQ **2026 prices** for IQ + ALGO + DEK at your broker, and whether terminal login needs daily OTP.
5. TradeWize: which brokers are integrated, API pricing, whether an MCP/REST sandbox exists, and whether BIST data-distribution approval has been granted.
6. IBKR serving entity for Turkey (LLC vs UK) and current TRY funding options.
7. SMMM opinion on the tax treatment of frequent automated crypto trading (GVK 37 vs 80).

---

## 6. Source list

- AlgoLab wrapper and shutdown notice: https://github.com/atillayurtseven/AlgoLab
- Algolab API page (now unreachable): https://www.algolab.com.tr/ApiService
- Deniz Yatırım algo page: https://www.denizyatirim.com/AlgorithmicOperations
- X post on the shutdown: https://x.com/atillayurtseven/status/2014456483946131533
- Matriks IQ DEK API guide: https://www.matriksdata.com/website/uploads/0_matriksiq-disaridanemirkabuluapi.pdf
- Matriks C# client: https://github.com/MatriksIQ/ApiClient
- Matriks support (Python/DEK): https://destek.matriksdata.com/?qa=13569%2Fdisaridan-emir-kabul-apisi-kullanimi
- Matriks support (DEK licence): https://destek.matriksdata.com/?qa=9434/api-ba%C4%9Flant%C4%B1s%C4%B1
- Matriks supported brokers (2022): https://destek.matriksdata.com/?qa=9913/matriks-otomatik-satim-yapilabilen-kurumlar-hangileridir
- Data licence fee table (1 Jan 2025): https://www.aktifbank.com.tr/uploads/20250509104629568.pdf
- Osmanlı algo: https://www.osmanlimenkul.com.tr/finansal-planlama/urunlerimiz/algoritmik-islemler/algoritmik-islemler2
- Osmanlı platforms: https://osmanlimenkul.com.tr/finansal-planlama/urunlerimiz/algoritmik-islemler/islem-platformlari
- Gedik Trader: https://gedik.com/islem-kanallarimiz/gedik-trader
- İnfo algo: https://infoyatirim.com/hizmetler/algoritmik-portfoy-yonetimi
- Garanti BBVA Yatırım channels: https://www.garantibbvayatirim.com.tr/islem-kanallarimiz/diger-islem-kanallari
- ÜNLÜ: https://www.unlumenkul.com/algoritmik-trade/
- iDeal / ideAlgo: https://idealdata.com.tr/urunler/idealgo/
- FT Teknoloji API: https://ftteknoloji.com.tr/kurumsal-urunler/api-islem-sistemleri/
- TradeWize: https://www.tradewize.com.tr/
- TradeWize article: https://www.fintekwins.com/tradewize-algoritmik-islem-altyapisini-web-api-ve-yapay-zeka-ile-birlestiriyor/
- BIST data vendors: https://borsaistanbul.com/tr/sayfa/60
- borsapy: https://github.com/saidsurucu/borsapy
- kap_sdk: https://pypi.org/project/kap_sdk/
- pykap: https://github.com/cemsinano/pykap
- BIST commissions 2026: https://www.yatirimx.com.tr/piyasa/komisyon-oranlari-dusuk-olan-araci-kurumlar-2026/20916
- BIST tax (Midas): https://www.getmidas.com/destek/borsa-istanbul/bist-piyasa-bilgileri/borsa-istanbul-uzerinden-islemlerim-icin-ne-kadar-vergi-odemem-gerekiyor
- GVK Geçici 67 changes (PwC): https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html
- SPK list: https://spk.gov.tr/kurumlar/kripto-varlik-hizmet-saglayicilar/faaliyette-bulunanlar-listesi
- SPK list (Aug 2026 news): https://fintechtime.com/2026/08/spk-kripto-varlik-hizmet-saglayicilari-gecici-listesini-acikladi/
- BtcTurk docs: https://docs.btcturk.com/docs/general-information
- BtcTurk rate limits: https://docs.btcturk.com/docs/private-endpoints/rate-limits
- BtcTurk API permissions: https://docs.btcturk.com/docs/api-access-permissions
- BtcTurk WS auth: https://docs.btcturk.com/docs/websocket-feed/authentication
- BtcTurk FAQ: https://docs.btcturk.com/docs/faq-frequently-asked-questions/
- BtcTurk fees (TR): https://btcturkpro.zendesk.com/hc/tr/articles/360011916377-BtcTurk-Kripto-da-Komisyonlar
- BtcTurk 2025 hack (CoinDesk): https://www.coindesk.com/business/2025/08/14/turkish-crypto-exchange-btcturk-witnesses-usd48m-of-suspicious-outflows-amid-hack-fears
- BtcTurk 2025 hack (Halborn): https://www.halborn.com/blog/post/explained-the-btcturk-hack-august-2025
- CCXT: https://github.com/ccxt/ccxt
- OKX TR API docs: https://tr.okx.com/docs-v5/en/
- python-okx: https://pypi.org/project/python-okx/
- OKX TR fees article: https://tr.okx.com/en/learn/okx-trde-islem-ucretleri-nasil-hesaplanir-ve-dusurulur
- Binance TR API docs: https://www.binance.tr/apidocs/
- Binance TR fee schedule: https://www.binance.tr/fees/schedule
- Crypto fees 2026: https://www.btchaber.com/kripto-komisyon-oranlari-2026/
- Crypto tax status (2026): https://gokaygul.com/tr/blog/kripto-varlik-vergilendirme-2026/
- KPMG on the crypto tax bill: https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/kripto-varliklarin-vergilendirilmesi-ve-diger-bazi-vergi-ve-sosyal-guvenlik-konularina-iliskin-duzenlemeler-iceren-kanun-teklifi-tbmm-ye-sunuldu/4469
- Alpaca non-US live accounts: https://alpaca.markets/learn/live-trading-account-non-us
- Alpaca countries page: https://alpaca.markets/support/countries-alpaca-is-available
- Alpaca about: https://alpaca.markets/about-us
- Alpaca market data plans: https://docs.alpaca.markets/us/docs/about-market-data-api
- Alpaca real-time news: https://docs.alpaca.markets/us/docs/streaming-real-time-news
- Alpaca historical news: https://docs.alpaca.markets/us/docs/historical-news-data
- IBKR in Turkey (BrokerChooser): https://brokerchooser.com/turkey
- IBKR account opening from Turkey: https://www.finansalyazar.com/interactive-brokersta-turkiyeden-hesap-acilisi/
- IBKR market data pricing: https://www.interactivebrokers.com/en/pricing/market-data-pricing.php
- IBKR API market data subscriptions: https://www.interactivebrokers.com/campus/ibkr-api-page/market-data-subscriptions/
- Foreign stock tax (Yapı Kredi): https://www.yapikredi.com.tr/medium/file/yabanci-hisse-senedi-gelirlerinde-2026-yili-vergi-durumu_71999/view
- Foreign stock tax (Logo): https://www.logo.com.tr/blog/blog-detay/yurt-disi-borsa-kazanclari

*Disclaimer: this is technical research for a course project, not investment or tax advice.*
