# KAPtan — Proje Planı ve Görev Listesi

| Alan | Değer |
|---|---|
| Sürüm | 0.3 (taslak; kanonik Revizyon 3 ile hizalandı) |
| Tarih | 30.09.2026 (ilk sürüm 29.09.2026) |
| Doğruluk kaynağı | `_KANONIK-KARARLAR.md` (takvim, roller, kapsam, parametreler; en üstteki Revizyon 3, ardından Revizyon 2 geçerlidir). Risk kapısı kuralları: `06-strateji-ve-kurallar.md` §10 |
| İlgili | `03-PRD.md` (US-xx, FR-xx, NFR-xx), `13-risk-kaydi.md` (R-xx) |
| Sahip | Takım lideri (plan), her rol kendi görevlerinden sorumlu |

> Gerçek teslim tarihleri hocadan teyit edilecektir (PRD AS-01). Bu plandaki tarihler proje haftalarının **Pazartesi** günleridir; Pazartesi 13:20–16:10 (MB06) ders saati haftalık senkron noktasıdır.

---

## 1. Roller ve kapasite

| Rol | Kısa ad | Sorumluluk (kanonik) | Birincil epikler (PRD) |
|---|---|---|---|
| **Rol 1 — Veri & RAG** | V | KAP poller + backfill, fiyat/kurumsal işlemler, RSS, makro, 3 bilgi tabanı, hibrit arama, RAGAS | EP-01, EP-03 |
| **Rol 2 — Ajanlar** | A | LangGraph grafı, 6 LLM ajanı + Birleştirme düğümü (Rol 3 ile), interrupt/onay, checkpointer, prompt'lar, kota/önbellek, altın set F1 | EP-02, EP-03, EP-05 |
| **Rol 3 — Strateji, Risk & Yürütme** | S | Olay çalışması motoru, kural motoru, risk kapısı (%100 test), broker adapter'ları, kill switch, audit zinciri, ileri dönük operasyon | EP-04, EP-06, EP-07, EP-08 |
| **Rol 4 — Frontend & Değerlendirme** | F | Next.js paneli, RBAC, audit görüntüleyici, raporlar, replay/baseline/ablation, CI ve repo düzeni, demo | EP-05, EP-08, EP-09, EP-10, EP-11 |

**Takım lideri** dört rolden birini üstlenir ve ek olarak şunlardan sorumludur: hocayla iletişim, takvim ve kapsam kararları, kapı (gate) toplantılarının yürütülmesi, risk kaydının haftalık güncellenmesi.

**Kapasite varsayımı:** kişi başı ~12 saat/hafta × 13 hafta (W1–W12 + tampon) ≈ **155 saat/kişi**, ekip toplamı ≈ 620 saat. Bunun ~%70'i rol görevlerine, ~%30'u ortak işlere (proposal, progress, etiketleme, inceleme, senkron, demo) ayrılmıştır. Vize haftasında kapasite ~%50 varsayılır (bkz. R-30).

---

## 2. Haftalık plan (W1–W12 + Final)

| Hafta | Tarih (Pzt) | Odak (kanonik) | Rol 1 — Veri & RAG | Rol 2 — Ajanlar | Rol 3 — Strateji/Risk/Yürütme | Rol 4 — Frontend & Değ. | Teslimat / Kapı |
|---|---|---|---|---|---|---|---|
| **W1** | 5 Eki | Kurulum | KAP poller prototipi, gecikme ölçümü, veri şeması v0 | Graf iskeleti (sahte LLM), model kayıt defteri, kota ölçümü | Docker Compose, sırlar (SOPS/age, gitleaks), domain şemaları | Repo, CI, board, Next.js + auth iskeleti | Compose 4 makinede çalışıyor; proposal taslağı |
| **W2** | 12 Eki | **Proposal** | Canlı poller (üretim), backfill başlar, tam metin + TR normalizasyon, kişi adı maskeleme (T-28; W3'teki ilk LLM çağrısından önce) | Taksonomi + etiketleme kılavuzu, Sınıflandırıcı ajan v0 | Risk kapısı + Hypothesis, %100 kapsam kapısı, SimBIST v0 | RBAC + yetki matrisi testleri | **G0: Proposal (%5)** |
| **W3** | 19 Eki | Backfill, taksonomi | Backfill 2018–2026 bitti, `subject` haritası, fiyat + kurumsal işlemler | Sınıflandırıcı v1, Okuyucu ajan | Olay çalışması motoru v0 (ilk sanity) | Canlı akış + pano (SSE) | Altın set etiketleme başlar |
| **W4** | 26 Eki (28 Eki yarım gün, 29 Eki tatil) | Uçtan uca iskelet | Embedding + hibrit arama + point-in-time filtre, finansal veri | `interrupt()` onay + checkpointer, iskeleti bağlama | Kill switch, günlük halt, GuardedBroker | Onay kuyruğu UI | **G1: Walking skeleton** (1 Kas) |
| **W5** | 2 Kas | Olay çalışması, kural motoru, risk kapısı | Olay hafızası (`event_returns` + holdout gizleyen view) + mevzuat tabanı | Önbellek + kota bekçisi + HOLD, Önemlilik (yalnızca sayılar), Birleştirme düğümü, Kanıt ajanı v0 | Kural motoru E1–E4, `rules-v1` dondurma, SimBIST tam, `pnl_daily` | Replay harness + baseline'lar | `rules-v1` etiketi (8 Kas) |
| **W6** | **9 Kas** | **İleri dönük paper başlar** (`v1.0-fwd`: Sınıflandırıcı + kurallar) | RSS + dedup, ingest izleme | Kanıt ajanı v1 (`v1.0-fwd`'ye girmez), `v1.0-fwd` dondurma | Holdout (2025-01-01 → 2026-10-31) tek koşu + rapor, ileri dönük operasyon | P&L panosu vs baseline | **G2: `v1.0-fwd` başlar**; kişisel Aşama 0 kararı |
| **W7** | 16 Kas | Kanıt/Şüpheci/Uyum, altın set, audit zinciri | Makro/kriz verisi, RAG altın seti (50 soru) | Şüpheci + Uyum ajanları, Prompt Guard + Türkçe kural tabanlı injection kontrolü, altın set F1 | **Audit hash zinciri + verify (ileri dönük kayıt için devrede)**, OrderTicket, gölge getiri izleme | Audit görüntüleyici, iz sayfası | Altın set 300 tamam (100 geliştirme + 200 kilitli) |
| **W8** | 23 Kas | **Progress**; `v1.1-fwd` başlar | RAG altın seti bitti | `v1.1-fwd` dondurma (tüm ajanlar), serbest-LLM ablation grafı | Kriz rejimi + çıkış filtreleri, red-team CI | Sabah özeti | **G3: Progress (%5)**; **`v1.1-fwd` başlar** |
| **W9** | 30 Kas | Frontend, RBAC, audit, RAGAS | RAGAS #1 + iyileştirme | İsim maskeleme testi | Hata/yük testleri (429 → HOLD) | "Neden bu işlem?" ekranı, admin (4 göz) | — |
| **W10** | 7 Ara | Frontend, RBAC, audit, RAGAS | Veri kalitesi raporu | "Neden bu işlem?" payload'ı | Güvenlik incelemesi, canlı mod kapalı doğrulaması | Admin tamam, E2E Playwright | — |
| **W11** | 14 Ara | Ablation, red-team | RAGAS #2, Chroma notebook'u (C) | Red-team genişletme | Audit dış çapa, yedek/geri yükleme tatbikatı | Ablation + metrik raporu | Değerlendirme raporu v1 |
| Tampon | 21 Ara – 3 Oca (1 Oca tatil) | Bug bash, tatil | Hata düzeltme | Hata düzeltme | İleri dönük koşu izlenir | Grafikler, slayt taslağı | — |
| **W12** | 4 Oca 2027 | Freeze, prova | Demo verisi kontrolü | Demo fixture + önbellek ısıtma | Demo güvenliği, kill switch senaryosu | Demo betiği, kayıtlı video | **G4: Feature freeze**; ≥ 2 prova |
| **Final** | Oca 2027 (tarih hocadan teyit edilecek) | **Sunum (%50)** | Prova | Prova | İleri dönük istatistikler sunumdan 2 gün önce dondurulur | Sunum | **G5: Final** |

---

## 3. Kilometre taşları ve kapılar (gates)

Her kapı Pazartesi ders saatinde 20 dakikalık bir toplantıyla değerlendirilir. Karar: **Geç / Koşullu geç / Geçme**. "Geçme" durumunda lider kapsamı kısar (önce Stretch, sonra Should) ve kararı ADR olarak yazar.

| Kapı | Tarih | Geçiş kriterleri | Geçilemezse |
|---|---|---|---|
| **G0 — Proposal** | W2, 12 Eki | Proposal teslim edildi (problem, persona, mimari şekli, MVP/stretch, 4 katmanlı değerlendirme, takvim, roller) · repo + CI yeşil · `docker compose up` 4 makinede · poller gecikmesi ölçüldü · gerçek kota değerleri `quotas.yaml`'da | Proposal yine teslim edilir; teknik kriterler W3'e taşınır, lider günlük takip eder |
| **G1 — Walking skeleton** | W4 sonu, 1 Kas | Tek bir gerçek bildirim: ingest → `subject` tipleme → (gerekirse) Sınıflandırıcı → kural motoru (stub olabilir) → risk kapısı → `interrupt()` → UI'dan onay → SimBIST emri → audit satırı · backfill tamam · risk modülü %100 kapsam · CI kırmızı değil | W5'te yeni özellik yok; iskelet tamamlanana kadar tüm ekip iskelette çalışır |
| **G2 — İleri dönük paper başlar** | W6, **9 Kas** | `rules-v1` dondu ve holdout (2025-01-01 → 2026-10-31) **bir kez** koştu · ingest 5 iş günü kesintisiz · kill switch ve günlük halt testleri geçti · `v1.0-fwd` (Sınıflandırıcı + kurallar) git etiketi + manifest (tam sürüm model ID'leri, prompt hash'leri, limit, evren) · günlük operasyon kontrol listesi hazır | En geç 16 Kas'ta mevcut hâliyle başlar; kayma risk kaydına ve rapora yazılır. Başlangıç tarihi **kaydırılmaz, kapsam küçültülür** |
| **G3 — Progress** | W8, 23 Kas | Progress raporu teslim · 300 altın set + F1 (kilitli test seti) · `v1.0-fwd`'nin ilk 2 haftalık sonuçları · audit hash zinciri devrede (W7'den beri) · `v1.1-fwd` (tüm ajanlar) dondu ve başladı · risk kaydı güncel | Stretch tamamen iptal; W9–W10 yalnızca MVP |
| **G4 — Feature freeze** | W12, 4 Oca | Tüm Must US'ler kabul edildi · E2E testi yeşil · toplam kapsam ≥ %80 · kayıtlı demo videosu var · 2 ardışık provada 6 sahne hatasız | Başarısız sahne demodan çıkarılır, kayıtlı video ile anlatılır |
| **G5 — Final** | Oca | Sunum + canlı demo; ileri dönük istatistikler 2 gün önce dondurulur | — |

**Ek kontrol noktası — `rules-v1` (8 Kas):** kural parametreleri ve olay tanımları bir "ön kayıt" (pre-registration) dokümanına yazılır, commit hash'i kaydedilir. Holdout (2025-01-01 → 2026-10-31; projenin ana sayısal kanıtı) bu tarihten önce **hiç** çalıştırılmaz ve yalnızca bir kez çalıştırılır.

---

## 4. Görev listesi (rol bazında)

Sütunlar: **Durum** (☐ yapılacak / ◐ devam / ☑ bitti) · **ID** · **Görev** · **Hafta** · **Bağımlılık** · **Efor** (saat) · **Kabul kriteri** · **US/FR**.

### 4.0 Ortak görevler (tüm ekip)

| Durum | ID | Görev | Hafta | Bağımlılık | Efor | Kabul kriteri | US/FR |
|---|---|---|---|---|---|---|---|
| ☐ | T-01 | Kickoff: kanonik kararları oku, isim ve rol ataması, çalışma anlaşmasını kabul et | W1 | — | 2 × 4 | Roller ve anlaşma `README`/`CONTRIBUTING`'de | — |
| ☐ | T-02 | Hesaplar: Gemini AI Studio, Groq, LangSmith, Azure for Students ($100 kredi, kart yok), TCMB EVDS (ücretsiz anahtar), GitHub; Google limit yayımlamadığı için gerçek limitleri ölçüp `config/quotas.yaml`'a yaz (beklenen: Flash-Lite ~15 RPM / ~500 RPD, Flash ~20 RPD; Groq gpt-oss ~1K RPD / ~200K TPD, Prompt Guard 2 30 RPM / 14,4K RPD); Gemini Flash-Lite tam sürüm model ID'sini AI Studio'dan okuyup `models.yaml`'a dondur | W1 | — | 1,5 × 4 | 4 kişinin değerleri dosyada, tarihli; ana model Flash-Lite tam ID'siyle kayıtlı; ileri dönük koşu ve RAGAS hakemi için ayrı anahtar var | US-22 |
| ☐ | T-03 | Proposal yazımı (bölümler role göre) | W1–W2 | T-01 | 6 × 4 | 12 Eki'de teslim; iç incelemeden geçti | — |
| ☐ | T-04 | Altın set etiketleme: 300 bildirim (4 × 75), %20 çift etiket; **100 geliştirme + 200 kilitli test**; sınıflar E1–E4 + X + O | W3–W7 | T-31 | 10 × 4 | 300 etiket, κ raporu, anlaşmazlıklar çözüldü; kilitli set ayrı ve erişim kayıtlı | US-46 |
| ☐ | T-05 | Progress raporu (şablon §9) | W8 | G3 kriterleri | 5 × 4 | 23 Kas'ta teslim | — |
| ☐ | T-06 | Haftalık senkron + PR incelemeleri | W1–W12 | — | 18 × 4 | Her hafta board güncel, PR'lar ≤ 24 sa içinde incelendi | — |
| ☐ | T-07 | Demo provaları (≥ 2 tam prova) | W12 | G4 | 6 × 4 | 2 ardışık provada 6 sahne hatasız, süre ≤ 5 dk | NFR-04 |
| ☐ | T-08 | Final slaytları + kayıtlı yedek video | W12 | T-84 | 5 × 4 | Slayt v1 ve video depoda | NFR-04 |

### 4.1 Rol 1 — Veri & RAG

| Durum | ID | Görev | Hafta | Bağımlılık | Efor | Kabul kriteri | US/FR |
|---|---|---|---|---|---|---|---|
| ☐ | T-10 | KAP poller prototipi: kendi httpx istemcimiz (`kap_client.py`; tarayıcı User-Agent + `Origin`/`Referer`) + ham JSON uçları (`list/main`, `members/byCriteria`; 30.09.2026'da canlı doğrulandı). `kap-client` bağımlılık değildir (1.2.0 BIST hisselerinde `CompanyNotFoundError`), yalnızca kaynak kodu referansıdır. İşlem gününde `first_seen_at − published_at` ölçümü | W1 | — | 8 | p50/p95 gecikme raporu, 1 günlük fixture kaydı; HTTP 666 (WAF) yanıtı geri çekilme olarak ele alınıyor | US-01, NFR-01 |
| ☐ | T-11 | Veri şeması v0 (Alembic 001): `disclosures`, `prices`, `corporate_actions`, `ingestion_log` | W1 | T-50 | 4 | `alembic upgrade head` CI'da geçer | FR-02 |
| ☐ | T-12 | Üretim poller: seans içi ≥ 30 sn aralık, imleç, jitter, 429/5xx/**HTTP 666 (WAF)** backoff, idempotent kayıt, ham gz arşiv, testler | W2 | T-10, T-11 | 6 | Fixture testleri (1 gün, 2000 sınırı, düzeltme satırı) geçer; çift kayıt yok | US-01, FR-01 |
| ☐ | T-13 | Backfill 2018–2026 (geçmiş tarih sorgusu canlı doğrulandı), kaldığı yerden devam, 2000 satır sınırı bölme, istekler arası ≥ 2 sn, 666'da geri çekilme | W2–W3 | T-12 | 8 | Tüm günler `ingestion_log`'da; eksik gün raporu 0 | US-02, FR-04 |
| ☐ | T-14 | Tam metin TR+EN çekme (`/tr/Bildirim/{idx}` + `/tr/api/BildirimPdf/{idx}`), sanitizasyon, **bildirim tipine göre ayrıştırıcılar** (`oda_ExplanationTextBlock` her tipte yok; ör. geri alımda tablo metinden okunur), `tr_text` modülü: Türkçe casefold, cp1254, sayı/tutar parser (regex aday kümesi) | W2–W3 | T-12 | 8 | "1.250.000,50 TL" → `Decimal` testi; İ/ı testleri; sıfır genişlikli karakter testi; her hedef bildirim tipi için ayrıştırıcı fixture testi | US-09, FR-03, FR-11, NFR-13 |
| ☐ | T-15 | `subject → event_type` YAML haritası (E1–E4 / X / O; taksonomi gerçek bildirim satırlarından kurulur çünkü `subjects/ODA/IGS` yalnızca 13 konu döndürüyor; "Yeni İş İlişkisi" ve "İhale Süreci / Sonucu" ayrı konular → E3 adayı) + gürültü listesi + LLM'siz ön eleme (işlem görebilirlik, SPK tedbiri, evren, "Düzeltme") + tip dağılım raporu | W3 | T-13 | 5 | LLM'siz tipleme oranı raporlandı (hedef ≥ %85); ön elemede LLM çağrısı 0 | US-03, US-07, FR-05 |
| ☐ | T-16 | Fiyatlar ve kurumsal işlemler (borsapy), düzeltme faktörü, gece çapraz kontrol. **Ham fiyat İş Yatırım'dan** (`HG_KAPANIS` ham + `HGDG_KAPANIS` düzeltilmiş + günlük `SERMAYE`, `PD`; yfinance ham fiyat vermez); `isyatirimhisse`'in sabit `timeout=10`'u yerine ≥ 90 sn timeout'lu ince sarmalayıcı; yfinance `Volume == 0` sahte tatil satırlarının atılması + `market_calendar`/XU100 hizalaması; kod değişimi eşleme tablosu `ticker_history` (ör. KOZAL → TRALT); borsadan çıkanlar için İş Yatırım verisi (hayatta kalma yanlılığı) | W3 | T-11 | 8 | THYAO 2009-06-25 faktör 5,0 testi; düzeltilmiş kapanışta (İş Yatırım vs yfinance) >%1 ayrışma uyarısı; ham fiyat tabloda; `Volume == 0` satırı kalmadı testi; KOZAL → TRALT eşleme testi; borsadan çıkmış bir hisse için fiyat serisi var | US-04, FR-06 |
| ☐ | T-17 | Finansal veri (`fundamentals_pit`): ödenmiş sermaye (`SERMAYE`) ve piyasa değeri (`PD`) İş Yatırım'dan günlük point-in-time; yıllık gelir (çeyreklik, yılbaşından kümülatif, açıklanma tarihi yok) için `available_at` = KAP "Finansal Rapor" bildiriminin `publishDate`'i, bulunamazsa dönem sonu + yasal son başvuru süresi (muhafazakâr); TCMB kuru (E1/E3 için) | W3–W4 | T-13 | 6 | BIST-100 evreninin ≥ %90'ı için değerler + `available_at`; `available_at` kaynağı (KAP / muhafazakâr yedek) satırda kayıtlı | US-15, AS-06 |
| ☐ | T-18 | Embedding hattı: bge-m3, chunking, `PGVectorStore` + `PGEngine` (kendi tablomuz); yalnızca filtrelenmiş bildirimler ve mevzuat gömülür (CPU'da ~5–15 parça/sn tahmini; hız W1'de 1.000 parçayla ölçülür), toplu gömme Colab GPU'da | W4 | T-14 | 8 | Filtrelenmiş arşiv gömüldü; `content_sha256` ile tekrar gömme yok; W1 hız ölçümü raporda | US-11, FR-12 |
| ☐ | T-28 | KVKK: kişi isimlerini LLM'e ve LangSmith'e gitmeden maskeleme (Gemini ücretsiz katmanında girdiler ürün geliştirmede kullanılabilir ve insanlarca okunabilir; AB istisnası Türkiye'yi kapsamaz) | **W2** (W3'teki ilk LLM çağrısından önce biter) | T-14 (`tr_text` kısmı) | 3 | Fixture'da LLM girdisi ve iz kaydında gerçek ad yok; W3'teki ilk gerçek bildirimli LLM çağrısından önce `main`'de; maskelenmemiş metin hiçbir ücretsiz sağlayıcıya gitmez | US-56, FR-42 |
| ☐ | T-19 | Hibrit arama (dense + `turkish` FTS + trigram, RRF) + tek noktadan point-in-time filtre | W4 | T-18 | 8 | Gelecek belge dönmeme testi; hibrit vs dense recall@10 tablosu | US-12, US-13, FR-13, FR-14 |
| ☐ | T-20 | Olay hafızası tabanı: geçmiş olay özeti embedding'i + `event_returns` tablosu (1/5/20/60 CAR, `available_at`); holdout getirilerini gizleyen view | W5 | T-52, T-18 | 6 | Chunk metadata'sında getiri yok; point-in-time testi geçer; geliştirme rolü holdout getirisini göremez | US-11, US-12 |
| ☐ | T-21 | Mevzuat tabanı (SPK II-15.1, II-22.1, piyasa bozucu eylemler, risk politikası) + SPK tedbir listesi çekici | W5 | T-18 | 6 | Uyum ajanı test sorguları doğru parçayı getirir; tedbir listesi günlük güncel | US-14, FR-22 |
| ☐ | T-22 | RSS toplayıcı (7 kaynak) + dedup + KAP bağlama + ölü kaynak uyarısı | W6 | T-12 | 6 | Aynı haber tek olay; 24 sa sessiz kaynak uyarısı | US-05, FR-07 |
| ☐ | T-23 | EVDS makro + kriz rejimi girdileri (EVDS ücretsiz anahtarı T-02'de alınır) | W7 | T-11, T-02 | 3 | Günlük seriler tabloda; anahtar yoksa fail-fast | US-06, FR-08 |
| ☐ | T-24 | RAG altın seti: 50 soru + referans bağlamlar (Rol 4 ile) | W7–W8 | T-19 | 6 | `evals/rag_gold.jsonl` 50 satır, ikinci kişi kontrol etti | US-47 |
| ☐ | T-25 | RAGAS #1 + iyileştirme (chunking, RRF ağırlığı) | W9 | T-24 | 5 | Faithfulness / precision / recall raporu | US-47 |
| ☐ | T-26 | Veri kalitesi raporu: kapsama, gecikme p50/p95, eksik günler | W10 | T-12 | 3 | Rapor `docs/`'ta, progress/final'e girdi | NFR-05 |
| ☐ | T-27 | RAGAS #2 + Chroma karşılaştırma notebook'u (C) | W11 | T-25 | 5 | İki çalıştırma arası değişim; Chroma tablosu | US-16, US-47 |
| | | **Rol 1 toplam** | | | **~112** | | |

### 4.2 Rol 2 — Ajanlar

| Durum | ID | Görev | Hafta | Bağımlılık | Efor | Kabul kriteri | US/FR |
|---|---|---|---|---|---|---|---|
| ☐ | T-30 | Graf iskeleti (`GenericFakeChatModel`), `DeskState`, `models.yaml`, LLM kayıt defteri + geri dönüş zinciri (Gemini Flash-Lite ⇄ Groq gpt-oss → Azure for Students → Ollama Qwen → HOLD) | W1 | T-50 | 8 | Sahte LLM ile uçtan uca graf testi CI'da geçer | FR-09, US-22 |
| ☐ | T-31 | Olay taksonomisi v1 + etiketleme kılavuzu (Rol 3 ile) | W2 | T-15 (taslak) | 5 | Kılavuz örnekli; 20 bildirimlik pilot etikette κ ölçüldü | US-46 |
| ☐ | T-32 | Sınıflandırıcı ajan (ODA-Genel): Pydantic şema, prompt, spotlighting, 1 yeniden deneme + fail-closed | W2–W3 | T-30, T-28 | 8 | Şema dışı çıktı → "belirsiz"; 20 pilot üzerinde çalışır | US-08, FR-10 |
| ☐ | T-33 | Okuyucu ajan: yapılandırılmış olay alanları; seçilen tutar regex aday kümesinde olmalı (R14) | W3–W4 | T-14, T-32 | 8 | Adaylarda olmayan tutar → bayrak + ret; 20 örnekte alan doğruluğu raporu | US-09, FR-11 |
| ☐ | T-34 | Onay: `request_approval` + `interrupt()` + `Command(resume=)` + `AsyncPostgresSaver`; resume API ucu (Rol 4 ile) | W4 | T-30 | 8 | Durdur → yeniden başlat → devam testi; çift resume 409 | US-26, FR-23, FR-24 |
| ☐ | T-35 | Walking skeleton bağlama (Rol 3 ile) | W4 | T-34, T-54 | 4 | G1 kriterleri sağlandı | G1 |
| ☐ | T-36 | Redis LLM önbelleği + kota bekçisi (token bucket, %80 yumuşak sınır; Groq günlük token tavanı dahil) + HOLD + `llm_usage` + LangSmith iz örneklemesi (Developer: ayda 5K iz; CI ve replay'de iz kapalı) | W5 | T-30 | 8 | Kota tükenme testi → HOLD; her çağrı `llm_usage`'da; CI/replay'de LangSmith'e iz gitmiyor | US-22, FR-21, FR-39 |
| ☐ | T-37 | Önemlilik ajanı (SQL aracı: **yalnızca sayılar** — gelir, sermaye, piyasa değeri, kur) | W5 | T-17 | 5 | Çıktıda oran alanı yok testi; her sayı kaynak + dönemle | US-15 |
| ☐ | T-49 | Birleştirme düğümü (deterministik, Rol 3 ile): oranlar `Decimal` ile (E3 yıllıklandırma, gelir yoksa tutar / piyasa değeri, TCMB kuru), R14 regex tutar çapraz kontrolü, kanıt istatistikleri | W5 | T-33, T-37, T-20 | 5 | Determinizm testi; R14 ret testi; E3 yedek formül testi | US-53, FR-41 |
| ☐ | T-38 | Kanıt ajanı: RAG ile olay seçimi (**getirileri görmeden**), kanıt kartı, kimlik alt küme kuralı; istatistikler Birleştirme düğümünde | W5–W6 | T-19, T-20, T-52 | 8 | Ajan girdisinde getiri alanı yok testi; kartta `n`, CAR, isabet, GA; uydurma kimlik → ret testi | US-11, FR-15 |
| ☐ | T-39 | Şüpheci ajan: fiyat/hacim aracı, önceden fiyatlanma, çelişen bildirim; yalnızca küçült/veto | W6–W7 | T-38 | 6 | Hypothesis: çıkış boyutu ≤ giriş | US-19, FR-18 |
| ☐ | T-40 | Uyum ajanı (mevzuat RAG, fail-closed) + Llama Prompt Guard 2 (Groq'ta hâlâ ücretsiz) + Türkçe kural tabanlı injection kontrolü | W6–W7 | T-21 | 7 | Tedbirli hisse → `block` + mevzuat atfı; eşik üstü injection → karantina | US-14, US-51, FR-44 |
| ☐ | T-41 | `v1.0-fwd` dondurma (Sınıflandırıcı + kurallar; Kanıt/Şüpheci/Uyum yok): manifest (tam sürüm model ID'leri, prompt hash'leri, config), `strategy_version` (Rol 3 ile) | W6 | T-36, T-55 | 2 | Git etiketi + manifest + değişiklik günlüğü | US-49, FR-45 |
| ☐ | T-42 | Altın set F1 + model karşılaştırması (Gemini Flash-Lite / Ollama Qwen / Groq gpt-oss) | W7 | T-04 | 6 | Sınıf bazında P/R/F1 + makro-F1 tablosu | US-46 |
| ☐ | T-43 | `v1.1-fwd` dondurma (tüm ajanlar), manifest (tam sürüm model ID'leri, prompt hash'leri); 23 Kas'ta başlar | W8 | T-39, T-40, T-49 | 2 | Etiket + manifest; `v1.0-fwd` ile paralel kol çalışıyor | US-49, FR-45 |
| ☐ | T-44 | Serbest karar veren LLM ablation grafı (aynı risk kapısı; yalnızca model eğitim tarihi sonrası olaylar) | W8–W9 | T-36 | 6 | Aynı olay akışında replay ile çalışır; R01–R16'dan geçer | US-50 |
| ☐ | T-45 | Şirket adı maskeleme testi (S) | W9 | T-42 | 4 | Maskeli/maskesiz F1 farkı raporu | US-52 |
| ☐ | T-46 | "Neden bu işlem?" payload'ı (kanıt, şüpheci, kural izi) | W10 | T-38, T-60 | 4 | Tüm alanlar audit'ten yeniden kuruluyor | US-37 |
| ☐ | T-47 | Red-team setini ≥ 30 kötü niyetli öğeye (TR/EN) + zararsız kontrol vakalarına genişletme + savunma ayarı (Rol 3 ile) | W11 | T-63 | 5 | 0 emir (sert kapı), engelleme ≥ %95; yanlış alarm oranı raporlandı | US-51 |
| ☐ | T-48 | Demo modu: fixture'lar + önbellek ısıtma + `inject_disclosure` betiği | W12 | T-47 | 4 | Çevrimdışı (`LLM_MODE=replay`) demo akışı çalışır; enjekte öğeler "DEMO FİKSTÜRÜ" etiketli | FR-40 |
| | | **Rol 2 toplam** | | | **~119** | | |

### 4.3 Rol 3 — Strateji, Risk & Yürütme

| Durum | ID | Görev | Hafta | Bağımlılık | Efor | Kabul kriteri | US/FR |
|---|---|---|---|---|---|---|---|
| ☐ | T-50 | Docker Compose (pgvector pg17, redis, api, web, workers), `.env.example`, SOPS/age, gitleaks pre-commit | W1 | — | 8 | 4 makinede `compose up`; gitleaks hook aktif | NFR-08, NFR-18 |
| ☐ | T-51 | Domain şemaları (frozen Pydantic, `Decimal`), `Broker` protokolü, SimBIST v0 | W1–W2 | T-50 | 8 | mypy strict geçer; SimBIST birim testleri | US-29, FR-25 |
| ☐ | T-52 | Olay çalışması motoru: BIST-100'e göre anormal getiri, CAR 1/5/20/60, n, isabet, GA; 2018–2024 ilk sanity (geri alım, yeni iş ilişkisi); olaylar şirket + pencere bazında kümelenir (bildirim ≠ bağımsız olay); E1 geri alım dalgası (SPK 22.09.2026, 60/1711: geri alımlarda toplam tutar üst sınırının geçici kaldırılması) alt grubu ayrı; E3 keşifsel (BIST'e özgü literatür kanıtı yok) | W3–W5 | T-13, T-16 | 12 | Bilinen bir örnek üzerinde elle hesapla eşleşme testi; kümeleme testi; sanity raporu | US-48, US-11 |
| ☐ | T-53 | Risk kapısı (R01–R16, tek kaynak `06` §10; R09 fiyat bandı/tavan-taban ham fiyatla) saf fonksiyonlar + Hypothesis + CI'da %100 satır+dal kapısı | W2–W3 | T-51 | 12 | Her limitin alt/sınır/üst testi; monotonluk özelliği; CI kapısı aktif | US-20, FR-19, NFR-14 |
| ☐ | T-54 | Kill switch (R01; Admin veya Risk Officer tetikler) + günlük %-1 halt (R02) + zirveden %-5 + `GuardedBroker` + iki kullanıcılı reset; kişisel modda iki onay arası ≥ 24 sa + 5 seans | W4 | T-53 | 8 | Aynı kullanıcı reset'i tamamlayamaz testi; açık emirler iptal, açık pozisyonlar satılmaz testi | US-21, US-31, FR-20, FR-28 |
| ☐ | T-55 | Kural motoru E1–E4 + sızıntı filtresi (E4 için ek 10 seans / %12) + evren filtresi + ekip engel listesi (R13) + kanıt şartı + avantaj ≥ 2 × maliyet + kapanış bazlı ATR stop (`stop_pct`) | W4–W5 | T-15, T-52 | 10 | Her kural için pozitif/negatif testler; determinizm testi | US-17, US-18, US-23, US-57, FR-16, FR-17 |
| ☐ | T-56 | `rules-v1` ön kayıt dokümanı + dondurma (holdout öncesi) | W5 | T-55 | 3 | Doküman + commit hash, 8 Kas | US-48 |
| ☐ | T-57 | Holdout (2025-01-01 → 2026-10-31) **tek** koşu + rapor (simüle onay + "onaysız" ablation); kişisel Aşama 0 kararı (t ≥ 2, n ≥ 30) | W6 | T-56 | 5 | Maliyet öncesi ve sonrası (baz %0,05 / taraf + kayma; duyarlılık %0,20 / taraf) sonuçlar, commit hash ve tarihle | US-48 |
| ☐ | T-58 | SimBIST tam (ertesi açılış **ham fiyatla**, komisyon + kayma: baz %0,05 / taraf + hacme bağlı kayma, duyarlılık %0,20 / taraf; tavan/taban ham fiyatla, idempotent) + pozisyon projeksiyonu + `pnl_daily` gün sonu işi | W5 | T-51, T-16 | 8 | Dolum/komisyon testleri; dolum ve tavan/taban ham fiyatla testi; `pnl_daily` satırı her gün | US-29, US-34, FR-26, FR-29 |
| ☐ | T-59 | İleri dönük koşu operasyonu: zamanlayıcı, izleme, alarm, günlük kontrol listesi (W6–final sürekli) | W6–W12 | T-58 | 10 | İş günlerinde ≥ %95 çalışma; kaçan günler backfill + raporda | US-49, NFR-05 |
| ☐ | T-60 | Audit hash zinciri tetikleyicisi (kanonik JSON dizisi + `run_id`) + yetkiler (UPDATE/DELETE yok) + `verify_audit_chain.py` + CI adımı; ileri dönük koşu kayıtları için **W7'de devrede** | W7 | T-11 | 6 | Bozulmuş satır tespit testi; CI'da doğrulama | US-36, FR-30 |
| ☐ | T-61 | OrderTicket adapter: limit fiş, 30 dk geçerlilik, manuel dolum, kayma | W7 | T-51 | 5 | Paylaşım özelliği yok; kayma audit'te | US-30, FR-27 |
| ☐ | T-68 | Reddedilen sinyallerin gölge getiri izleme işi (ret gerekçe koduyla) | W7 | T-58 | 4 | Her reddedilen öneri için tutma sonunda gölge getiri satırı | US-55, FR-43 |
| ☐ | T-62 | Kriz rejimi + çıkış filtreleri + tutma süresi çıkış önerileri | W8 | T-55, T-23 | 6 | Tedbir gelen pozisyon → öncelikli çıkış önerisi testi | US-24, US-25, US-34 |
| ☐ | T-63 | Red-team fixture'ları CI'da (emir → CI kırılır) + gece replay işi | W8 | T-40 | 5 | CI kuralı aktif; gece rapor artefaktı | US-51, FR-38 |
| ☐ | T-64 | Hata/yük testleri: broker hatası, Redis yeniden başlatma, LLM 429 → HOLD | W9 | T-36 | 5 | Her senaryo için otomatik test; güvenli sonuç | NFR-04 |
| ☐ | T-65 | Güvenlik incelemesi (brokers, sırlar, RBAC) + canlı mod kapalı / 3 anahtar kontrol listesi | W10 | T-54 | 4 | CRITICAL/HIGH bulgu 0 | US-31, NFR-08 |
| ☐ | T-66 | Audit dış çapa (gece head hash) + yedek/geri yükleme tatbikatı | W11 | T-60 | 4 | Geri yüklemeden sonra zincir doğrulaması OK | US-38, FR-32 |
| ☐ | T-67 | Demo güvenliği: zarar simülasyonu betiği, kill switch sahnesi | W12 | T-54 | 3 | Provada sahne 4 hatasız | Demo |
| | | **Rol 3 toplam** | | | **~126** | | |

### 4.4 Rol 4 — Frontend & Değerlendirme

| Durum | ID | Görev | Hafta | Bağımlılık | Efor | Kabul kriteri | US/FR |
|---|---|---|---|---|---|---|---|
| ☐ | T-70 | GitHub repo, dal koruması, CODEOWNERS, CI iskeleti (ruff, mypy, pytest, pnpm), Projects board, PR şablonu | W1 | — | 6 | `main` korumalı; CI boş projede yeşil | NFR-14, NFR-15 |
| ☐ | T-71 | Next.js iskeleti + FastAPI auth (JWT 15 dk, argon2id, yenileme çerezi), giriş sayfası | W1–W2 | T-70 | 8 | Giriş/çıkış E2E; parola özeti argon2id | US-39, FR-33 |
| ☐ | T-72 | RBAC bağımlılıkları (Analist, Risk Officer, Admin, **Auditor** salt okunur) + rol × uç nokta yetki matrisi testleri | W2–W3 | T-71 | 6 | Matris testi tüm uçlarda geçer; Auditor her yazma ucunda 403 | US-39, US-54 |
| ☐ | T-73 | Canlı akış sayfası + canlı pano (SSE sayaçları, LLM kullanımı) | W3 | T-12 | 8 | Yeni bildirim ≤ 5 sn'de görünür | US-43, FR-35 |
| ☐ | T-74 | Onay kuyruğu UI: onayla/reddet/küçült, 409, TTL (Rol 2 ile) | W4 | T-34 | 8 | Büyütme engelli; Analist 403 | US-26, US-27 |
| ☐ | T-75 | Replay harness v0 (enjekte saat, önbellekli LLM, LangSmith izi kapalı) + baseline'lar (BIST-100 al-tut, eşit ağırlık, yalnızca `subject` kuralı) | W5 | T-16, T-55 | 10 | Aynı girdi → aynı sonuç; 3 baseline tabloda | US-50, FR-37 |
| ☐ | T-76 | P&L panosu vs baseline'lar | W6 | T-58, T-75 | 6 | Sürüm bazında eğriler | US-45 |
| ☐ | T-77 | Audit görüntüleyici + "Doğrula" düğmesi | W7 | T-60 | 5 | Kırık zincir UI'da görünür | US-36 |
| ☐ | T-78 | İz sayfası (düğüm sırası, süre, token; LangGraph `stream_events(version="v3")` → SSE; iz örneklendiyse LangSmith bağlantısı) | W7–W8 | T-36 | 5 | Her çalıştırma için sayfa (LangSmith bağlantısı yalnızca örneklenen çalıştırmalarda) | US-44 |
| ☐ | T-79 | Sabah KAP özeti sayfası + zamanlanmış iş | W8 | T-58 | 5 | İş günlerinde özet üretilir | US-42 |
| ☐ | T-80 | "Neden bu işlem?" ekranı | W9 | T-46 | 8 | Tüm bölümler, audit'ten | US-37, FR-31 |
| ☐ | T-81 | Admin: limit sürümleme (4 göz), kill switch paneli, evren/config | W9–W10 | T-54, T-72 | 8 | Aynı kullanıcı kendi limitini onaylayamaz | US-40, US-41 |
| ☐ | T-82 | E2E Playwright: giriş → akış → enjekte bildirim → onay → dolum → kill switch | W10 | T-80, T-81 | 6 | `main`'e PR'da yeşil | NFR-04 |
| ☐ | T-83 | Ablation + metrik raporu (Sharpe, Sortino, MDD, isabet, onay oranı; holdout ana kanıt, `v1.0-fwd`/`v1.1-fwd` destekleyici; "onaysız" ablation; gölge getiriler) → final grafikleri | W11 | T-44, T-75, T-68 | 8 | 5 kol tek tabloda, sürüm bazında | US-45, US-50, US-55 |
| ☐ | T-84 | Demo senaryo betiği (5 dk, 6 sahne) + kayıtlı yedek video | W11–W12 | T-48, T-67 | 5 | Video depoda; betik provada kullanıldı | NFR-04 |
| | | **Rol 4 toplam** | | | **~102** | | |

**Kritik yol:** T-10 → T-12 → T-13 → T-16 → T-52 → T-55 → T-56 → T-57 → **G2 (9 Kas)**. Bu zincirde gecikme ileri dönük testi kaydırır; lider bu görevleri haftalık izler, gerekirse diğer rollerden destek aktarır.

---

## 5. Definition of Done (Bitti tanımı)

Bir görev/US ancak aşağıdakilerin hepsi sağlanınca **Bitti** sütununa geçer:

1. Kabul kriterleri (PRD Given/When/Then) otomatik testlerle veya demo verisiyle gösterildi.
2. Testler yazıldı; toplam kapsam ≥ %80 korunuyor; `risk/` için %100 satır + dal.
3. CI yeşil (lint, tip, test, gitleaks, red-team, audit doğrulama).
4. PR en az 1 kişi tarafından incelendi; `risk/`, `brokers/`, `db/migrations/` için **2 kişi**.
5. Sır yok; yeni ayarlar `.env.example` ve `config/` içinde belgelendi.
6. Durum değiştiren her işlem audit olayı üretiyor.
7. Türkçe metin dokunan kodda İ/ı, cp1254 ve ondalık virgül testleri var.
8. Mimari etkisi olan karar ADR olarak yazıldı; README/runbook gerekiyorsa güncellendi.
9. `main`'e birleştirildi (squash), board kartı taşındı, bağlı US/T numaraları PR açıklamasında.
10. İleri dönük koşu başladıktan sonra: değişiklik davranışı etkiliyorsa yeni `strategy_version` açıldı.

---

## 6. Ekip çalışma anlaşması

### 6.1 Git akışı
- **Dallar:** `main` (korumalı, her zaman demo edilebilir). Çalışma dalları: `feat/T-xx-kisa-ad`, `fix/T-xx-...`, `docs/...`, `chore/...`, `test/...`. Uzun ömürlü `develop` dalı yok.
- **PR:** küçük tutulur (hedef ≤ 400 satır değişiklik); açıklamada T-xx, US-xx, test kanıtı; PR şablonu kullanılır. Birleştirme **squash**; `main`'e zorla itme yok.
- **Commit mesajları:** conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`. Örnek: `feat: risk kapısına fiyat bandı kuralı ekle (T-53, US-20)`.
- **CI geçmeden birleştirme yok.** CI'da gerçek LLM/broker çağrısı yok (`LLM_MODE=replay`, `BROKER_MODE=paper`).
- **İnceleme süresi:** PR'lar ≤ 24 saat içinde incelenir; bloke eden PR'da inceleyen doğrudan mesaj alır.
- **CODEOWNERS:** `risk/**`, `brokers/**`, `db/migrations/**` → 2 onay (biri Rol 3).
- **Sürüm etiketleri:** `rules-v1` (8 Kas), `v1.0-fwd` (9 Kas), `v1.1-fwd` (23 Kas), `v1.x-final` (freeze).

### 6.2 Toplantılar ve iletişim
- **Pazartesi ders saati (13:20–16:10) = haftalık senkron noktası:** ders sonrası/aralarında 20 dk: board turu (her kişi: bitti / bu hafta / engel), kapı değerlendirmesi (varsa), risk kaydı top-5.
- **Perşembe 30 dk çevrimiçi kontrol** (W1–W12): yalnızca engeller ve entegrasyon.
- **Yazılı kanal:** tek ekip kanalı; kararlar kanalda değil ADR'de/issue'da kalıcı olur. Sırlar asla kanala yazılmaz (SOPS/age veya parola kasası).
- **Devamsızlık:** müsait olmayacağını 48 saat önce haber ver; görevlerini devredecek kişiyi board'da işaretle.
- **Anlaşmazlık:** önce PR/issue üzerinde gerekçeli tartışma; 48 saatte çözülmezse lider karar verir ve ADR yazar.
- **Bilgi paylaşımı (bus factor):** risk kapısı ve graf eşli çalışılır; her modülün bir sahibi ve bir yedeği vardır (RACI §10).

### 6.3 Kişisel mod kuralları (ekip içi)
- Takım liderinin gerçek pozisyon verisi ders reposunda ve ders veritabanında tutulmaz (ayrı kurulum/şema).
- Sistem çıktıları (öneri, fiş) ekip dışına ve ekip üyeleri arasında **yatırım tavsiyesi olarak** paylaşılmaz; ortak para yoktur.

---

## 7. Araçlar

### 7.1 GitHub Projects board

| Sütun | Anlamı | Kural |
|---|---|---|
| **Backlog** | Tüm T-xx ve US-xx kartları | Öncelik (M/S/C) ve hafta alanı dolu olmalı |
| **Bu hafta (Hazır)** | Pazartesi senkronunda seçilenler | Bağımlılıkları bitmiş olmalı |
| **Devam ediyor** | Üzerinde çalışılan | **WIP sınırı: kişi başı 2 kart** |
| **İncelemede** | PR açık | 24 saat içinde incelenir |
| **Test / Kabul** | Birleşti, kabul kriteri doğrulanıyor | Sahip + inceleyen kabul eder |
| **Bitti** | DoD sağlandı | — |
| *(etiket)* **Engelli** | Herhangi bir sütunda, engel notuyla | Lider aynı gün bakar |

**Özel alanlar:** Rol (V/A/S/F), Hafta (W1–W12), Öncelik (M/S/C/W), Efor (saat), Epik (EP-01…EP-11), Bağlı US, Kapı (G0–G5).
**Etiketler:** `epic:*`, `role:*`, `risk`, `security`, `tr-text`, `demo`, `blocked`, `good-first`.
**Milestone'lar:** G0 Proposal, G1 Walking skeleton, G2 Forward start, G3 Progress, G4 Freeze, G5 Final.

### 7.2 Diğer araçlar
- Kod: Python 3.12 + `uv`, `ruff`, `mypy`, `pytest` (+ `hypothesis`, `pytest-asyncio`, `pytest-cov`, `pytest-recording`); Node 22 + `pnpm`, Next.js, Playwright.
- Altyapı: Docker Compose, GitHub Actions (ci + nightly-replay), SOPS/age, gitleaks, Dependabot.
- İzleme: LangSmith Developer (ayda 5K iz, 14 gün saklama → örnekleme; CI/replay'de kapalı; kalıcı kayıt audit zinciri); kendi pano sayfaları.
- Doküman: `docs/adr/`, `docs/runbooks/` (kill switch, anahtar döndürme, ileri dönük günlük kontrol), `docs/proposal|progress|final/`.

---

## 8. Hafta 1 — gün gün kontrol listesi (5–11 Ekim 2026)

**Ön hazırlık (W0, 29 Eyl – 4 Eki, isteğe bağlı):** herkes kanonik kararları ve PRD'yi okur; Rol 1 MKK API Portal'a başvurur ve kapdestek@mkk.com.tr'ye akademik erişim sorusunu gönderir; herkes Gemini/Groq hesabını açar; Azure for Students ve TCMB EVDS anahtarı alınır.

### Pazartesi 5 Eki (ders günü)
- [ ] **Hepsi:** Ders sonrası kickoff (45 dk): isim, rol ataması, çalışma anlaşması (T-01).
- [ ] **Lider:** Hocaya proposal/progress/final tarihlerini ve vize haftasını sor (AS-01); kişisel mod ve persona kabulünü sor (AS-02).
- [ ] **Rol 4:** GitHub repo, dal koruması, board sütunları ve milestone'lar (T-70 başlangıç).
- [ ] **Rol 1:** İşlem saatinde (10:00–18:00) KAP poller prototipini çalıştır, gecikmeyi loglamaya başla (T-10).

### Salı 6 Eki
- [ ] **Hepsi:** Gemini AI Studio + Groq + LangSmith gerçek limitlerini ölçüp `config/quotas.yaml`'a yaz; Gemini Flash-Lite tam sürüm ID'sini dondur (T-02).
- [ ] **Rol 3:** `docker-compose.yml` (pgvector pg17, redis), `.env.example`, `secrets/` + SOPS/age, gitleaks pre-commit (T-50).
- [ ] **Rol 1:** KAP ve AA/Foreks RSS kullanım şartlarını oku, notu `docs/`'a yaz (AS-04).
- [ ] **Rol 2:** `models.yaml` taslağı; Gemini Flash-Lite / Groq gpt-oss / Ollama ile tek satırlık yapılandırılmış çıktı denemesi (yalnızca sentetik metin; maskelenmemiş gerçek bildirim metni ücretsiz sağlayıcıya gitmez).

### Çarşamba 7 Eki
- [ ] **Rol 1:** Veri şeması v0 migrasyonu (T-11).
- [ ] **Rol 2:** Sahte LLM ile graf iskeleti + `DeskState` (T-30).
- [ ] **Rol 4:** CI iskeleti (ruff, mypy, pytest, pnpm, gitleaks) yeşil (T-70); Next.js iskeleti.
- [ ] **Rol 3:** Domain şemaları (frozen Pydantic, `Decimal`) + `Broker` protokolü (T-51 başlangıç).

### Perşembe 8 Eki
- [ ] **Rol 1:** 1 günlük KAP çekimi → `subject` dağılımı (kaç bildirim, kaçı gürültü, kaçı E1–E4 adayı); fixture kaydet. bge-m3 CPU hızını 1.000 parçayla ölç (T-18 girdisi).
- [ ] **Rol 3:** Fiyat kaynağı doğrulaması: THYAO için İş Yatırım (ham `HG_KAPANIS` + düzeltilmiş `HGDG_KAPANIS`, ≥ 90 sn timeout) vs yfinance (düzeltilmiş), `Volume == 0` satırları, düzeltme faktörü kontrolü; risk kapısı iskelet testleri.
- [ ] **Rol 2 + Rol 3:** Olay taksonomisi v0 taslağı (E1–E4 + çıkış filtreleri + diğer).
- [ ] **Hepsi:** 30 dk çevrimiçi kontrol; proposal bölümleri paylaştırılır (T-03).

### Cuma 9 Eki
- [ ] **Hepsi:** `docker compose up` 4 makinede (Windows'ta WSL2, `.gitattributes` ile LF).
- [ ] **Rol 4:** FastAPI auth iskeleti (T-71 başlangıç).
- [ ] **Lider:** ADR 0001–0007 başlıkları (LangGraph, PGVectorStore, Redis Streams, risk kapısı otoritesi, broker protokolü, model yönlendirme, BIST canlı mekân: açık).
- [ ] **Rol 1:** Gecikme ölçüm sonucu (p50/p95) → proposal'a girdi.

### Cumartesi–Pazar 10–11 Eki
- [ ] **Hepsi:** Proposal taslağı tamam (problem, persona, mimari şekli, MVP/stretch, 4 katmanlı değerlendirme, takvim, roller, riskler).
- [ ] **Lider:** İç inceleme ve son okuma; teslim formatını kontrol et.
- [ ] **Rol 1:** Backfill'i arka planda başlat (1 istek / 2 sn, HTTP 666'da geri çekilme, devam edebilir).

**W1 çıkış kriterleri:** compose 4 makinede · CI yeşil · poller gecikmesi ölçüldü · kota değerleri dosyada · proposal taslağı hazır · board dolu (tüm T-xx kartları).

---

## 9. Progress raporu şablonu (W8, 23 Kas)

1. **Kapak ve özet** (½ sayfa): proje, ekip, tek cümle, ilerleme durumu (yeşil/sarı/kırmızı).
2. **Plan vs gerçekleşen:** G0–G3 kapı sonuçları; haftalık tabloya göre sapmalar ve nedenleri.
3. **Tamamlanan işler:** Must US listesi (kabul edildi / kısmi / başlamadı), T-xx bağlantıları, ekran görüntüleri.
4. **Mimari ve kararlar:** güncel graf diyagramı; yeni ADR'ler; kanonik kararlardaki değişiklikler.
5. **Değerlendirme ara sonuçları:**
   - Sınıflandırma: 300 altın set (100 geliştirme + 200 kilitli), κ, kilitli test setinde E1–E4 + X + O F1, model karşılaştırması.
   - RAG: hibrit vs dense recall@10; RAGAS ilk sonuçları (varsa); retrieval zaman ihlali sayısı.
   - Olay çalışması + holdout (ana sayısal kanıt): `rules-v1` ön kaydı, holdout sonuçları (maliyet öncesi/sonrası).
   - İleri dönük paper (destekleyici): `v1.0-fwd`'nin ilk 2 haftası, `v1.1-fwd` başlangıcı, işlem sayısı, risk kapısı ret sayıları, gölge getiriler, gecikme p50/p95.
6. **Güvenlik ve kalite:** test kapsamı (toplam / risk), red-team sonuçları, audit doğrulaması.
7. **Riskler:** risk kaydının top-5'i ve önlemlerin durumu.
8. **Kalan plan:** W9–W12 + tampon, kapsam kararları (MVP/stretch).
9. **Ekip katkıları:** rol bazında tamamlanan görevler, PR/commit sayıları, yaklaşık saat.
10. **Hocadan istenen geri bildirim:** 2–3 somut soru.
- **Ekler:** sürüm etiketleri, kullanılan veri kaynakları ve şartları, feragatname.

---

## 10. RACI tablosu

**R** = Yapan · **A** = Hesap veren (tek kişi) · **C** = Danışılan · **I** = Bilgilendirilen. "Lider" sütunu, liderin rolüne ek olarak taşıdığı sorumluluktur.

| Faaliyet | Rol 1 V | Rol 2 A | Rol 3 S | Rol 4 F | Lider |
|---|---|---|---|---|---|
| KAP poller + backfill | **A/R** | I | C | I | I |
| Fiyat + kurumsal işlemler | **A/R** | I | C | I | I |
| Türkçe metin/tutar parser | **A/R** | C | C | I | I |
| RAG tabanları + hibrit arama | **A/R** | C | I | I | I |
| LangGraph grafı + 6 ajan | C | **A/R** | C | I | I |
| Birleştirme düğümü | I | **A/R** | R | I | I |
| Kota bekçisi + önbellek + HOLD | I | **A/R** | C | I | I |
| Onay (`interrupt`) + resume API | I | **A/R** | C | R | I |
| Olay çalışması motoru | C | I | **A/R** | C | I |
| Kural motoru E1–E4 | C | C | **A/R** | I | C |
| Risk kapısı + kill switch | I | C | **A/R** | C | C |
| Broker adapter'ları (SimBIST, OrderTicket) | I | I | **A/R** | I | C |
| Audit hash zinciri | I | C | **A/R** | R | I |
| RBAC + auth | I | I | C | **A/R** | I |
| Frontend (pano, onay, "Neden bu işlem?", admin) | I | C | C | **A/R** | I |
| CI/CD + repo düzeni | C | C | C | **A/R** | I |
| Sırlar ve güvenlik (SOPS, gitleaks, inceleme) | C | C | **A/R** | C | I |
| Altın set (300) etiketleme | R | **A/R** | R | R | I |
| RAGAS (50 soru) | **A/R** | C | I | R | I |
| Replay + baseline + ablation raporu | C | R | C | **A/R** | I |
| Red-team seti | I | R | **A/R** | C | I |
| `rules-v1` ön kaydı + holdout | C | C | **A/R** | C | C |
| İleri dönük koşu operasyonu | C | C | **A/R** | C | I |
| Proposal / Progress raporu | R | R | R | R | **A** |
| Final demo + slayt + video | R | R | R | R | **A** |
| Kapı kararları, kapsam, hoca iletişimi | C | C | C | C | **A/R** |
| Risk kaydı güncellemesi | C | C | C | C | **A/R** |
| Kişisel mod (OrderTicket kullanımı) | I | I | C | I | **A/R** |

---

## 11. Efor özeti

| Kalem | Rol 1 | Rol 2 | Rol 3 | Rol 4 |
|---|---|---|---|---|
| Rol görevleri | ~112 | ~119 | ~126 | ~102 |
| Ortak görevler (T-01…T-08) | ~53,5 | ~53,5 | ~53,5 | ~53,5 |
| **Toplam** | **~166** | **~173** | **~180** | **~156** |

Toplamlar ~155 saat/kişi kapasitenin biraz üzerindedir: **Could görevleri (T-27'nin Chroma kısmı, T-45) ilk kesilecek kalemlerdir.** Rol 3 en yüklü roldür; lider Rol 3'te değilse T-59 (ileri dönük operasyon) lider ile paylaşılabilir.

---

## 12. Önerilen değişiklikler — durum (Revizyon 2)

| # | Konu | Öneri | Gerekçe | Durum (Revizyon 2) |
|---|---|---|---|---|
| Ö-1 | W6 dondurma vs W7 ajanlar | `v1.0-fwd` (9 Kas, kurallar + Sınıflandırıcı/Okuyucu + deterministik uyum) ve `v1.1-fwd` (23 Kas, tam ajan zinciri) iki paralel ileri dönük kol. | Kanonik takvimde ajanlar dondurmadan sonra geliyor; bu çözüm aynı zamanda "şüphecisiz" ablation kolunu verir. (PRD Ö-1) | ✅ Kabul edildi ve uygulandı (`v1.0-fwd` = Sınıflandırıcı + kurallar; tedbir kontrolü LLM'siz ön elemede) |
| Ö-2 | Hafta numaraları | W1–W11 ardışık (5 Eki–14 Ara), **tampon 21 Ara–3 Oca**, W12 = 4 Oca 2027, Final 11 Oca haftası (teyit). | Kanonik "W12 Oca" ile ardışık numaralandırma çelişiyor; tamponu açık gösterir. (PRD Ö-2) | ✅ Kabul edildi ve uygulandı (final tarihi "11 Oca haftası" yerine "hocadan teyit edilecek") |
| Ö-3 | Audit zinciri haftası | Kanonik "W9–W10 audit" yerine hash zinciri tetikleyicisini **W7**'ye çekmek (T-60). | İleri dönük koşu 9 Kas'ta başlıyor; audit zinciri koşunun ilk haftalarından itibaren kayıt tutmalı. En geç W6'da basit append-only tablo, W7'de zincir. | ✅ Kabul edildi ve uygulandı |
| Ö-4 | AlpacaPaper | Stretch (Could). | Efor BIST MVP'sinden çalınır. (PRD Ö-4) | ✅ Kabul edildi ve uygulandı |
| Ö-5 | Vize haftası | Hoca vize tarihini verince o haftanın efor planı %50'ye düşürülür; kritik yol görevleri vizeden önceki haftaya çekilir. | Midterm %15; kapasite düşüşü planlanmalı (R-30). | ✅ Kabul edildi (Revizyon 2): vize haftası kapasitesi %50; tarih W1'de akademik takvimden işlenir |
| Ö-6 | Revizyon 3 hizalaması | T-28 (kişi adı maskeleme) W4 → **W2**; T-02, T-10, T-12–T-18, T-23, T-30, T-32, T-36, T-40, T-42, T-52, T-53, T-57, T-58, T-75, T-78 açıklama/kabul kriterleri güncellendi (kendi httpx KAP istemcisi + WAF 666, tip bazlı ayrıştırıcılar, İş Yatırım ham fiyat + `ticker_history` + `Volume == 0` filtresi, `fundamentals_pit.available_at`, Flash-Lite ana model ve yeni zincir, LangSmith örnekleme, maliyet senaryoları). Saat tahminleri değişmedi. | Ücretsiz Gemini girdileri ürün geliştirmede kullanılabilir → maskeleme ilk LLM çağrısından (W3) önce açık olmalı; diğerleri canlı doğrulanmış bulgular. | ✅ Uygulandı (Revizyon 3) |
