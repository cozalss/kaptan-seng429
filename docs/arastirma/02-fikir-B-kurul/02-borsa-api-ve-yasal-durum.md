# Execution venues, APIs, Turkish regulation (checked 29 Sep 2026)

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.


> **DÜZELTME (Tur 3):** Deniz Yatırım **Algolab 31.12.2025'te kapandı**. Binance Spot Testnet (testnet.binance.vision) artık anahtar kabul etmiyor → `demo.binance.com`. Güncel bilgi: `../04-derin-arastirma/01-gercek-para-platform-secimi.md`.

*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026. Yasal/vergisel bilgiler avukat/mali müşavir tarafından doğrulanmadı.*

## 1. Execution venues

| Venue | API / Python | Paper / testnet | Access from Turkey | Notes |
|---|---|---|---|---|
| **Alpaca** (US stocks) | REST + WS, `alpaca-py` | **Yes**, non-US users can open paper accounts | Paper: yes. Live: offered to non-US from $1, but **Turkey not confirmed** | **Built-in Benzinga News API** (REST + WS) |
| **Interactive Brokers** | TWS API / Web API | Yes, paper has full API | IBKR has a Turkey page (403, not verified) | TWS/Gateway must run |
| **BIST via Deniz Yatırım "Algolab"** | Official API (Python/Node/C#) for BIST shares and VİOP | No sandbox found | Needs Deniz account + API key | Most "real" retail BIST API; cost/limits not found |
| **Osmanlı / InfoYatırım / Gedik** | Mostly Matriks IQ, İdeal, TradingView integrations | Varies | Yes | İş Yatırım uses FIX (institutional) |
| **BtcTurk** | REST/WS, `btcturk-api` | No official testnet | On SPK's temporary list | TRY pairs |
| **OKX TR** | v5 REST/WS | Demo mode (**not verified** for TR) | On temporary list | |
| **Binance TR / global** | Full API | **Binance Spot Testnet (testnet.binance.vision) free**, virtual balances, periodic reset | Binance TR on temporary list; global: individual use reportedly not banned, access blocking possible | Best free crypto sandbox |
| **Paribu** | Advertised | No | On temporary list | Thin docs |

**BIST data:** real-time only via licensed vendors (Borsa İstanbul data distribution agreement). Delayed (15-min) and EOD are free tier. `yfinance` (`THYAO.IS`) delayed/unofficial; `isyatirimhisse` scrapes İş Yatırım (ToS unclear). **Fine for backtests, not for live news-reaction trading.**

## 2. Legal and regulatory
- **Algo trading for own account:** allowed in principle; BIST algorithmic order-sending undertaking + pre-trade risk procedures via broker. **Uncertain** whether retail API users sign it themselves.
- **Order-to-trade ratio (OTR):** cut from 5:1 to 3:1 for 24 Mar – 25 Apr 2025; excess fee 0.25 → 0.50 TL/order. Current ratio **uncertain**. A few-orders-a-day news bot won't approach it.
- **Law 7518 (since 2 Jul 2024):** crypto service providers need SPK licence. **As of Aug 2026 no platform fully licensed.** SPK list (down to 43) is **transitional, not authorisation**. Coino, Icrypex, WH moved to liquidation. Prefer listed exchanges; re-check list before depositing.
- **Pooling money — biggest risk.** Managing others' money / trading on their behalf without licence may fall under **Capital Markets Law 6362 Art. 109: 2–5 years prison** + judicial fines. KYC rules forbid letting others use your account. Four friends pooling cash into one account for a bot = **legally grey/risky**, even without fee; also tax and MASAK issues. No small-group exemption found.
- **Taxes:**
  - **BIST shares:** 0% withholding (GVK temp. Art. 67), final. Exceptions: GYO shares (10% unless held >1 year), some ETFs (10%); from 2026 certain non-TEFAS equity-heavy funds 15%.
  - **US stocks via Alpaca/IBKR:** gains generally declared on annual return at progressive rates (**uncertain**, ask an accountant). US dividends withheld at source.
  - **Crypto:** **no crypto-specific tax law.** March 2026 bill (10% withholding + 0.03% transaction tax) **withdrawn 27 Mar 2026**. General income tax rules, ambiguous. OECD-CARF reporting coming.

## 3. Recommendation
1. **Course project: paper trading only.** Alpaca paper + Alpaca/Benzinga news = cleanest end-to-end. Binance Spot Testnet for 24/7 crypto. Backtest BIST with delayed data.
2. **Guardrails before any real money:** position and daily-loss limits, kill switch, orders-per-minute cap, logging every decision, human confirmation mode.
3. **If live:** small amount you can lose (e.g. 1–5k TL each); **each person own account, own name, same bot code, own money.** No pooling, no trading for each other. BIST: Algolab on own Deniz accounts. Crypto: SPK-listed exchange, **withdrawal permission off** on API key.
4. Short legal/tax opinion (university law clinic or accountant) before live trading.

**Uncertain:** Alpaca live and IBKR eligibility for Turkish residents, Algolab fees, current OTR, OKX TR demo mode, tax on foreign-stock gains.

## Sources
- https://alpaca.markets/learn/live-trading-account-non-us
- https://alpaca.markets/support/is-alpaca-available-outside-the-us
- https://alpaca.markets/blog/introducing-news-api-for-real-time-fiancial-news/
- https://docs.alpaca.markets/us/docs/streaming-real-time-news
- https://www.interactivebrokers.com/campus/trading-lessons/how-to-open-an-ibkr-paper-trading-account/
- https://www.interactivebrokers.com/en/general/turkey-tr.php
- https://www.algolab.com.tr/ApiService
- https://www.osmanlimenkul.com.tr/hisse-ve-viop/platformlarimiz/osmanli-platformlari/ozel-emirler-ve-algoritmik-islemler
- https://www.borsaistanbul.com/sss/veri-dagitim-ve-endeks-lisanslama
- https://infoyatirim.com/blog/kesfet/spkdan-borsada-emirislem-orani-ve-ucretinde-degisiklik
- https://x.com/borsaistanbul/status/1903903288669732915
- https://borsaistanbul.com/files/algoritmik-emir-iletim-sistemleri-taahhutnamesi.pdf
- https://spk.gov.tr/kurumlar/kripto-varlik-hizmet-saglayicilar/faaliyette-bulunanlar-listesi
- https://www.fintekwins.com/spk-kripto-listesini-guncelledi-platform-sayisi-43e-indi/
- https://spk.gov.tr/duyurular/basin-duyurulari/2024/kripto-varlik-hizmet-saglayicilara-iliskin-duyuru_02072024
- https://bilalalyar.av.tr/yurt-disi-kripto-borsa-yasal-mi/
- https://spk.gov.tr/yatirimcilar/izinsiz-sermaye-piyasasi-faaliyetleri
- https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6362&MevzuatTur=1&MevzuatTertip=5
- https://www.getmidas.com/destek/borsa-istanbul/bist-piyasa-bilgileri/borsa-istanbul-uzerinden-islemlerim-icin-ne-kadar-vergi-odemem-gerekiyor
- https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html
- https://sanayigazetesi.com.tr/yeni-kripto-yasasi/
- https://vergimerkezi.com.tr/turkiye-kripto-para-vergisi-2026-yasal-rehber/
- https://testnet.binance.vision/
- https://developers.binance.com/docs/binance-spot-api-docs/testnet/general-info
- https://btcturkapi-python.readthedocs.io/
- https://tr.okx.com/docs-v5/en/
