# KAPtan — Nihai Proje Tanımı

> **Not:** Güncel ve geçerli bilgiler için `05-proje-dokumanlari/_KANONIK-KARARLAR.md` → **Revizyon 3** (30.09.2026); çelişki varsa o geçerlidir.

> BIST'teki her KAP bildirimini yapılandırılmış bir olaya çeviren, her işlem fikrini geçmiş veriden kanıtla destekleyen, kararı LLM'e değil kurallara bıraktıran ve her öneriyi uyum ajanı + risk kapısı + insan onayından geçiren çok ajanlı yatırım masası.

- Hazırlanma: 29.09.2026 · 3 araştırma turu, 13 araştırma ajanı
- Ders: SENG 429 Enterprise Application Development Lab — Dr. Bilgin Avenoğlu
- Alternatif isimler: Bildirim Masası, Nöbetçi, Teyit

---

## 1. Neden bu fikir? (araştırmanın 5 ana sonucu)

1. **LLM'in serbestçe al-sat kararı vermesi işe yaramıyor.** FINSABER (KDD 2026) bunu doğruluyor; StockBench'te çoğu model al-tut'u geçemedi (bazıları geçti). Alpha Arena 1.5 (gerçek para, iki haftalık; 32 hesaptan 6'sı kârda, toplam %-35 — rakam ikincil kaynaktan) yalnızca destekleyici, zayıf kanıttır. → **LLM sınıflandırıcı olur, kararı kurallar verir.**
2. **Basit haberler saniyeler içinde fiyatlanıyor.** BIST'te de fiyat tepkisi duyurudan sonra saniyeler içinde başlıyor (Ersan vd. 2021, 300 sn'lik pencere). 15–60 sn'de karar veren bir sistem bunlara yetişemez. Kazanç şansı **yavaş fiyatlanan, okuması zor bilgilerde** kalıyor.
3. **BIST'te bu tür bilgiler olabilir.** Ünal (2022): BIST-100 şirketlerinde (2015–2020, 711 geri alım) geri alımdan sonra endekse göre fazla getiri **1 ayda +%2,0, 3 ayda +%3,4** — ama **işlem tarihinden** ölçülmüş (bildirim tarihinden değil), maliyetsiz, basit t-testi, 2021 öncesi rejim; yönetici alımlarında n = 89. Yayından sonra anomaliler ~%58 zayıflıyor (McLean & Pontiff) → literatür rakamları üst sınırdır. E3 (yeni iş/ihale) için BIST'e özgü kanıt yok; **keşifsel** olay türüdür.
4. **BIST + KAP alanı GitHub'da boş.** TradingAgents (109k★) ve benzerleri ABD odaklı; KAP bildirimini karar + uyum + onay + denetim zincirine bağlayan proje yok. Eski "Kurul" fikri klon gibi görünürdü.
5. **Canlı demo mümkün.** Ders saatinde (Pzt 13:20–16:10) BIST açık, ABD kapalı. 1 Ekim 2026'dan itibaren bildirimler TR+EN eşzamanlı yayınlanıyor.

## 2. Hedef kullanıcı (enterprise persona)

**Portföy yönetim şirketinde fon yöneticisi.** Günde ~350 KAP bildirimi (şimdi iki dilde) geliyor. Önemli olanları kaçırmamalı, gürültüyü elemeli ve SPK denetçisine her kararın gerekçesini gösterebilmeli.

**Kişisel mod:** Sen. Sistem sana emir fişi hazırlar, sen kendi aracı kurum uygulamandan girersin.

## 3. Strateji (kanıta dayalı, yalnızca alım)

LLM bildirimi okur ve sınıflandırır; **al/sat kararını deterministik kural motoru verir.**

| Kod | Olay türü | Şart | Elde tutma |
|---|---|---|---|
| **E1** | Pay geri alım **işlemleri** (duyuru değil, gerçekleşen alım) | 10 seansta ≥ sermayenin %0,25'i, kümelenmiş | 20–40 gün |
| **E2** | Yönetici / ana ortak piyasadan alımı | Küme halinde, özellikle düşüş sonrası | 20–60 gün |
| **E3** | Yeni iş ilişkisi / ihale | **Önemli olmalı:** tutar ≥ yıllık gelirin %10'u, bağlayıcı, ilişkili taraf değil | 5 gün |
| **E4** | Finansal sonuç | Tam raporun okunması (enflasyon muhasebesi dahil) + rapor dili | 5–10 gün |

**Sadece çıkış/kaçınma filtresi olarak kullanılanlar:** SPK tedbirleri, volatilite bazlı tedbirler, bedelsiz sermaye artırımı heyecanı, sulandırıcı bedelli sermaye artırımı.

**Giriş:** Ertesi açılış veya seans içi. Son 5 seansta hisse zaten >%8 yükseldiyse **atla ya da yarıya indir** (bilgi sızmış olabilir).

**Pozisyon büyüklüğü:** İşlem başına sermayenin %0,5'i risk, pozisyon başına ≤%10, aynı anda 8–10 pozisyon, hissenin günlük işlem hacminin ≤%1'i. Kriz dönemi → maruziyet yarıya.

**Evren filtresi:** Likidite ve halka açıklık oranı alt sınırı zorunlu (Eylül 2026: 7 portföy şirketinin 131 fonunun tasfiyesi, düşük halka açık hisselerde manipülasyon).

**Gerçekçi beklenti:** En iyi gruplarda işlem başına maliyet öncesi +%0,5–2 anormal getiri. Yıllık BIST-100'e göre **0 ile +%5 arası; sıfır da olabilir.** Maliyet sonrası kalıcı pozitif anormal getiri olasılığı kabaca **%20–35**; sıfır veya negatif sonuç da geçerli bir bulgudur. Bu yüzden önce kendi verinle doğrulanacak.

## 4. Ajanlar (LangGraph)

```
KAP poller (≥30 sn)   ─┐
RSS (AA, Dünya, Foreks)─┼─► Normalize + dedup ─► Redis Stream
                        │
                        ▼
  [Sınıflandırıcı ajan]  KAP `subject` alanı ~%90'ı zaten tipliyor;
                         LLM yalnızca "Özel Durum Açıklaması (Genel)" ve serbest metinler için
                        │  (E1–E4 dışı → sadece arşivle)
                        ▼
  Paralel (Send fan-out):
   ├─ [Okuyucu ajan]     Tam bildirim + PDF ekleri → yapılandırılmış olay (tutar, taraf, süre)
   ├─ [Önemlilik ajanı]  Şirketin finansallarından tutar/gelir oranı (araç: SQL)
   └─ [Kanıt ajanı]      RAG: benzer geçmiş olaylar + gerçekleşen getirileri → kanıt kartı
                        │
                        ▼
  [Şüpheci ajan]         Yanlış pozitifleri avlar, büyüklüğü küçültebilir veya veto eder
                        │
                        ▼
  [Kural motoru]         Deterministik Python: E1–E4 kuralları → TradeProposal (Pydantic)
                        │
                        ▼
  [Uyum ajanı]           SPK tedbir listesi, piyasa bozucu eylem kuralları, prompt-injection kontrolü
                        │
                        ▼
  [RİSK KAPISI]          Düz Python, %100 test kapsamı; sadece küçültür/reddeder
                        │
                        ▼
  interrupt() ─► Risk Officer onayı (web kartı)
                        │
                        ▼
  Broker adapter:  SimBIST (paper) | Alpaca (paper) | Emir fişi (kişisel, manuel) | BtcTurk (opsiyonel)
                        │
                        ▼
  Portföy + hafıza + hash zincirli audit log
```

**Temel ilke:** LLM hiçbir zaman "al/sat" demez. Ablation deneyi bunu kanıtlar: *"serbest karar veren LLM" vs "sınıflandırıcı LLM + kurallar"* → projenin **araştırma iddiası**.

## 5. RAG — üç ayrı bilgi tabanı (pgvector)

| Taban | İçerik | Kullanan ajan |
|---|---|---|
| **Bildirim arşivi** | 2018–2026 KAP bildirimleri (TR+EN), PDF ekleri, finansal rapor metinleri | Okuyucu, Önemlilik |
| **Olay hafızası** | Her geçmiş olay: özet embedding + metadata olarak 1/5/20/60 günlük anormal getiri | Kanıt, Şüpheci |
| **Kural ve mevzuat** | SPK tebliğleri (II-15.1 özel durumlar, II-22.1 geri alım), piyasa bozucu eylemler, şirketin risk politikası | Uyum |

- Her aramada `published_at < karar_anı` filtresi (geleceğe bakış yok).
- Hibrit arama: bge-m3 dense + Postgres `turkish` full-text + trigram. (Eylül 2026 çalışması: Türkçede BM25, dense ve hibrit arasında anlamlı fark bulunmadı — dense'in açık üstünlüğü yok → hibrit dayanıklılık için korunur.)
- Chroma ile karşılaştırma notebook'u (dersteki vektör DB konusu için).

## 6. Veri hattı (doğrulanmış)

| Kaynak | Nasıl | Not |
|---|---|---|
| **KAP canlı** | kap.org.tr JSON uçları (`POST /tr/api/disclosure/list/main`, `members/byCriteria`), seans içi ≥ 30 sn polling, kendi "ilk görülme" zamanımızı kaydet | **30.09.2026'da canlı denendi, çalışıyor** (anahtarsız, 0,2–0,5 sn). MKK WAF'ı var (HTTP 666 = geri çekil); tarayıcı User-Agent + `Origin`/`Referer`. Otomatik çekme için açık izin/yasak metni bulunamadı |
| **KAP geçmiş** | Aynı uçlar, gün gün (yanıt başına maks. 2000 satır), 2009'dan beri | Geçmiş tarih sorgusu doğrulandı (2020 dahil); backfill ≥ 2 sn/istek |
| **KAP tam metin** | `/tr/Bildirim/{idx}` sayfaları + `/tr/api/BildirimPdf/{idx}` (PDF) | TR + EN metin; ayrıştırıcı bildirim tipine göre değişir |
| MKK API Portal | **Yalnızca sandbox** (donmuş ~2023 verisi, 6 çağrı/dk) | Canlı erişim BİST veri sözleşmesi ister; akademik erişim için kapdestek@mkk.com.tr'ye sor |
| **Kütüphane** | **Kendi httpx istemcimiz (`kap_client.py`)**, `borsapy` 0.11.0 (fiyat/kurumsal işlem) | `kap-client` 1.2.0 BIST hisselerinde `CompanyNotFoundError` veriyor → yalnızca kaynak kodu referansı |
| **Fiyat** | yfinance (düzeltilmiş kapanış, 2018'den eksiksiz), **İş Yatırım (ham `HG_KAPANIS` + düzeltilmiş `HGDG_KAPANIS`, `SERMAYE`, `PD`)**, borsapy (kurumsal işlemler) | yfinance ham fiyat vermez → SimBIST dolumları ve fiyat bandı ham fiyatla; borsadan çıkanlar için İş Yatırım. 15 dk gecikmeli → strateji zaten ertesi açılış |
| **Haber RSS** | AA, Dünya, Foreks, Habertürk, TRT Haber, CNBC-e, Borsagündem | **Bloomberg HT RSS 14 Eylül'den beri güncellenmiyor** |
| **Makro** | TCMB EVDS → artık evds3, `evds` ≥0.4.0 | |

Gürültü: günlük ~270–350 bildirimin ~%20–28'i devre kesici bildirimi → baştan ele.

Yıllık aday sayıları (canlı örneklem, ≈): gerçekleşen geri alım ~1.100 · yönetici/ana ortak pay alım satım ~2.000 · Yeni İş İlişkisi ~600 · İhale ~385. Bildirim ≠ bağımsız olay (geri alımlar az sayıda şirkette ve düşüş günlerinde yoğunlaşıyor) → şirket + pencere bazında kümeleme.

## 7. Nerede işlem yapılacak?

| Kullanım | Yer | Neden |
|---|---|---|
| **Ders — ana** | **SimBIST**: kendi paper broker'ımız, gerçek BIST fiyatlarıyla (komisyon + kayma modeli) | Algolab kapandı; strateji ertesi açılışla çalıştığı için gecikmeli veri yeterli |
| **Ders — karşılaştırma** | **Alpaca paper** + Benzinga haber akışı | Ücretsiz; ABD haber kolu olarak ablation |
| **Kişisel gerçek para** | **Emir fişi → sen kendi aracı kurum uygulamandan girersin** | Strateji 5–60 gün tutuyor, hız gerekmiyor; son onay zaten sende. BIST hisse kazancında %0 stopaj, beyan yok. Komisyon ≤ %0,05 / taraf şartı: Midas ve Enpara Yatırım'da BIST komisyonu %0 (banka kurumları binde ~2) |
| Kişisel — ileride | Matriks IQ "Dışarıdan Emir Kabulü" (~5.000 TL/ay) | Yalnızca portföy büyürse mantıklı |
| Opsiyonel otomatik | BtcTurk (API anahtarında para çekme yetkisi hiç yok) | **Önerilmiyor:** kriptoda yavaş sistem için kanıt yok; 2024 ve 2025'te hacklendi |

**Düzeltmeler (önceki dosyalara göre):** Algolab 31.12.2025'te kapandı. Binance Spot Testnet → artık `demo.binance.com` (ccxt: `enable_demo_trading(True)`). `PGVector` → `PGVectorStore` + `PGEngine`. RAGAS 0.4'te metrikler `ragas.metrics.collections` altında.

## 8. Deterministik korumalar (enterprise'ın kalbi)

Gerekçe: SEC 15c3-5, MiFID II RTS 6 (Md. 12 kill switch, Md. 15 işlem öncesi kontroller), FINRA 15-09.

1. Pydantic şema doğrulaması.
2. İzinli hisse evreni (likidite + halka açıklık filtresi).
3. SPK tedbirli hisseye **sert veto**.
4. Pozisyon ≤%10, işlem riski %0,5, günlük hacmin ≤%1'i.
5. Fiyat bandı (son fiyat ±%2), tavan/taban kontrolü.
6. Günlük emir limiti, hisse başına bekleme süresi.
7. **Günlük %-1 → dur; zirveden %-5 → kill switch** (gerçek parada sıkı ayar). Reset = Admin + Risk Officer.
8. Kanıt şartı: kanıt kartı boşsa ret.
9. Beklenen avantaj ≥ 2 × maliyet değilse ret.
10. LLM kotası bitince → HOLD.
11. Canlı mod için 3 ayrı anahtar (config + env + UI onayı).

## 9. Enterprise özellikleri

- **RBAC:** Analist (görür, not ekler) · Risk Officer (onay/ret, kill switch, limitler) · Admin (kullanıcı, evren, config). Limit değişiklikleri ikinci onay ister.
- **Hash zincirli, yalnızca eklenebilir audit log:** bildirim, sınıflandırma, getirilen kanıtlar, her ajan çıktısı, kural sonuçları, onaylayan, emir, dolum. Doğrulama butonu demoda gösterilir.
- **"Neden bu işlem?" ekranı:** bildirim metni, kanıt kartı (benzer 20 olay ve getirileri), şüpheci notu.
- **Canlı iz paneli** (LangSmith/Langfuse).
- **Günlük KAP özeti:** yöneticiye sabah raporu (önemli bildirimler, açık pozisyonlar, riskler).

## 10. Değerlendirme — 4 katman (diğer grupların atlayacağı kısım)

| Katman | Ne | Metrik |
|---|---|---|
| 1. Sınıflandırma | 300 bildirimlik elle etiketlenmiş altın set | E1–E4 F1, model karşılaştırması (Gemini vs Qwen vs Trendyol-LLM) |
| 2. RAG | 50 soruluk altın set | RAGAS: faithfulness, context precision/recall |
| 3. Olay çalışması + backtest | 2018–2024 geliştirme, **2025–2026 dokunulmamış test** (holdout), kurallar önceden sabit | Anormal getiri, Sharpe, maks. düşüş, isabet oranı |
| 4. İleri dönük paper test | **9 Kasım 2026'dan finale**, dondurulmuş `v1.0-fwd` | Getiri vs BIST-100, vs eşit ağırlık, ablation'lar |

**Baseline ve ablation'lar:** BIST-100 al-tut · eşit ağırlık evren · yalnızca KAP `subject` alanıyla kural (LLM yok) · serbest karar veren LLM · şüpheci ajansız versiyon.

**Güvenlik:** Prompt-injection red-team seti (içine talimat gizlenmiş sahte bildirimler) → yakalama oranı. Groq'taki Llama Prompt Guard 2 (hâlâ ücretsiz, 14,4K istek/gün) ek filtre.

## 11. Final demo (5 dakika, notun %50'si)

1. **Problem:** Bugünkü canlı KAP bildirim sayısı ekranda. "Bir fon yöneticisi bunların hangisini okumalı?"
2. **Önemli bir sözleşme bildirimi** → sınıflandırma → kanıt kartı ("benzer 23 olayda ortalama +%1,4") → şüpheci büyüklüğü küçültür → onay kartı → paper dolum.
3. **Kötü niyetli bildirim + tedbirli hisse** → uyum ajanı ve risk kapısı engeller.
4. **Kill switch** → zarar simülasyonu → her şey durur → audit zinciri doğrulanır.
5. **Sonuçlar:** 8+ haftalık paper sonuçları vs BIST-100 ve ablation'lar.
6. **Kapanış:** "Aynı kod, son butona yine ben basıyorum."

Yedek: kota/bağlantı sorununa karşı önceden kaydedilmiş demo.

## 12. Teknoloji yığını (~$0)

| Katman | Seçim |
|---|---|
| Ajanlar | LangGraph 1.x (`Send`, `interrupt()` + `Command(resume=)`, `AsyncPostgresSaver`) |
| LLM | Gemini Flash-Lite (ana, ~500 istek/gün), Groq `gpt-oss-120b` (hızlı; Llama sohbet modelleri ücretsiz katmandan kalktı) + Llama Prompt Guard 2; geri dönüş zinciri: Flash-Lite ⇄ Groq gpt-oss → Azure for Students → Ollama Qwen (yerel) → HOLD |
| Embedding | bge-m3 (yerel) |
| DB | Postgres + pgvector (`PGVectorStore`), Redis (stream + cache) |
| Backend / Frontend | FastAPI (SSE, JWT) + Next.js |
| Değerlendirme | RAGAS 0.4, kendi replay harness'ı, vectorbt |
| İzleme | LangSmith Developer (ücretsiz) |
| Altyapı | Docker Compose, GitHub Actions, SOPS/age + gitleaks |

Kapasite: karar başına ~17K token, günde 30–60 tam karar. Ama ~350 bildirimin çoğu LLM'siz elenir, kota rahat. Herkes kendi API anahtarını alsın.

## 13. Takvim

| Hafta | Tarih (yaklaşık) | Kilometre taşı |
|---|---|---|
| W1 | 5 Eki | Anahtarlar, KAP poller, repo iskeleti, docker compose |
| **W2** | 12 Eki | **Proposal (%5)** |
| W3 | 19 Eki | KAP backfill 2018–2026, fiyat verisi, olay taksonomisi |
| W4 | 26 Eki | Uçtan uca iskelet (bildirim → sınıflandırma → paper emir) |
| W5 | 2 Kas | Olay çalışması motoru, kural motoru, risk kapısı + testler |
| **W6** | **9 Kas** | **İleri dönük paper test başlar (`v1.0-fwd` dondurulur)** |
| W7 | 16 Kas | Kanıt/Şüpheci/Uyum ajanları, 300'lük altın set |
| **W8** | 23 Kas | **Progress raporu (%5)** |
| W9–W10 | Ara | Frontend, RBAC, audit, onay akışı, RAGAS |
| W11 | Ara | Ablation'lar, red-team, backtest raporu |
| W12 | Oca | Feature freeze, demo provası |
| Final | Oca | **Sunum (%50)** |

Gerçek teslim tarihleri hocadan teyit edilmeli.

## 14. Görev dağılımı

| Rol | Sorumluluk |
|---|---|
| **1. Veri & RAG** | KAP poller + backfill, fiyat/kurumsal işlemler, RSS, 3 bilgi tabanı, hibrit arama, RAGAS |
| **2. Ajanlar** | LangGraph grafı, 6 ajan, interrupt/onay, checkpointer, prompt'lar, altın set F1 |
| **3. Strateji, Risk & Yürütme** | Olay çalışması motoru, kural motoru, risk kapısı (%100 test), broker adapter'ları, kill switch |
| **4. Frontend & Değerlendirme** | Next.js paneli, RBAC, audit görüntüleyici, backtest/paper raporları, ablation, demo |

## 15. Senin paran için aşamalı plan (kişisel)

| Aşama | Ne zaman | Şart |
|---|---|---|
| 0. Kanıt | Eki–Kas 2026 | Kendi KAP arşivinde olay çalışması; 2025–2026 holdout'ta E1–E4'ten en az biri maliyet sonrası pozitif mi? **Değilse gerçek paraya geçme.** |
| 1. Paper | Kas 2026 → en az 3 ay | **≥50 işlem**, BIST-100'e yakın veya üstü, kurallar değiştirilmeden |
| 2. Küçük gerçek para | ~Şubat 2027+ | Kaybetmeyi göze aldığın tutar; ayrı hesap; emir fişiyle manuel giriş; kaldıraç/VİOP yok |
| 3. Büyütme | Aşama 2'de 3+ ay tutarlıysa | Kademeli; gerekirse Matriks DEK ile otomasyon |

**Kurallar:**
- Sinyalleri **kimseyle paylaşma.** Başkasına al-sat tavsiyesi lisanssız yatırım danışmanlığı sayılabilir; SPK 2024'te 154 Telegram/X sinyalcisine işlem yaptı.
- Ortak para havuzu yok (SPKn 6362 md. 109).
- Ana birikimin bu hesapta olmasın.

## 16. Riskler ve önlemler

| Risk | Önlem |
|---|---|
| Hoca "bu scraper + sınıflandırıcı" der | Araç çağıran ajanlar, 3 RAG tabanı, interrupt onayı, 4 katmanlı değerlendirme, ablation iddiası |
| KAP site yapısı/firewall değişir | Kendi httpx istemcimiz (`kap_client.py`), kibar polling, HTTP 666'da geri çekilme; tip bazlı ayrıştırıcı + fixture testleri; ham yanıtları arşivle |
| Bedelsiz/bölünme getiri hesabını bozar | Getiri düzeltilmiş fiyatla, dolumlar İş Yatırım ham fiyatıyla; borsapy kurumsal işlemleri; `ticker_history` kod eşlemesi |
| Türkçe metin tuzakları | `İ/ı` için Türkçe casefold, cp1254 → UTF-8, ondalık virgül |
| Kota biter | Cache, LLM'siz ön eleme, HOLD modu, kayıtlı demo |
| Avantaj çıkmaz | Bu da geçerli bir bulgu: "LLM sınıflandırıcı + kural ≥ serbest LLM" iddiası yine test edilir; gerçek paraya geçilmez |
| Sızıntı (bildirim öncesi fiyatlanma) | Son 5 seans >%8 filtresi |

## 17. İlk hafta yapılacaklar

- [ ] Ekiple bu belgeyi oku, isimde anlaş (KAPtan / Bildirim Masası / Nöbetçi).
- [ ] Herkes: Gemini (AI Studio) + Groq anahtarı al, **gerçek limitleri** not et; Flash-Lite tam sürüm model ID'sini dondur.
- [ ] Alpaca paper hesabı aç; haber API'sinin ücretsiz planda olduğunu doğrula.
- [ ] Kendi httpx istemcimizle (`kap_client.py`) KAP polling'i kur; bir işlem gününde yayın → görünme gecikmesini ölç.
- [ ] kapdestek@mkk.com.tr'ye akademik canlı erişim sorusu gönder.
- [ ] KAP kullanım şartlarını ve AA/Foreks RSS şartlarını oku.
- [ ] GitHub repo + docker compose (api, web, postgres+pgvector, redis).
- [ ] Hocadan gerçek teslim tarihlerini öğren.
- [ ] Proposal taslağı.

## 18. Doğrulanmamış noktalar

**Revizyon 3'te doğrulananlar (30.09.2026):** KAP uçları canlı çalışıyor ve geçmiş sorgu (backfill) mümkün; `kap-client` BIST'te çalışmıyor → kendi istemcimiz; yfinance yalnızca düzeltilmiş fiyat verir, ham fiyat İş Yatırım'dan; Gemini ücretsiz katmanı ölçüldü (Flash ~20, Flash-Lite ~500 istek/gün → ana model Flash-Lite); Groq'ta Llama sohbet modelleri kalktı, Prompt Guard 2 ücretsiz; SPK 22.09.2026 kararı = geri alımlarda toplam tutar üst sınırının geçici kaldırılması; akademik rakamlar kaynağından kontrol edildi (Ersan, Ünal, StockBench, Alpha Arena).

Hâlâ açık:
- Gemini limitleri resmî tablo değil, ölçüm; W1'de yeniden okunur.
- Alpaca'da Benzinga haber akışının ücretsiz planda olup olmadığı.
- KAP yayın → görünme gecikmesi (işlem gününde ölçülmedi).
- KAP otomatik çekme için açık izin/yasak metni bulunamadı.
- E3 için BIST'e özgü olay çalışması yok; Türkçe olay çalışmalarının çoğu küçük örneklemli ve 2020 öncesi.
- Kripto ve yurt dışı hisse kazancı vergisi → mali müşavire sor.

## 19. Kaynak dosyalar

| Dosya | İçerik |
|---|---|
| `04-derin-arastirma/01-gercek-para-platform-secimi.md` | Algolab'ın kapanışı, BtcTurk/OKX/Alpaca/IBKR/Matriks karşılaştırması |
| `04-derin-arastirma/02-haber-stratejisi-kanit.md` | Olay bazlı getirilerin akademik kanıtı, E1–E4 stratejisi |
| `04-derin-arastirma/03-bist-kap-veri-hatti.md` | KAP uçları, veri şeması (DDL), Türkçe NLP, ilk hafta listesi |
| `04-derin-arastirma/04-fikir-turnuvasi.md` | 9 varyantın puanlaması, red-team, KAPtan'ın seçilmesi |
| `04-derin-arastirma/05-muhendislik-plani.md` | LangGraph kod iskeletleri, repo yapısı, DDL, takvim, testler, güvenlik |
| `02-fikir-B-kurul/` | Önceki tur: LLM trading kanıtları, mimari, veri kaynakları |
| `01-fikir-A-mutabik/` | İlk tur: e-Fatura fikri (yedek) |
