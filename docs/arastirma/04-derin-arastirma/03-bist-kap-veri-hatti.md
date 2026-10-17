# BIST + KAP data pipeline: a verified design

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.


*Deep research report, 29.09.2026. Everything marked **[verified]** was checked on this date with live HTTP calls or by reading library source code from this machine in Ankara. Anything marked **[unverified]** or **[claim]** comes from third-party text and was not reproduced.*

---

## 0. TL;DR: the decisions

| Topic | Decision | Why |
|---|---|---|
| **Live KAP feed** | Poll the **kap.org.tr website JSON endpoint** (`POST /tr/api/disclosure/members/byCriteria` or `/tr/api/disclosure/list/main`) every 15–30 s, with a browser User-Agent. Use `disclosureIndex` as the cursor. | **[verified]** Works with no key and returns structured JSON (index, time to the second, class, subject, ticker). No public RSS or push feed exists. |
| **Official KAP API (MKK)** | Register on the MKK API Portal anyway. It is free, apps are auto-approved, and you get the real schema. Treat it as a **sandbox only**. | **[verified]** The free plan is limited to **6 calls/min** and the test gateway serves a **frozen historical slice** (indices 1091689–1231017, around 2023). Production access needs a **Borsa İstanbul data distribution contract** plus IP whitelisting, which is not realistic for a student. |
| **Historical KAP (backtest)** | Backfill from the same website endpoint **one day per request** (hard cap of **2000 rows per response**). The archive starts in **June 2009** (index 84196). | **[verified]** A 90-day query and a 365-day query both returned exactly 2000 rows. Single days from 2010 and 2015 worked. |
| **Full text** | Fetch `GET /tr/Bildirim/{idx}` only for **filtered** disclosures, then parse the Next.js payload (`oda_ExplanationTextBlock`). | **[verified]** Text is extractable and is Turkish+English bilingual for many companies. Pages are about 280 KB, so never fetch all of them. |
| **Prices (backtest)** | `yfinance` for daily data since 2000 and 1h bars for 730 days. `borsapy` for 1m bars (about 2 weeks) and for **İş Yatırım corporate actions** (bedelli/bedelsiz split). `isyatirimhisse` for adjusted vs unadjusted daily closes. | **[verified]** All three were run on THYAO. |
| **Prices (live)** | Free data is **15 min delayed** (Yahoo). borsapy/TradingView is also about 15 min delayed without a login. Real time needs a licensed vendor or broker. **Algolab (Deniz Yatırım) was shut down on 31.12.2025.** | **[verified]** Yahoo help page. The Algolab README says the service is closed and algolab.com.tr is unreachable. This **corrects** our earlier file `02-borsa-api-ve-yasal-durum.md`. |
| **News RSS** | Use AA Ekonomi, Dünya, Foreks, Habertürk Ekonomi, TRT Haber Ekonomi, CNBC-e, Borsagündem, and investing.com TR. **Bloomberg HT `/rss` is stale** (newest item 14 Sep 2026). | **[verified]** Freshness was checked with min/max `pubDate`. |
| **Macro** | TCMB **EVDS3** (`evds3.tcmb.gov.tr`, free key). The old `evds2` URLs redirect. Use `evds>=0.4.0` or `borsapy.evds_series`. | **[verified]** `evds2` returns 302 to `evds3`. |
| **Classification** | Classify **deterministically on KAP `subject`** first, since about 90% of rows are already typed. Use the LLM only for "Özel Durum Açıklaması (Genel)" and a few free-text subjects. | **[verified]** Subject distribution below. |
| **Embeddings** | Start with **bge-m3** (1024-d, 8192 context) and add a **hybrid** Postgres FTS/trigram leg. Benchmark against `multilingual-e5-large-instruct` on 100 of your own queries. | TR-MTEB and a Sept-2026 Turkish RAG study (details in §5). |

---

## 1. KAP access

### 1.1 The official route: MKK API Portal and the "KAP Veri Yayın Servisi" (VYK) REST API

**What the portal says [verified in a browser, apiportal.mkk.com.tr/products → "PUBLIC DISCLOSURE PLATFORM (KAP)" → "KAP Data Dissemination Services"]:**
- API type: REST. **App approval: "Auto app approval".** Last modified 10/09/2026.
- **Plan: "Free: Throttling for 6 calls per min".**
- Contact: "Public Disclosure Services Directorate" (KAP), with kapdestek@mkk.com.tr in the KAP PDF.
- Registration flow (FAQ and "How it works"): register → click the e-mail activation link → log in → **create an "Application" (this generates the API key)** → subscribe the app to the API product → test. MKK's launch news (13 Jan 2025) says "uygulama ücretsizdir" and lists 12 KAP services. https://www.mkk.com.tr/haberler/mkk-api-portal-yayinda
- Individuals can register. The flow asks for no company documents. Account approval time is **[unverified]**, but the product page says app approval is automatic.

**Production is a different contract [verified, official KAP PDF "Kamuyu Aydınlatma Platformu Veri Yayın Servisi Rest API Entegrasyonu", https://kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873]:**
> "KAP Veri Yayın Servisi entegrasyonu için öncelikle Borsa İstanbul A.Ş. ile veri dağıtım sözleşmesi imzalanmalıdır … ilgili kuruluş tarafından bildirilen IP'ler bazında servisler için yetkilendirme yapılır ve API KEY bilgisi abonelere e-posta yoluyla iletilir … KAP sitesinde yer alan bilgilere ilişkin **yüksek yoğunluklu taleplerin doğrudan siteden değil** … API servislerimiz aracılığı ile karşılanması gerekmektedir."

Subscribers receive disclosures **"eş anlı"** (simultaneously with publication). This is the only official low-latency channel, but it is a commercial data-vendor product: a BIST contract and fee schedule (Annex 3 of the Veri Dağıtım Sözleşmesi), plus IP whitelisting. **For the course project, use the portal sandbox to learn the schema, not as the live feed.**

**Endpoints [verified from the `kap-go` module source, v0.0.0-20260209, `docs/kap-rest-api.md`, retrieved via proxy.golang.org; the GitHub repo has since been deleted]:**

| Service | Path | Notes |
|---|---|---|
| Token (prod only) | `GET /auth/generateToken?apiKey=…` | JWT valid for 24 h; header `Authorization: <token>` |
| Disclosure list | `GET /api/vyk/disclosures?disclosureIndex=N[&disclosureClass=&disclosureType=&companyId=]` | Returns **50 disclosures starting from index N**. This is a cursor API, not a date API. |
| Disclosure detail | `GET /api/vyk/disclosureDetail/{idx}?fileType=html\|data[&subReportList=]` | `data` works only for idx ≥ 538004 (KAP 4.0); older items are HTML only |
| Attachment | `GET /api/vyk/downloadAttachment/{id}` | PDF only; URLs are not public |
| Last index | `GET /api/vyk/lastDisclosureIndex` | `{"lastDisclosureIndex": "1231017"}` is the cheapest "anything new?" check |
| Companies | `GET /api/vyk/members` | `id, title, stockCode, memberType (IGS=listed…), kfifUrl` |
| Company detail | `GET /api/vyk/memberDetail/{id}` | key/value sections |
| Securities | `GET /api/vyk/memberSecurities` | `isin, borsaKodu, takasKodu, capital, currentCapital, borsadaIslemeAcik…` |
| Funds / fund detail | `/api/vyk/funds`, `/api/vyk/fundDetail/{id}` | |
| Blocked | `/api/vyk/blockedDisclosures` | Disclosures closed to access |
| CA status | `/api/vyk/caEventStatus?processRefId=` | Corporate-action workflow status |

Test base URL: `https://apigwdev.mkk.com.tr` (Basic Auth in test). **Test data is a historical snapshot:** "Disclosures with index between 1091689 and 1231017 are available for querying in the test environment", and fund IDs 4282/4320/4372.

Key **detail fields** you will want to mirror in your own schema: `disclosureIndex, senderId, senderTitle, senderExchCodes[], behalfSender*, disclosureReason (NEW|UPD|CORR|CANC), disclosureDelayStatus (O|D), relatedDisclosureIndex, disclosureType (FR|ODA|DG|DUY|FON|CA), disclosureClass (FR|ODA|DG|DUY), subject{tr,en}, summary{tr,en}, consolidation (CS|NC), year, period{tr,en}, relatedStocks[], time ("dd.MM.yyyy HH:mm:ss"), link, attachmentUrls[{url,fileName}], eventType, eventId, presentation[], flatData[], htmlMessages[] (base64)`.

Minimal sandbox client (schema from the doc above; **[unverified]** against the live test gateway because we have no credentials yet):
```python
import httpx, os
BASE = "https://apigwdev.mkk.com.tr"
auth = (os.environ["MKK_USER"], os.environ["MKK_PASS"])  # test env = Basic Auth
with httpx.Client(base_url=BASE, auth=auth, timeout=30) as c:
    last = int(c.get("/api/vyk/lastDisclosureIndex").json()["lastDisclosureIndex"])
    batch = c.get("/api/vyk/disclosures", params={"disclosureIndex": 1211000}).json()  # 50 rows
    det = c.get(f"/api/vyk/disclosureDetail/{batch[0]['disclosureIndex']}", params={"fileType": "data"}).json()
# Free plan = 6 calls/min -> sleep >= 10 s between calls.
```

### 1.2 The practical route: kap.org.tr website JSON endpoints (unofficial)

The KAP website is a Next.js app backed by JSON endpoints under `https://www.kap.org.tr/tr/api/...`. All community libraries use them. **The KAP WAF blocks non-browser clients** (plain `curl` got an error page, even for `robots.txt`). Send `User-Agent`, `Origin` and `Referer` headers.

**A. Disclosure query by date [verified live 29.09.2026]:** `POST /tr/api/disclosure/members/byCriteria`
```python
import httpx
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Origin": "https://www.kap.org.tr", "Referer": "https://www.kap.org.tr/tr/bildirim-sorgu",
    "Accept": "application/json, text/plain, */*", "Content-Type": "application/json",
}
def kap_query(day_from: str, day_to: str, disclosure_class: str = "") -> list[dict]:
    body = {"fromDate": day_from, "toDate": day_to, "memberType": "IGS",   # IGS = listed companies
            "mkkMemberOidList": [], "inactiveMkkMemberOidList": [], "disclosureClass": disclosure_class,
            "subjectList": [], "isLate": "", "mainSector": "", "sector": "", "subSector": "",
            "marketOid": "", "index": "", "bdkReview": "", "bdkMemberOidList": [], "year": "",
            "term": "", "ruleType": "", "period": "", "fromSrc": False, "srcCategory": "",
            "disclosureIndexList": []}
    r = httpx.post("https://www.kap.org.tr/tr/api/disclosure/members/byCriteria",
                   json=body, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()
rows = kap_query("2026-09-28", "2026-09-28")   # -> 607 rows, 0.3-1.8 s, ~320 KB
```
Row fields **[verified]**: `publishDate ("28.09.2026 21:49:46", Istanbul local, UTC+3), disclosureIndex (int), kapTitle, stockCodes ("EBEBK", comma-separated, null for SPK/BIST notices), relatedStocks, disclosureClass, disclosureType, disclosureCategory, subject, summary, year, ruleType, period, isLate, isOldKap, attachmentCount, hasMultiLanguageSupport, modifyStatus, fundCode`.

Measured limits **[verified]**:
- **2000-row hard cap**: 2026-06-01..08-31 and 2025-09-01..2026-08-31 both returned exactly 2000 rows, the newest ones only. **Query one day at a time.**
- **Archive depth:** 2009-06-01 works (first index **84196**, matching the VYK doc's "84196–538004 pre-KAP 4.0" range). 2008 returns `[]`. 2010-06-01 gave 64 rows and 2015-03-02 gave 887 rows.
- Latency: single-day queries took 0.3–1.8 s. No 429 was seen at about 1 request/second over ~20 requests. kap-client uses 0.3–0.8 s jitter and exponential backoff on 429.

**B. Homepage-style feed [verified]:** `POST /tr/api/disclosure/list/main` with the body used by `kap_sdk`:
```json
{"fromDate":"29.09.2026","toDate":"29.09.2026","disclosureType":null,"fundTypes":null,"memberTypes":["IGS"],"mkkMemberOid":null}
```
Returns `[{disclosureBasic:{…, disclosureId (32-hex OID), disclosureIndex, stockCode, publishDate, relatedDisclosureOid, isBlocked, senderType…}, disclosureDetail:{relatedDisclosureIndex, opinion, auditType…}}]`. It has richer linkage fields (`relatedDisclosureOid`, `isBlocked`) than byCriteria. Note the date format here is `dd.MM.yyyy`, while byCriteria uses `yyyy-MM-dd`.

**C. Detail / full text [verified]:** `GET https://www.kap.org.tr/tr/Bildirim/{disclosureIndex}` returns about 280 KB of HTML with the Next.js RSC payload inside `self.__next_f.push([1,"…"])` chunks:
```python
import re, json, html
def kap_detail_text(idx: int, client: httpx.Client) -> str:
    s = client.get(f"https://www.kap.org.tr/tr/Bildirim/{idx}", headers={"User-Agent": HEADERS["User-Agent"]}).text
    payload = "".join(json.loads(f'"{c}"') for c in re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', s, re.S))
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", payload)))
    i = text.find("oda_ExplanationTextBlock|")          # "Açıklamalar" block for ODA
    return text[i + len("oda_ExplanationTextBlock|"):] if i >= 0 else text
```
Tested on idx 1669809 (FROTO, "Bağımsız Yönetim Kurulu Üyesine İlişkin SPK Başvurusunun Sonuçlanması"). It returned the Turkish text followed by the English translation. Structured tables (financial statements, dividend tables) are also in the payload as `taxonomy-*` HTML cells. Attachments: `/tr/api/notification/attachment-detail/{idx}` and `/tr/api/file/download/{objId}` (from the kap-client source).

**D. Other useful endpoints (from library source; `subjects` was verified):**
- `GET /tr/api/disclosure/subjects/{ODA|FR|DG}/IGS` gives the subject name → `subjectOid` list, used to filter `subjectList` in byCriteria. It returned 13 / 4 / 41 entries. The ODA list returned there looks incomplete, so **build your taxonomy empirically from the backfill**.
- `GET /tr/api/company/generic/excel/IGS/A` returns the listed-company list as Excel (borsapy). `GET /tr/api/company/items/{memberType}/A` is used by kap-client.
- `POST /tr/api/expected-disclosure-inquiry/company` gives **expected disclosures** (financial calendar), useful for "earnings due" features.

**Terms and ethics:** the official PDF explicitly asks high-volume users to go through the API. The site's `robots.txt` is WAF-blocked, so it could not be read. Recommended etiquette: poll at most every 15–30 s during 08:00–23:59, backfill at most 1 request per 2 s, cache everything, store only what you need, don't redistribute, and state in the report that this is academic, non-commercial use. borsapy's README states the same restriction: "personal and educational use only".

### 1.3 Community libraries (checked on PyPI and in source)

| Library | Latest | Access method | Status / notes |
|---|---|---|---|
| **kap-client** (semudu) | **1.2.0, 2026-07-17** | Website JSON (`members/byCriteria`, `funds/byCriteria`, `/tr/Bildirim`, attachments). httpx, Pydantic v2, retry on 429, browser headers | **Best maintained.** `Kap().fetch_disclosures("THYAO","2024-01-01","2024-12-31")`. Its docstring says fund byCriteria "fails for date ranges > ~90 days". https://github.com/semudu/kap-client |
| **pykap** (cemsinano) | 0.2.0, 2026-03-12 | Website JSON (`members/byCriteria`) + detail parsing for financial reports | Company-centric (`BISTCompany("THYAO").get_historical_disclosure_list()`). https://github.com/cemsinano/pykap |
| **kap_sdk** (enciyo/kap-tr-sdk) | 0.1.24, 2025-06-14 | Website JSON `list/main` + scraping of sector/index pages; disk cache | Idle for 15 months, but **its `list/main` request still works [verified]**. https://github.com/enciyo/kap-tr-sdk |
| **borsapy** (saidsurucu) | **0.11.0, 2026-08-07** | KAP (company list Excel, `bildirim-sorgu-sonuc`, detail pages, expected-disclosure calendar) + İş Yatırım + TradingView + EVDS3 + TEFAS | "yfinance for Turkey". Personal/educational use only. https://github.com/saidsurucu/borsapy |
| **kap-go** | 2026-02-09 (Go proxy) | **Official VYK API** (all 12 endpoints) | GitHub repo deleted, module still on proxy.golang.org. Best public documentation of the official schema. |
| MCP servers: `saidsurucu/borsa-mcp`, `enciyo/kap-tr-mcp`, `hasancagrigungor/kapmcp` | – | Wrap the above | Handy for giving your LangGraph agents a KAP tool. They all scrape the website. |
| `cahitihac/kap-notifier` | old | Polls every 3 s | README claims "disclosures are updated on KAP every 3 minutes" **[claim, old, unverified]**. |

**Recommendation:** write your own ~150-line `kap_ingest.py` on httpx, using the three endpoints above and keeping full control of rate limits and raw storage. Read kap-client's source as the reference implementation. Pin versions if you import any of these libraries, because they break whenever KAP changes its frontend (KAP moved to Next.js recently, and kap-client parses the RSC payload).

### 1.4 Push, RSS and latency
- **There is no public RSS or push feed [verified]:** `/tr/rss` and `/tr/rss/bildirim` return 404, and `/rss` returns 307 to an HTML page. The only push-like channel is the paid VYK "eş anlı" delivery to licensed distributors (Foreks, Matriks, Bloomberg and similar).
- **Live design:** poll `list/main` or `byCriteria` for *today* every 15 s. Keep `max(disclosureIndex)` as a cursor and emit new rows. Record `first_seen_at` (your wall clock) next to `publishDate`. The difference is your real ingest latency, which you should report in the course paper.
- **Measured latency:** a 25-minute poller (5 s interval) ran on 29.09.2026 from 21:07 TRT, but **no new disclosure appeared after 20:44**, so the lag stays **unmeasured**. The same run also got **empty responses in two bursts (21:25:40–21:26:31 and 21:35:54–21:36:35 TRT)** after roughly 200 requests at a 5 s interval. This could be soft WAF throttling or evening maintenance. Either way, the live poller must treat an empty body as "back off" (for example 60 s, then exponential), not as "no news", and a 15–30 s interval is safer than 5 s. Re-run `poll.py` on a trading day between 09:00 and 19:00. Expected lag is seconds for the website, since the website *is* the publication. Treat the old "3 minutes" figure as unverified.
- **Timing facts for the strategy [verified]:** disclosures arrive throughout the day, and many land **after the 18:00–18:10 close** (on 28.09: 59 at 18:xx, 10 at 19:xx, 7 at 20:xx, 6 at 21:xx, 1 at 22:xx), plus a 10:00 burst dominated by circuit-breaker notices. Evening disclosures therefore trade at the next day's **09:40–10:00 opening auction** (orders 09:40–09:55, uncrossing 09:55–10:00, continuous trading 10:00–18:00, closing auction 18:00–18:10). The "enter at next open" backtest rule applies to them directly.

---

## 2. Historical KAP archive for backtesting

### 2.1 Backfill plan
- Loop `day` from 2009-06-01 to today and call `kap_query(day, day)` once per day. If a day returns ≥ 2000 rows, split it by `disclosureClass` (ODA / FR / DG / DUY) and re-query. About 4,300 business days at 1 request / 2 s takes **about 2.5 hours**. Store each raw JSON response gzipped in `raw_kap_daily/{yyyy}/{mm}/{dd}.json.gz` so you never need to re-hit KAP.
- Volume: the 6 sampled days (2025-10 → 2026-09) held **2,099 rows, about 350 per day**, of which ~28% are "Pay Bazında Devre Kesici Bildirimi" (circuit-breaker noise). 17 years × ~250 days × ~250–350 rows gives roughly **1.0–1.5 M rows**. That is small for Postgres.
- Full text: fetch `/tr/Bildirim/{idx}` **only for the target universe and target subjects**, for example BIST-100 since 2020 and ODA subjects in §2.2. That is on the order of 30–60 k pages, or 17–35 h at 1 request / 2 s. Run it as a resumable background job.
- **Timestamps:** `publishDate` is to the second, in Istanbul local time (UTC+3 all year since 2016). Store it as `timestamptz`. `isLate` / `disclosureDelayStatus` flag delayed disclosures. **Corrections** (`disclosureReason=CORR/UPD/CANC`, `relatedDisclosureIndex`) must be linked, because a correction must not count as a fresh event in a backtest.
- **Survivorship:** query with `memberType: "IGS"` but keep delisted companies. byCriteria has `inactiveMkkMemberOidList`, and the rows keep `kapTitle` even for companies no longer listed.

### 2.2 Subject taxonomy (empirical, 6 sample days, n = 2,099) [verified]

| n | class | subject | Use |
|---|---|---|---|
| 593 | DKB | Pay Bazında Devre Kesici Bildirimi | **Drop as a news event.** Keep as a volatility or price-limit label, since it signals the move rather than causing it. |
| 219 | ODA | **Özel Durum Açıklaması (Genel)** | **LLM classify** (free text: contracts, tenders, lawsuits, M&A…) |
| 166 / 36 | ODA | Pay Dışında Sermaye Piyasası Aracı İşlemlerine İlişkin Bildirim (Faiz İçeren / Faizsiz) | Debt issuance; low signal |
| 72 | ODA (type CA) | **Payların Geri Alınmasına İlişkin Bildirim** | Buyback: structured, positive prior |
| 56 / 53 / 51 | FR | Finansal Rapor / Faaliyet Raporu (Konsolide) / Sorumluluk Beyanı | Earnings. Parse the numbers and compute the surprise vs the prior year. |
| 54 / 8 | ODA | Genel Kurul İşlemlerine İlişkin Bildirim / Genel Kurul Bildirimi | Low signal |
| 50 / 11 | DKB / ODA | **Pay Alım Satım Bildirimi** | Insider or major-holder trades: structured |
| 41 | ODA | Bağımsız Denetim Kuruluşunun Belirlenmesi | Noise |
| 28 | ODA (CA) | **Kar Payı Dağıtım İşlemlerine İlişkin Bildirim** | Dividends; also a price-adjustment input |
| 22 / 14 | ODA (CA) | **Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim** / Kayıtlı Sermaye Tavanı | **Bedelsiz/bedelli**: strong retail-driven price effect on BIST |
| 21 | ODA | Kredi Derecelendirmesi | Rating change |
| 19 | ODA | **Yeni İş İlişkisi** | Contract wins: LLM for size vs market cap |
| 6 | ODA | İlişkili Taraf İşlemleri | |
| 3 | ODA | **Haber ve Söylentilere İlişkin Açıklama** | Rumor response: high signal |
| 2 / 1 | ODA | Finansal Duran Varlık Satışı / Maddi Duran Varlık Alımı | M&A-like |
| 1 | DUY | Sermaye Piyasası Kurulu Tedbir Kararı | SPK sanctions: negative. Ticker is in `relatedStocks`. |
| 1 | ODA | Pay Alım Teklifi Yoluyla Pay Toplanmasına İlişkin Bildirim | Tender offer |
| 1 | ODA | Ortaklık Aleyhine Dava Açılması veya Davaya İlişkin Gelişmeler | Litigation |
| 71 / 40 / 39… | DG | Şirket Genel Bilgi Formu, Kurumsal Yönetim/Sürdürülebilirlik raporları, KFİF formu | Drop from the event stream; useful as RAG context |

Codes seen **[verified]**: `disclosureClass ∈ {ODA, FR, DG, DKB, DUY}` (DKB is a regulator or exchange notice), `disclosureType ∈ {ODA, CA, DG, DUY, FR}`, `disclosureCategory ∈ {ODA, STT, null}`. Note that "Sermaye Artırımı" and "Kar Payı" arrive as `disclosureType=CA` (corporate action) inside class ODA.

### 2.3 Existing datasets (weak, so build your own)
- `zer0dayf/Bist-KAP-Dataset-Builder` (MIT): **manual** text input plus yfinance T+5 labels (±1%). It is not an archive, but its labelling logic is reusable. https://github.com/zer0dayf/Bist-KAP-Dataset-Builder
- Kaggle `agrafintech/*` (audit opinions and balance sheets from KAP, annual) and `gokhankesler/borsa-istanbul-turkish-stock-exchange-dataset` (prices). No minute-timestamped disclosure archive was found on Kaggle or HF.
- HF `ForInvestorg/kap_bir_inference_results`: model outputs, not raw disclosures.
- **Conclusion:** your 2009–2026 KAP archive with second-level timestamps is itself a contribution. Publish the *index* (idx, time, ticker, subject), not the full texts, because of licensing.

---

## 3. BIST prices

### 3.1 Sources compared [verified on THYAO, 29.09.2026]

| Source | Daily history | Intraday history | Live | Adjustments | Caveats |
|---|---|---|---|---|---|
| **yfinance 1.7.0** (`THYAO.IS`) | **2000-05-10 →** (6,785 bars) | 1m: last ~7 days (5d gave 2,405 bars); 5m: 60 days (from 2026-07-08); 1h: 730 days (from 2023-11-09) | **15 min delayed** (Yahoo: "Borsa İstanbul, .IS, 15 min, ICE Data Services") | `Stock Splits` column holds **bedelsiz** ratios (e.g. 2009-06-25 5.0, 2013-06-26 1.15); `Dividends` | Unofficial; last 1m bar 17:59, so the **closing auction 18:00–18:10 is missing** |
| **borsapy 0.11.0** (TradingView WS + İş Yatırım) | 2012-03-08 → (3,650 bars) | **1m: ~2 weeks** (5,788 bars from 2026-09-14, the ~5,000-bar TV limit); 3/5/15/30/45m, 1h, 4h | ~15 min delayed; real time if you log in with your own **TradingView account with a BIST real-time subscription** | `adjust=False` gives unadjusted; `.splits` gives **Capital, RightsIssue (bedelli %), BonusFromCapital, BonusFromDividend (bedelsiz %)**; `.dividends` gives gross/net rate | Includes the 18:09 closing-auction bar. Personal/educational use only. |
| **isyatirimhisse 5.0.1** | Daily, long history | – | – | **Both** `HG_KAPANIS` (unadjusted) and `HGDG_KAPANIS` (adjusted), plus `PD` (mcap), `HAO_PD` (free-float mcap), USD-based prices, index value | Scrapes İş Yatırım; function signature `fetch_stock_data(symbols=[…], start_date="dd-mm-yyyy", end_date=…)` |
| **tvDatafeed** forks (rongardF, shahinsamiur…) | – | 5,000 bars per timeframe | Delayed unless logged in | – | Not on PyPI; install from GitHub; fragile. borsapy wraps the same TradingView WS more robustly. |
| **Algolab (Deniz Yatırım)** | – | `GetCandleData` | Was real-time with depth | – | **Closed 31.12.2025** (README of atillayurtseven/AlgoLab; algolab.com.tr unreachable) |
| Licensed real time (Foreks, Matriks, dxFeed…) | ✓ | ✓ | Real time | ✓ | BIST data distribution contract; paid; overkill for the course |

**Recommendation for the project:**
1. **Backtest:** daily data from `isyatirimhisse` (adjusted and unadjusted) plus corporate actions from `borsapy`. Hourly data from `yfinance` (730 d) to measure intraday reaction to disclosures published 10:00–17:00. Start collecting **your own 1m bars now** with a nightly `borsapy`/`yfinance` job, because free 1m history disappears after 1–2 weeks.
2. **Live paper trading on BIST:** 15-min-delayed quotes plus your own paper-trading simulator, fill at the next available bar + slippage. Be explicit in the report that a 15-minute delay makes intraday reaction trading unrealistic. Daily/overnight (next-open) strategies are fine. Use US (Alpaca) or crypto for the real-time demo.

### 3.2 Corporate-action adjustment (bedelsiz / bedelli / temettü)
- **Bedelsiz** (bonus from capital or from dividend) = split. Factor = 1 + (BonusFromCapital + BonusFromDividend)/100. Example: THYAO 2009-06-25 had 313.77% + 86.23% = 400%, so factor 5.0, which **matches yfinance `Stock Splits` 5.0 [verified]**.
- **Bedelli** (rights issue, `RightsIssue` %) is **not** a pure split. The theoretical ex-rights price is TERP = (P_cum + r·S)/(1 + r), where S is the subscription price (usually 1 TL nominal) and r is the rights ratio. Adjustment factor = TERP/P_cum. yfinance usually does not model this correctly, so compute it yourself from the KAP "Sermaye Artırımı" disclosures and borsapy `.splits`.
- **Temettü:** the backward factor is (P_prev_close − D)/P_prev_close. THYAO paid 3.442 TL gross on 2025-06-16 and again on 2025-09-02 (two instalments; borsapy and yfinance agree **[verified]**).
- **Store unadjusted OHLCV plus a `corporate_actions` table**, and compute adjusted series in a view. Never store only adjusted prices, because adjustments change as new actions arrive and break point-in-time backtests.
- Cross-check `isyatirimhisse` `HGDG_*` (İş Yatırım's own adjusted series) against your computed series as a unit test.

---

## 4. Turkish financial news and macro

### 4.1 RSS feeds [verified 29.09.2026, ~21:00 TRT]

| Feed | URL | Items | Freshness (min → max pubDate) | Notes |
|---|---|---|---|---|
| AA Ekonomi | `https://www.aa.com.tr/tr/rss/default?cat=ekonomi` | 30 | same day, +03:00 | Title + short description + link. AA content is copyrighted, so store headline/summary + link only. Terms **[unverified]**. |
| Dünya | `https://www.dunya.com/rss` | 25–26 | 17:09 → 21:01 same day | Good business coverage |
| **Foreks** | `https://www.foreks.com/rss` | **100** | 28.09 04:28 → 29.09 15:48 UTC | **Company-level market news** (e.g. "Kardemir … satış programını açıkladı", "Gübretaş Maden'de kar dağıtım tarihi"). Has `content:encoded` and `category`. Closest to KAP-derived newswire. |
| Habertürk Ekonomi | `https://www.haberturk.com/rss/ekonomi.xml` | 30 | same day | |
| TRT Haber Ekonomi | `https://www.trthaber.com/ekonomi_articles.rss` | 60 | 5 days | |
| CNBC-e | `https://www.cnbce.com/rss` | 250 | 3 days | High volume |
| Borsagündem | `https://www.borsagundem.com.tr/rss` | 30 | mixed (2024 → today) | Contains old evergreen items, so filter by pubDate. `borsagundem.com/rss` fails. |
| investing.com TR | `https://tr.investing.com/rss/news_25.rss`, `/rss/news.rss` | 10 | – | **Non-RFC pubDate** `"2026-09-29 17:57:20"` (no TZ; assume UTC and verify) |
| Milliyet / Sözcü / NTV Ekonomi | `milliyet.com.tr/rss/rssnew/ekonomirss.xml`, `sozcu.com.tr/feeds-rss-category-ekonomi`, `ntv.com.tr/ekonomi.rss` (Atom) | 20/50/20 | – | General press |
| **Bloomberg HT** | `https://www.bloomberght.com/rss` | 20 | **newest 14.09.2026 → stale** | Don't rely on it. `/rss/ekonomi` is 404 and `/rss/piyasalar` is 504. Use HTML scraping of `/tumhaberler` only if needed. |
| Ekonomim | `/rss`, `/export/rss` | – | – | **Connection failed from here** (timeouts). Retest. |
| Bigpara, Paraanaliz | – | – | 404 | |

Use `feedparser 6.0.14` for parsing (handles RSS and Atom) and `trafilatura 2.2.0` for article body extraction where the terms allow. For the course, store **headline + summary + URL + timestamps**. Fetch full text only transiently for LLM analysis and don't republish it.

### 4.2 Deduplication (same story across AA, Dünya, Foreks, and KAP itself)
1. **Exact:** `url_canonical` (strip utm_*, AMP, and trailing slashes) plus `sha256(tr_normalize(title))`.
2. **Near-duplicate:** MinHash LSH on character 5-shingles of `tr_normalize(title + summary)` (`datasketch 2.0.0`, Jaccard ≥ 0.8), or cosine ≥ 0.92 on bge-m3 embeddings within a ±24 h window.
3. **KAP linkage:** many news items are rewrites of KAP disclosures ("KAP'a yaptığı açıklamaya göre…"). Link a news item to a disclosure if the ticker matches and |Δt| < 6 h, then keep the KAP timestamp as `event_time`. **The KAP timestamp is the ground-truth event time. News is always later.**
4. Cluster table: `news_clusters(cluster_id, first_seen_at, canonical_article_id)`. The first article in a cluster defines "news time".

### 4.3 TCMB EVDS (macro)
- **EVDS moved to EVDS3 (late 2025) [verified]:** `https://evds2.tcmb.gov.tr/service/evds/...` now 302-redirects to `https://evds3.tcmb.gov.tr/`. The REST prefix is `/igmevdsms-dis/` with path-style params (`/series=TP.DK.USD.A&startDate=…&type=json`) and the API key sent as the HTTP header **`key`** (borsapy source). Get a free key at evds3.tcmb.gov.tr → BENİM SAYFAM.
- Clients: `evds 0.4.0` (2026-02-16, fatihmete, updated for v3), `evdspy 2.0.6` (2026-07-07), or `borsapy.evds_series("TP.DK.USD.A.YTL", period="1y")`. Limits reported by the SPA config: `MAX_SERIE_COUNT=400`, `MAX_GRID_COUNT=900` rows.
- Series to pull: USD/TRY (`TP.DK.USD.A.YTL`), CPI (`TP.FG.J0`), policy rate, CDS proxies. Macro event times such as TCMB rate decisions (14:00 TRT) and TÜİK CPI (10:00 TRT) belong in `events` as scheduled events.

---

## 5. Turkish NLP

### 5.1 LLM for disclosure classification and extraction
- **Most classification is free:** KAP's `subject` already types about 90% of rows (§2.2). The LLM job is narrow:
  (a) sub-type "Özel Durum Açıklaması (Genel)" and "Yeni İş İlişkisi" into {contract/tender, M&A, litigation, capacity/investment, guidance, management change, regulatory, other};
  (b) extract **amount, currency, counterparty, and amount / market cap** (materiality);
  (c) direction and confidence.
  Use structured JSON output with a fixed enum schema.
- **Evidence on Turkish ability (no KAP-specific benchmark exists):**
  - **TurkBench** (arXiv 2601.07020, open-weight only): gpt-oss-120b 78.6, GLM-4.6 76.9, DeepSeek-V3.1 75.2, **Qwen3-Next-80B-Inst 75.0, Qwen3-30B-A3B-Inst 73.4, gemma-3-27b-it 73.0**, gemma-3-12b-it 71.0, Qwen2.5-14B 66.5. Models still struggle with idioms and culture-bound items, which matters less for formal KAP language.
  - **Turkish document QA on a 6 GB GPU** (arXiv 2609.28007, 23 Sep 2026): **Trendyol-LLM-8B-T1 75%**, Qwen2.5-7B 65%, Cosmos-TR-8B 54%, Mistral-7B 51%, Kocdigital-8B 49%. Qwen2.5 was about 14× faster (1.7 s vs 23.9 s per question) and best at abstention (19/20).
  - **Cetvel** (EACL 2026) and **TurkishMMLU** are the standard suites. The original TurkishMMLU paper's leader was GPT-4o at 83.1 (old models). No verified 2026 numbers for Gemini/Claude/GPT-5-class models on TurkishMMLU were found. Frontier API models are generally assumed strong in Turkish, but **validate this yourself**.
- **Recommendation:**
  - Primary: a cheap frontier API model (Gemini Flash-tier, Claude Haiku-tier or GPT mini-tier) in JSON mode, with batch calls because volume is only ~20–60 ODA-Genel items per day.
  - Offline or free: **Qwen3-30B-A3B-Instruct** (MoE, fast) or **gemma-3-27b-it** via Ollama/vLLM; **Trendyol-LLM-8B-T1** if you only have a laptop GPU.
  - **Build a 200-item gold set** (hand-labelled ODA-Genel) and report per-class F1 per model. This is a small evaluation contribution for the course.
  - Many KAP disclosures ship an English version (`hasMultiLanguageSupport`, and the "Explanations" block after the Turkish text). Classify on the Turkish text as the legally binding version, and keep the English text for a cross-check.
- **Look-ahead risk:** LLMs may "remember" 2023–2025 price reactions. Backtest on post-cutoff dates or mask ticker and company names.

### 5.2 Embedding model for pgvector

**TR-MTEB** (Baysan et al., Findings EMNLP 2025, 26 datasets; Table 2), Mean(Task) / Retrieval:

| Model | Dim | Mean(Task) | Retrieval |
|---|---|---|---|
| multilingual-e5-large | 1024 | **66.82** | 60.62 |
| text-embedding-3-small (OpenAI) | 1536 | 66.61 | **64.99** |
| multilingual-e5-large-instruct | 1024 | 65.92 | 57.21 |
| gte-multilingual-base | 768 | 64.49 | 57.51 |
| multilingual-e5-base | 768 | 64.26 | 58.29 |
| trmteb/turkish-embedding-model-fine-tuned | 768 | 63.42 | 52.75 |
| LaBSE | 768 | 57.60 | 46.47 |

- **bge-m3 is not in that table.** A search snippet attributed per-task scores to it, but they were not verified in the paper.
- A 2026 follow-up (arXiv 2605.29992, different aggregation) reports text-embedding-3-small 66.5 avg / 78.1 retrieval, turkish-e5-large 66.0 / 77.0, me5-large-instruct 65.9 / 76.1, embeddinggemma-300m 65.2 / 75.9, gte-multilingual-base 64.4 / 75.2.
- **The e5 family has a 512-token limit.** Turkish is token-hungry and KAP texts often run to 1–3 k tokens, so you would need aggressive chunking.
- **Decision:**
  1. **Default: `BAAI/bge-m3`**: 1024-d, 8192 context, strong multilingual retrieval, and it also emits sparse lexical weights. Fits `vector(1024)` with HNSW (pgvector's HNSW limit is 2000 dims for `vector`).
  2. Challenger: `intfloat/multilingual-e5-large-instruct`, with "query: "/"passage: " style prefixes and ≤ 512-token chunks.
  3. **Hybrid is mandatory**: the Sept-2026 Turkish RAG study found **character TF-IDF was not significantly beaten** by BM25, E5 or hybrids (evidence recall 57% vs 59–65%, McNemar p > 0.05). Add Postgres `to_tsvector('turkish', …)` (Snowball Turkish stemmer) plus `pg_trgm` on a normalized text column, and fuse with RRF.
  4. Evaluate on your own 100 query→disclosure pairs (e.g. "THYAO yeni uçak siparişi" → correct idx) and report recall@10.

### 5.3 Turkish text pitfalls [verified in Python 3.11 on this machine]
```python
>>> "İSTANBUL IĞDIR ŞİRKET".lower()
'i̇stanbul iğdir şi̇rket'          # 'İ' -> 'i' + U+0307 (combining dot); 'I' -> 'i' (should be 'ı'); length 21 -> 23!
>>> "ı".upper(), "i".upper()
('I', 'I')                          # round-trip destroyed
def tr_lower(s: str) -> str:        # use for matching/dedup keys
    return s.replace("I", "ı").replace("İ", "i").lower()
>>> tr_lower("İSTANBUL IĞDIR ŞİRKET")
'istanbul ığdır şirket'
```
- **Casefolding:** never use `str.lower()`/`casefold()` for Turkish keys. Use `tr_lower` or PyICU `icu.UnicodeString(s).toLower(icu.Locale("tr"))`. In Postgres, use an ICU collation: `CREATE COLLATION tr_ci (provider = icu, locale = 'tr-TR-u-ks-level2', deterministic = false);` for case-insensitive comparisons, and `lower(x COLLATE "tr-TR-x-icu")`.
- **Tickers are ASCII** (THYAO, EBEBK), but company titles contain İ/Ş/Ğ ("ECZACIBAŞI YATIRIM HOLDİNG"). **Join on ticker or KAP member OID, never on title.**
- **Encoding:** KAP JSON is UTF-8, but the KAP error page declares `iso-8859-9`. Older attachments, CSVs and Excel exports may be **cp1254/ISO-8859-9**, where `"Özel Durum Açıklaması".encode("cp1254")` gives `b'\xd6zel Durum A\xe7\xfdklamas\xfd'`. On **Windows the console is cp1254**: our own first test printed mojibake ("�zel Durum A��klamas�"). **Always set `PYTHONIOENCODING=utf-8`** (or `python -X utf8`) and open files with `encoding="utf-8"`.
- **Unicode normalization:** apply NFC to everything (`unicodedata.normalize("NFC", s)`). A decomposed `s + U+0327` is not equal to `ş`.
- **Numbers and dates:** Turkish uses `1.234.567,89` and `dd.MM.yyyy`. KAP uses both `dd.MM.yyyy HH:mm:ss` (byCriteria, list/main) and `yyyy.MM.dd HH:mm:ss` (the detail payload), so parse with explicit formats.
- **Tokenization:** Turkish agglutination inflates token counts (~1.5–2× English) for LLM cost and chunk sizing. Budget for it.

---

## 6. Pipeline architecture

```
                ┌──────────────── INGESTION (async workers, APScheduler/cron) ─────────────────┐
 kap.org.tr ──► kap_poller (15 s, cursor=max idx) ─┐                                           │
 kap.org.tr ──► kap_backfill (1 day/req, 2 s)  ────┤─► raw_kap (jsonb, gz on disk)             │
 kap.org.tr ──► kap_detail_fetcher (queue, 2 s) ───┘─► raw_kap_detail (html/rsc payload)       │
 RSS (8 feeds)► news_poller (60–120 s, ETag/If-Modified-Since) ─► raw_news                     │
 yfinance/borsapy/isyatirim ► price_jobs (EOD 18:30, 1m nightly, CA weekly) ─► raw_prices      │
 EVDS3 ───────► macro_job (daily) ─► macro_series                                               │
                └──────────────────────────────────────────────────────────────────────────────┘
                                          │
                ┌──────── NORMALIZATION (idempotent, pure functions, unit-tested) ────────┐
                │ • parse dates → timestamptz (Europe/Istanbul) • NFC + tr_lower keys     │
                │ • ticker/OID resolution via companies table • CORR/UPD/CANC linking    │
                │ • drop noise subjects (Devre Kesici…) → flagged, not deleted           │
                │ • news: canonical URL, MinHash dedup, KAP linkage (ticker, |Δt|<6h)    │
                │ • prices: unadjusted OHLCV + corporate_actions → adjusted view         │
                └──────────────────────────────────────────────────────────────────────────┘
                                          │
                ┌──────── CLASSIFICATION / ENRICHMENT ────────┐
                │ 1. rule map: subject → event_type (§2.2)    │
                │ 2. LLM (JSON schema) only for ODA-Genel,    │
                │    Yeni İş İlişkisi, Haber/Söylenti, FR     │
                │ 3. materiality = amount / market cap         │
                │ 4. chunk + embed (bge-m3) → embeddings      │
                └──────────────────────────────────────────────┘
                                          │
                     Postgres 16 + pgvector (+ pg_trgm, ICU)  ◄── LangGraph agents (retrieval with
                                          │                        WHERE available_at <= decision_time)
                                   events table ──► signal/backtest engine (next-open entry)
```

Design rules:
- **Point-in-time everywhere.** Every row carries `published_at` (source time), `first_seen_at` (our ingest time), and `available_at = coalesce(first_seen_at, published_at + interval '60 seconds')`. Backtests and RAG filter on `available_at <= :decision_time`.
- **Raw is immutable.** Normalization is re-runnable from `raw_*`.
- **One writer per table**, with an idempotent upsert on natural keys (`disclosure_index`, `(ticker, ts, interval)`, `url_hash`).

## 7. Postgres schema sketch

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE COLLATION IF NOT EXISTS tr_ci (provider = icu, locale = 'tr-TR-u-ks-level2', deterministic = false);

CREATE TABLE companies (
  company_id      serial PRIMARY KEY,
  kap_member_oid  text UNIQUE,              -- 32-hex OID from KAP website
  kap_member_id   int  UNIQUE,              -- numeric id from VYK API (members.id)
  title           text NOT NULL,
  member_type     text,                     -- IGS, IGMS, YK, ...
  sector          text,
  is_active       boolean NOT NULL DEFAULT true,
  listed_from     date, delisted_on date
);
CREATE TABLE tickers (                       -- a company can have several codes over time
  ticker      text NOT NULL,                 -- 'THYAO' (ASCII)
  company_id  int  NOT NULL REFERENCES companies,
  isin        text,
  valid_from  date NOT NULL, valid_to date,
  PRIMARY KEY (ticker, valid_from)
);

CREATE TABLE disclosures (
  disclosure_index   bigint PRIMARY KEY,      -- KAP monotonic id
  disclosure_oid     text UNIQUE,             -- disclosureId (32-hex)
  company_id         int REFERENCES companies,
  stock_codes        text[],                  -- from stockCodes (split on ',')
  related_stocks     text[],
  disclosure_class   text NOT NULL,           -- ODA|FR|DG|DKB|DUY
  disclosure_type    text,                    -- ODA|CA|DG|DUY|FR|FON
  disclosure_category text,                   -- ODA|STT|null
  subject            text NOT NULL,
  summary            text,
  reason             text,                    -- NEW|UPD|CORR|CANC (VYK) / modifyStatus
  related_index      bigint,                  -- no FK: target may be outside ingested universe
  is_late            boolean,
  fin_year           int, fin_period text,    -- FR only
  attachment_count   int,
  published_at       timestamptz NOT NULL,    -- publishDate, Europe/Istanbul
  first_seen_at      timestamptz,             -- live poller clock; NULL for backfill
  available_at       timestamptz NOT NULL,    -- set by app: coalesce(first_seen_at, published_at + 60 s)
                                              -- (not a generated column: timestamptz + interval is not IMMUTABLE)
  body_tr            text, body_en text,      -- extracted text (filtered subset)
  raw                jsonb NOT NULL,
  is_noise           boolean NOT NULL DEFAULT false,  -- e.g. Devre Kesici
  tsv                tsvector GENERATED ALWAYS AS
                       (to_tsvector('turkish', coalesce(subject,'')||' '||coalesce(summary,'')||' '||coalesce(body_tr,''))) STORED
);
CREATE INDEX ON disclosures (published_at);
CREATE INDEX ON disclosures USING gin (stock_codes);
CREATE INDEX ON disclosures (subject);
CREATE INDEX ON disclosures USING gin (tsv);

CREATE TABLE news_articles (
  article_id     bigserial PRIMARY KEY,
  source         text NOT NULL,              -- 'aa','dunya','foreks',...
  url_canonical  text NOT NULL UNIQUE,
  title          text NOT NULL,
  summary        text,
  title_key      text NOT NULL,              -- tr_lower + NFC + punctuation stripped
  published_at   timestamptz,                -- feed pubDate (TZ-fixed)
  first_seen_at  timestamptz NOT NULL,
  cluster_id     bigint,                     -- near-dup cluster
  linked_disclosure bigint REFERENCES disclosures,
  tickers        text[],
  raw            jsonb
);
CREATE INDEX ON news_articles USING gin (title_key gin_trgm_ops);

CREATE TABLE prices_daily (
  ticker text NOT NULL, d date NOT NULL,
  open numeric, high numeric, low numeric, close numeric, volume numeric,  -- UNADJUSTED
  source text NOT NULL, PRIMARY KEY (ticker, d, source)
);
CREATE TABLE prices_intraday (
  ticker text NOT NULL, ts timestamptz NOT NULL, interval text NOT NULL,   -- '1m','5m','1h'
  open numeric, high numeric, low numeric, close numeric, volume numeric,
  source text NOT NULL, PRIMARY KEY (ticker, ts, interval, source)
);                                            -- consider TimescaleDB hypertable later
CREATE TABLE corporate_actions (
  ticker text NOT NULL, ex_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bedelsiz','bedelli','temettu','split','other')),
  bonus_pct numeric, rights_pct numeric, subscription_price numeric,
  cash_gross numeric, cash_net numeric,
  factor numeric,                               -- multiplicative back-adjustment factor
  source_disclosure bigint REFERENCES disclosures,
  PRIMARY KEY (ticker, ex_date, kind)
);

CREATE TABLE events (                            -- normalized, strategy-facing
  event_id       bigserial PRIMARY KEY,
  source_kind    text NOT NULL CHECK (source_kind IN ('kap','news','macro')),
  disclosure_index bigint REFERENCES disclosures,
  article_id     bigint REFERENCES news_articles,
  ticker         text,
  event_type     text NOT NULL,                  -- buyback, bonus_issue, rights_issue, dividend, contract,
                                                 -- earnings, insider_trade, rumor_response, sanction, ...
  direction      smallint CHECK (direction IN (-1,0,1)),
  materiality    numeric,                        -- amount / mcap
  confidence     numeric,
  extracted      jsonb,                          -- LLM JSON (amount, currency, counterparty…)
  classifier     text NOT NULL,                  -- 'rule:v1' | 'llm:model@prompt_v3'
  event_time     timestamptz NOT NULL,           -- = KAP published_at when linked
  available_at   timestamptz NOT NULL
);
CREATE INDEX ON events (ticker, event_time);

CREATE TABLE embeddings (
  chunk_id     bigserial PRIMARY KEY,
  doc_kind     text NOT NULL,                    -- 'disclosure','news','report'
  doc_id       bigint NOT NULL,
  chunk_no     int NOT NULL,
  content      text NOT NULL,
  model        text NOT NULL,                    -- 'bge-m3'
  embedding    vector(1024) NOT NULL,
  ticker       text, available_at timestamptz NOT NULL,
  UNIQUE (doc_kind, doc_id, chunk_no, model)
);
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON embeddings (ticker, available_at);

CREATE TABLE macro_series (series_code text, d date, value numeric, PRIMARY KEY (series_code, d));
CREATE TABLE ingestion_log (job text, started_at timestamptz, finished_at timestamptz,
                            rows int, status text, error text);
```
Point-in-time retrieval example:
```sql
SELECT content, doc_id FROM embeddings
WHERE ticker = $1 AND available_at <= $2          -- decision time
ORDER BY embedding <=> $3 LIMIT 10;
```

## 8. Week-1 setup checklist

**Day 1: accounts and environment**
- [ ] Register at **apiportal.mkk.com.tr** → activate by e-mail → create an Application (API key) → subscribe to "KAP Data Dissemination Services" (free, 6 calls/min). Pull `lastDisclosureIndex` and one `disclosureDetail?fileType=data` from the sandbox, and save the JSON as a schema fixture.
- [ ] Get an **EVDS3** key (evds3.tcmb.gov.tr → BENİM SAYFAM) and store it in `.env` as `EVDS_API_KEY`.
- [ ] Python 3.11+ venv: `httpx pydantic feedparser trafilatura datasketch yfinance borsapy isyatirimhisse evds psycopg[binary] pgvector sentence-transformers apscheduler`. On Windows, set `PYTHONIOENCODING=utf-8` system-wide.
- [ ] Postgres 16 + pgvector (Docker `pgvector/pgvector:pg16`), with `pg_trgm` and an ICU build (check `SELECT * FROM pg_collation WHERE collname LIKE 'tr%';`). Apply the §7 DDL via Alembic migration 001.

**Day 2: KAP ingestion**
- [ ] `kap_ingest.py`: `kap_query(day)` and the `list/main` poller with a `max(disclosure_index)` cursor, 15 s interval, jitter, 429/5xx backoff, and raw gz dump. Unit tests with the saved fixtures (1 day, the 2000-cap case, a CORR row).
- [ ] Start **backfill 2009-06-01 → today** in the background (1 request / 2 s, resumable via `ingestion_log`).
- [ ] Run the live poller during trading hours and **log `first_seen_at − published_at`**. That is your latency result.

**Day 3: prices and corporate actions**
- [ ] Load the BIST-100 universe (+ delisted) from the KAP company list. Store daily unadjusted prices (`isyatirimhisse` HG_* and yfinance cross-check) and borsapy `.splits`/`.dividends` → `corporate_actions` with computed factors. Add a unit test that THYAO 2009-06-25 has factor 5.0.
- [ ] Nightly job: store the last day of **1m bars** (borsapy) and **1h bars** (yfinance), because free history expires.

**Day 4: news and macro**
- [ ] RSS poller for the 8 working feeds (§4.1). Handle investing.com's non-RFC date. Canonical URL, `title_key`, MinHash dedup, KAP linkage.
- [ ] EVDS3 daily job: USD/TRY, CPI, policy rate. Add the scheduled macro calendar to `events`.

**Day 5: classification and embeddings**
- [ ] `subject → event_type` rule map (§2.2) as a versioned YAML file. Mark `is_noise` for Devre Kesici and similar subjects.
- [ ] Hand-label a **200-item gold set** of ODA-Genel disclosures. Run 2 LLMs (one API, one local Qwen3/Gemma) with a JSON schema and record F1.
- [ ] Embed the filtered disclosures with bge-m3 into `embeddings`. Build 50 test queries and compare vector-only vs vector+FTS+trigram RRF recall@10.

**Day 6–7: first event study (sanity check before any agent work)**
- [ ] For buybacks, bedelsiz announcements and "Yeni İş İlişkisi", 2020–2025: next-open → close and T+5 abnormal returns vs XU100, split by publication time (in session vs after 18:10).
- [ ] Write down the data caveats: 15-min delay, unofficial endpoints, LLM memorization, and survivorship handling.

---

## 9. Open questions / to re-verify
1. Real-world KAP website lag (`first_seen_at − publishDate`) on a trading day. The run here produced no new disclosures in the window.
2. Whether the MKK portal "Free: 6 calls/min" plan eventually exposes **live** data or only the frozen test slice. The docs say test data is historical. Ask kapdestek@mkk.com.tr about academic access to production VYK.
3. Ekonomim RSS reachability, and AA/Foreks RSS terms of use for storing text.
4. bge-m3's exact TR-MTEB numbers (run `mteb` with the TR tasks yourself, since it's cheap).
5. KAP website rate-limit thresholds (no 429 seen at about 1 request/second).

## Sources
- MKK API Portal (product page, FAQ, "How it works"): https://apiportal.mkk.com.tr/ · https://apiportal.mkk.com.tr/products · https://apiportal.mkk.com.tr/faq
- MKK launch news (13 Jan 2025): https://www.mkk.com.tr/haberler/mkk-api-portal-yayinda
- KAP VYK REST integration PDF: https://kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873
- kap-go (official VYK schema doc; module via Go proxy): https://pkg.go.dev/github.com/knckknckknck/kap-go
- kap-client: https://github.com/semudu/kap-client · https://pypi.org/project/kap-client/
- pykap: https://github.com/cemsinano/pykap · kap_sdk: https://github.com/enciyo/kap-tr-sdk · https://pypi.org/project/kap_sdk/
- borsapy: https://github.com/saidsurucu/borsapy · borsa-mcp: https://github.com/saidsurucu/borsa-mcp
- kap-notifier: https://github.com/cahitihac/kap-notifier
- KAP query UI: https://www.kap.org.tr/tr/bildirim-sorgu
- isyatirimhisse: https://github.com/urazakgul/isyatirimhisse
- tvdatafeed forks: https://github.com/rongardF/tvdatafeed
- Yahoo exchange delays: https://help.yahoo.com/kb/SLN2310.html
- Algolab closure: https://github.com/atillayurtseven/AlgoLab
- BIST data products / FAQ: https://www.borsaistanbul.com/veriler/veri-yayini/veri-yayin-urunleri · https://www.borsaistanbul.com/sss/veri-endeks-yayini-ve-satisi
- BIST trading hours: https://www.borsaistanbul.com/en/trading-hours
- TCMB EVDS3: https://evds3.tcmb.gov.tr/ · evds client: https://github.com/fatihmete/evds · https://pypi.org/project/evdspy/
- TR-MTEB: https://aclanthology.org/2025.findings-emnlp.471/ · https://huggingface.co/trmteb · https://github.com/selmanbaysan/mteb_tr
- Tokenizer-surgery Turkish embeddings: https://arxiv.org/html/2605.29992
- Turkish domain-document LLM/RAG eval (Sep 2026): https://arxiv.org/abs/2609.28007
- TurkBench: https://arxiv.org/html/2601.07020v1 · Cetvel: https://github.com/KUIS-AI/cetvel · TurkishMMLU: https://arxiv.org/pdf/2407.12402
- Datasets: https://github.com/zer0dayf/Bist-KAP-Dataset-Builder · https://www.kaggle.com/datasets/agrafintech/financial-data-of-turkish-public-companies · https://huggingface.co/datasets/ForInvestorg/kap_bir_inference_results
- RSS endpoints: see the table in §4.1 (all probed live on 29.09.2026)
