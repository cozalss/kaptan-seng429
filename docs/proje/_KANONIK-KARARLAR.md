# KAPtan — Kanonik kararlar (tüm dokümanlar buna uymalı)

Bu dosya tüm proje dokümanlarının ortak doğruluk kaynağıdır. Bir doküman bu kararlardan birini değiştirmek isterse, sessizce değiştirmez; dokümanın sonuna "Önerilen değişiklikler" bölümü ekler.

---

## REVİZYON 3 — doğrulanmış bulgular ve düzeltmeler (30.09.2026)

> Fizibilite araştırmasının sonuçları: KAP ve fiyat verisi **canlı denendi**, akademik ve teknik iddialar kaynağından kontrol edildi. **Bu bölüm Revizyon 2 ve orijinal metinle çelişirse bu bölüm geçerlidir.** Kapsam **değişmez**: 6 LLM ajanı ve tüm özellikler aynen kalır; stretch olanlar stretch kalır.

### Veri: KAP (canlı test, 30.09.2026)
- **Çalışıyor [V]:** `POST /tr/api/disclosure/list/main` ve `POST /tr/api/disclosure/members/byCriteria` (anahtarsız, 0,2–0,5 sn), `GET /tr/Bildirim/{idx}` (HTML/RSC), `GET /tr/api/BildirimPdf/{idx}` (PDF). Geçmiş tarih sorgusu çalışıyor (2020 dahil) → **backfill mümkün**. Tarayıcı User-Agent + `Origin`/`Referer` başlıkları kullanılır.
- **WAF [V]:** MKK'nın kendi WAF'ı var; `robots.txt` bile **HTTP 666** döndürüyor. Kibar polling (seans içi ≥ 30 sn, backfill ≥ 2 sn/istek) zorunlu; 666 yanıtı geri çekilme sinyalidir.
- **`kap-client` bağımlılık olarak kullanılmaz [V]:** 1.2.0 sürümü şirket listesini IGS (borsada işlem gören şirketler) üye tipinden çekmediği için BIST hisselerinde `CompanyNotFoundError` veriyor. **Kendi httpx istemcimiz (`kap_client.py`) tek yoldur**; `kap-client` yalnızca kaynak kodu referansı (ör. ek uçları). `borsapy` 0.11.0 fiyat/kurumsal işlem için kullanılır.
- **Ayrıştırıcı bildirim tipine göre değişir [V]:** `oda_ExplanationTextBlock` anahtarı her tipte yok (ör. geri alım bildiriminde tablo metinden okunur). Tip bazlı ayrıştırıcılar + fixture testleri.
- **Konu taksonomisi gerçek satırlardan kurulur [V]:** `/tr/api/disclosure/subjects/ODA/IGS` yalnızca 13 konu döndürüyor (eksik). **"Yeni İş İlişkisi" ayrı bir `subject`** → E3'ün çoğu LLM'siz tiplenir; ayrıca "İhale Süreci / Sonucu" konusu var.
- **Yıllık aday sayıları (24 rastgele iş günü, Eki 2025–Eyl 2026) [V, yıllıklandırma ≈]:** tüm bildirimler ~68.600 · gerçekleşen geri alım ~1.100 · pay alım satım (yönetici/ana ortak, alış+satış) ~2.000 · Yeni İş İlişkisi ~600 · İhale ~385 · Finansal Rapor ~2.700 (mevsimsel) · devre kesici ~13.900 (gürültü). **Bildirim ≠ bağımsız olay:** geri alımlar 45 şirkette yoğunlaşıyor ve düşüş günlerinde patlıyor (29.09.2026: 47 geri alım) → olay çalışmasında şirket + pencere bazında kümeleme zorunlu.
- **Günlük hacim (kanonik ifade):** iş günü başına **~270–350 bildirim** (24 günlük ortalama ~275; düşüş/yoğun günlerde 330+). Devre kesici gürültüsü **~%20–28** (24 günlük örnek ~%20, önceki 6 günlük örnek ~%28; piyasa oynaklığıyla değişir). Dokümanlarda tek başına geçen "günde ~350" bu aralığın üst ucudur.
- **E1 konu adı [V]:** güncel `subject` = **"Payların Geri Alınmasına İlişkin Bildirim"**; "Geri Alınan Paylara İlişkin Bildirim" yalnızca eski dönem (backfill) eşlemesi. **"Geri Alınan Payların Elden Çıkarılması" satıştır, E1 değildir** (FILTER).
- **Kullanım koşulları:** otomatik çekme için açık izin/yasak metni bulunamadı. Akademik ve ticari olmayan kullanım beyan edilir, veri yeniden dağıtılmaz, ham arşiv özel repoda kalır (mevcut kural sürer).

### Veri: fiyat ve temel veri (canlı test)
- **yfinance [V]:** 2018'den bugüne eksiksiz; `Close` **bölünme/bedelsize göre düzeltilmiş** ve İş Yatırım düzeltilmiş kapanışıyla birebir aynı. **Ham fiyat vermez.**
- **Ham fiyat İş Yatırım'dan [V]:** `HG_KAPANIS` (ham) + `HGDG_KAPANIS` (düzeltilmiş) + günlük `SERMAYE` ve `PD` (piyasa değeri). **SimBIST dolumları, fiyat bandı ve tavan/taban kontrolleri (R09) ham fiyatla yapılır**; getiri hesabı düzeltilmiş fiyatla.
- **Sahte tatil satırları [V]:** yfinance'te hacmi 0 ve fiyatı değişmeyen ~31 gün var (ör. Kurban Bayramı). `Volume == 0` satırları atılır, takvim `market_calendar`/XU100'e hizalanır.
- **Kod değişimleri [V]:** eski kod çalışmaz (ör. KOZAL → TRALT). `ticker_history` eşleme tablosu gerekir.
- **Borsadan çıkanlar [V]:** yfinance/borsapy boş döner; **İş Yatırım veri verir** → hayatta kalma yanlılığı için İş Yatırım kullanılır.
- **isyatirimhisse [V]:** sabit `timeout=10` yüzünden çağrıların çoğu zaman aşımına düşüyor; uç doğrudan ≥ 90 sn timeout ile çağrılır (ince sarmalayıcı).
- **Temel veri [~]:** `SERMAYE` ve `PD` günlük ve point-in-time (E1 %0,25 eşiği ve E3 yedeği için yeterli). Hasılat çeyreklik ve **yılbaşından kümülatif**, **açıklanma tarihi yok**, sonradan düzeltilmiş olabilir → `fundamentals_pit.available_at` KAP "Finansal Rapor" bildiriminin `publishDate`'inden alınır; bulunamazsa dönem sonu + yasal son başvuru süresi (muhafazakâr).
- **EVDS** ücretsiz anahtar ister.

### Maliyet
- Borsa payı %0,0025 [V]. Banka aracı kurumları binde ~1,9–2 (+ komisyon üzerinden %5 BSMV) [V]. **Midas ve Enpara Yatırım'da BIST komisyonu %0** [V/ikincil] → kişisel moddaki "≤ %0,05 / taraf" şartı karşılanabilir.
- SimBIST maliyet modeli: **baz senaryo %0,05 / taraf + hacme bağlı kayma**, duyarlılık senaryosu %0,20 / taraf. Asıl maliyet düşük likit hisselerdeki alış-satış farkı ve piyasa etkisidir.

### LLM sağlayıcıları ve kota
- **Gemini ücretsiz katmanı değişti [ölçülmüş, resmî tablo yok]:** Google artık limit yayımlamıyor. Flash modelleri ~5 RPM / **~20 RPD** → ana model olamaz. **Flash-Lite ~15 RPM / ~500 RPD** (proje başına). **Ana model = Gemini Flash-Lite**; eski "Gemini Flash" atamalarının hepsi Flash-Lite olur. İhtiyaç: 30–60 karar × 4 Gemini ajanı ≈ 120–240 istek/gün → sığar. Tam sürüm model ID'leri W1'de AI Studio'dan okunup dondurulur.
- **Groq [V]:** Llama sohbet modelleri ücretsiz katmandan kalktı (Ağu 2026). `openai/gpt-oss-120b` gibi kalan modeller ~1K RPD / ~200K TPD. **Llama Prompt Guard 2 hâlâ ücretsiz** (30 RPM, 14,4K RPD). Sınıflandırıcı ve Şüpheci Groq'ta kalır; günlük token tavanı kota bekçisinde izlenir.
- **Geri dönüş zinciri:** Gemini Flash-Lite ⇄ Groq gpt-oss → **Azure for Students** ($100 kredi, 12 ay, kart yok) → Ollama Qwen (yerel) → HOLD. Başka hesap açarak kota aşılmaz (mevcut kural). İleri dönük koşu kendi ayrı anahtarını kullanır; RAGAS hakemi de ayrı anahtar.
- **KVKK [V]:** Gemini ücretsiz katmanında girdiler ürün geliştirmede kullanılabiliyor ve insanlar okuyabiliyor; AB istisnası Türkiye'yi kapsamıyor. **Kişi adı maskeleme ilk LLM çağrısından itibaren (W3) açık olur**; maskelenmemiş metin hiçbir ücretsiz sağlayıcıya gitmez.
- **LangSmith Developer [V]:** $0, 1 koltuk, ayda 5K iz, 14 gün saklama → iz örnekleme; CI ve replay'de iz kapalı. Kalıcı kayıt zaten audit zinciridir.
- **Kütüphaneler [V]:** LangGraph 1.2.x (`Send`, `interrupt`, `Command(resume=)`, `AsyncPostgresSaver` doğru; akış için `stream_events(version="v3")`), langchain-postgres `PGEngine` + `PGVectorStore` (PGVector kullanımdan kalktı), RAGAS 0.4.3 (`ragas.metrics.collections`).
- **bge-m3 CPU'da yavaş [≈]:** ~5–15 parça/sn tahmini → yalnızca filtrelenmiş bildirimler ve mevzuat gömülür; W1'de 1.000 parçayla ölçülür; toplu gömme için Colab GPU.
- **Alpaca [V]:** paper hesap Türkiye'den açılabilir; Benzinga haberinin ücretsiz olup olmadığı belirsiz (AlpacaPaper zaten stretch).

### Akademik kanıt düzeltmeleri
- **Ersan vd. (2021) yanlış kullanılmıştı:** çalışma (2015–2017, 9.223 duyuru) fiyat tepkisinin **saniyeler içinde** başladığını 300 sn'lik pencerede ölçer. "BIST yavaş fiyatlıyor, günler/haftalar süren avantaj var" gerekçesi olarak **kullanılmaz**; doğru kullanım: "basit bilgi saniyeler içinde fiyatlanır, yavaş sistem yalnızca karmaşık/yavaş fiyatlanan bilgide şans bulabilir."
- **Ünal (2022):** BIST-100 şirketleri, 2015–2020, 711 geri alım; endekse göre fazla getiri **1 ayda +%2,0, 3 ayda +%3,4**. Kısıtlar: **işlem tarihinden** ölçülmüş (bildirim tarihinden değil), **maliyet yok**, basit t-testi, 2021 öncesi rejim. Yönetici alımlarında n = 89 (+%1,5 / 30 gün, +%4,4 / 90 gün). *(Makaleden doğrulandı: Tablo 4; şirketin kendi geri alımları makalede bir "içeriden öğrenen" profili olarak ele alınıyor; n'ler bağımsız olay değil işlem sayısıdır; yazar, geri alımların piyasa zamanlaması başarılı olsa da **hisse seçimi performansının düşük** olduğunu not ediyor.)* Dokümanlardaki "~+%1,5–2" ifadesi bu kaynakla ve kısıtlarıyla birlikte yazılır.
- **E3 (yeni iş/ihale) için BIST'e özgü olay çalışması bulunamadı.** En yakını Eyüboğlu & Bulut (2016, BIST-30, "operasyonel haber"). E3 **keşifsel** olay türüdür; kanıtı yalnızca kendi olay çalışmamızdan gelir.
- **Yayın sonrası bozulma:** McLean & Pontiff — anomali getirileri yayından sonra ~%58 düşer. Literatür rakamları üst sınır sayılır.
- **StockBench:** "çoğu model al-tut'u geçemedi" (bazıları geçti). **Alpha Arena 1.5:** iki haftalık, rakam ikincil kaynaktan → destekleyici, zayıf kanıt olarak sunulur. **FINSABER** doğrulandı.
- **Türkçe arama:** "dense arama TF-IDF'i geçemedi" yerine **"Türkçede BM25, dense ve hibrit arasında anlamlı fark bulunmadı (dense'in açık üstünlüğü yok)"**. Hibrit arama dayanıklılık için korunur.
- **Türkçe finansal sınıflandırma:** ince ayarlı modeller istemle çalışan genel LLM'leri geçebiliyor; KAP'a özgü ölçüm yok → macro-F1 ≥ 0,85 hedefi altın sette doğrulanır.
- **Beklenti:** maliyet sonrası kalıcı pozitif anormal getiri olasılığı kabaca **%20–35**. Yıllık 0 ile +%5 aralığı korunur; **sıfır veya negatif sonuç geçerli bir bulgudur** ve araştırma iddiası (kurallı LLM vs serbest LLM) her durumda test edilir.

### Türkiye güncel
- **SPK 22.09.2026 kararı (60/1711) netleşti:** kaldırılan, geri alımlardaki **toplam tutar üst sınırıdır** (fiyat sınırı değil) ve **geçicidir**. Sonraki hafta 60 şirket ~1,99 milyar TL geri alım yaptı. Revizyon 2'deki "doğrulanmadı" maddesi kapanır. Alt grup adı `post_spk_2026` / "geri alım dalgası" korunur; açıklaması "toplam tutar sınırının kaldırılması" olarak yazılır. Geri alımların "piyasa destekleme" amaçlı artması sinyalin bilgi değerini seyreltebilir → dalga alt grubu ayrı raporlanır (mevcut kural).
- **Fon tasfiyesi:** 7 portföy şirketinin **131** fonu (SPK bülteni 2026/61, 17.09.2026).
- **KAP TR+EN eşzamanlı yayın** 1 Ekim 2026'dan itibaren tüm halka açık ortaklıklar için zorunlu (SPK 49/1489) [V].
- **Algolab 31.12.2025'te kapandı** [V, ikincil kaynak].

---

## REVİZYON 2 — kabul edilen değişiklikler (30.09.2026)

> Yazar ajanların "Önerilen değişiklikler" bölümlerinden kabul edilenler. **Bu bölüm aşağıdaki orijinal metinle çelişirse bu bölüm geçerlidir.**

### Takvim ve ileri dönük test
- Haftalar ardışık: W1 5 Eki · W2 12 Eki (Proposal) · W3 19 Eki · W4 26 Eki · W5 2 Kas · W6 9 Kas · W7 16 Kas · W8 23 Kas (Progress) · W9 30 Kas · W10 7 Ara · W11 14 Ara · **Tampon 21 Ara – 3 Oca** · **W12 4 Oca 2027** (freeze + prova) · Final Ocak 2027 (tarih hocadan).
- İki ileri dönük paper sürümü: **`v1.0-fwd` (9 Kas; Sınıflandırıcı + kurallar, Kanıt/Şüpheci/Uyum yok)** ve **`v1.1-fwd` (23 Kas; tüm ajanlar)**. v1.0 aynı zamanda "şüphecisiz/ajansız" ablation'ıdır.
- **Ana sayısal kanıt = holdout backtest** (2025-01-01 → 2026-10-31, **yalnızca bir kez** çalıştırılır). 20–60 günlük tutmalarla forward paper'da az işlem kapanacağı için forward test destekleyici kanıttır.
- Audit hash zinciri **W7**'de devrede (forward test kaydedilirken).

### Kapsam
- `AlpacaPaper` → **stretch**. Genel PDF ayrıştırma → **stretch** (E4 için yapılandırılmış finansal veri kullanılır). 2012–2017 backfill → stretch. Ayrı "Fon Yöneticisi" onay rolü → stretch.
- **Demo modu** kanoniktir: enjekte edilen bildirim fixture'ları + replay.

### Ajanlar ve karar akışı
- **Otomatik yürütme yok:** risk kapısından geçen her öneri insan onayına gider.
- Okuyucu ve Önemlilik **ikisi de tutarı çıkarır**; fark >%5 → kural motoru reddeder.
- Onay süresi: **bir sonraki seansın 09:50'sinde** düşer.
- E3 yedeği: yıllık gelir karar tarihinde yoksa **tutar / piyasa değeri**.
- E4: ek **10 seans / %12 yükseliş** sızıntı kontrolü. E1: **geri alım dalgası** (SPK 22.09.2026 geri alım toplam tutar sınırının kaldırılması — Revizyon 3) alt grubu ayrı analiz. E2 TL eşikleri enflasyona göre güncellenir.
- Stop: **kapanış bazlı ATR**; 0,5% risk büyüklüğü `stop_pct` ile hesaplanır.

### Risk ve kill switch
- Kill switch **açık emirleri iptal eder, açık pozisyonları satmaz** (pozisyonlar kendi çıkış kurallarıyla kapanır). Admin ve Risk Officer tetikleyebilir; reset = Admin + Risk Officer. **Kişisel mod (tek kişi):** iki onay arası ≥24 saat + 5 seans bekleme.
- **Ekip içeriden-öğrenen engel listesi** (ekip üyelerinin bağlantılı olduğu hisseler).
- Serbest karar veren LLM baseline'ı **aynı risk kapısından** geçer ve yalnızca model eğitim tarihi sonrası olaylarla değerlendirilir.
- Reddedilen sinyallerin **gölge getirileri** forward testte izlenir.

### Veri, RAG ve güvenlik
- KAP polling seans içinde **≥30 sn** (15 sn değil).
- Olay hafızası getirileri chunk metadata'sından değil **`event_returns` tablosundan, `available_at` point-in-time filtresiyle** okunur. Holdout getirilerini geliştirme notebook'larından gizleyen view.
- Türkçe FTS, Türkçe küçük harfe çevrilmiş kolonda.
- **Kişi isimleri LLM'e ve LangSmith'e gitmeden maskelenir** (KVKK).
- Prompt Guard'a ek **Türkçe kural tabanlı injection kontrolü**.
- Audit hash: kanonik JSON dizisi + `run_id` dahil.
- Ek tablolar: `fundamentals_pit`, `restricted_securities`, `universe_daily`, `market_calendar`, `agent_outputs`.
- Ek rol: **Auditor** (salt okunur).

### Değerlendirme hedefleri
| Metrik | Hedef |
|---|---|
| Sınıflandırma macro-F1 (kilitli test seti) | ≥ 0,85 |
| RAGAS faithfulness | ≥ 0,85 |
| RAGAS context precision | ≥ 0,70 |
| Retrieval zaman ihlali (`published_at`/`available_at`) | **0 (sert kapı)** |
| Red-team: kötü niyetli vakadan çıkan emir | **0 (sert kapı)**; engelleme ≥ %95 |
| Zararsız kontrol vakalarında yanlış alarm | ölçülür, raporlanır |
| Karar gecikmesi p95 | < 60 sn |
- Altın set: 300 bildirim = **100 geliştirme + 200 kilitli test**; sınıflar E1–E4 + **X (filtre/kaçın)** + **O (diğer)**.
- Red-team seti: ≥30 kötü niyetli + zararsız kontrol vakaları.

### Ajan spesifikasyonundan eklenenler
- **Önemlilik ajanı yalnızca sayıları getirir** (finansallar, piyasa değeri, kur). Oranları deterministik **Birleştirme düğümü** Okuyucu'nun tutarıyla hesaplar. (Bu, yukarıdaki "ikisi de tutarı çıkarır, fark >%5 → ret" kuralının **yerine geçer**.) Ek kontrol: Okuyucu'nun tutarı, bildirim metninden regex ile çıkarılan tutarlar arasında yoksa → ret.
- **Kanıt ajanı geçmiş olayları getirilerini görmeden seçer**; istatistikleri (ortalama CAR, isabet oranı, n) kod hesaplar.
- **LLM öncesi LLM'siz eleme:** işlem görebilir hisse, SPK tedbiri, evren filtresi.
- E2 yalnızca **yönetici / yönetim kurulu üyesi / kontrol eden pay sahibi**; fon eşik bildirimleri (%5 vb.) E2 değildir.
- Yinelenen olay: yalnızca **"Düzeltme"** yeni olay sayılmaz; "Güncelleme: Evet" gerçekleşen işlem bildirimi olabilir.
- Tam metin kaynağı olarak `/tr/api/BildirimPdf/{idx}` de kullanılır.
- E3 önemlilik: **yıllıklandırılmış tutar ≥ yıllık gelirin %10'u**; süre belirtilmemişse toplam tutar. Döviz tutarlar karar tarihindeki TCMB kuruyla TL'ye çevrilir.
- Backtest modunda onay **simüle** edilir (her öneri onaylanmış sayılır; ayrıca "onaysız" ablation raporlanır).
- Model kimlikleri **tam sürüm ID'siyle dondurulur** (alias değil); prompt hash'leri `v1.0-fwd`/`v1.1-fwd` manifestinde.
- Sistem prompt'ları İngilizce + Türkçe terim sözlüğü; serbest metin çıktıları Türkçe. Tamamen Türkçe prompt varyantı altın sette karşılaştırılır.
- **Risk kapısı kurallarının tek kaynağı `06-strateji-ve-kurallar.md` (R01–R16)**; diğer dokümanlar kural ID'leriyle ona referans verir: R01 kill switch/zirveden −%5 · R02 günlük −%1 · R03 evren · R04 tedbirler (+ >24 sa bayat tedbir verisi) · R05 kanıt · R06 avantaj ≥ 2× maliyet · R07 büyüklük · R08 portföy limitleri · R09 fiyat bandı/tavan/bayat fiyat · R10 kriz rejimi · R11 veri & LLM sağlığı, injection · R12 mod/3 anahtar/long-only/kaldıraçsız · R13 ekip içeriden-öğrenen listesi · R14 tutar çapraz kontrolü · R15 zorunlu onay, 09:50 son kullanma · R16 gönderimde yeniden kontrol + fiş TTL.

### Denetim turunda netleşenler (30.09.2026)
- **v1.0-fwd'de Kanıt ajanı yok:** R05 için emsaller **kod tarafından olay türü düzeyinde** hesaplanır (tür bazlı geçmiş CAR istatistiği).
- **E3 yedek eşiği:** tutar / piyasa değeri **≥ %5** (geçici; olay çalışmasında doğrulanacak).
- **Gölge aşaması:** **≥ 4 hafta ve ≥ 10 emir fişi**.
- **SPK 22.09.2026 kararı:** ~~geri alımlarda kaldırılan sınırın niteliği doğrulanmadı~~ → **Revizyon 3'te doğrulandı:** kaldırılan, geçici olarak **toplam tutar üst sınırıdır** (karar 60/1711).
- **Holdout "tamamlanmış pencere" kuralı:** Holdout dönemi 2025-01-01 → 2026-10-31 aynı kalır. **Ana koşu W6'da (9 Kas) bir kez** yapılır ve yalnızca penceresi koşu tarihinden önce **tamamlanmış** (olay, ufuk) çiftlerini içerir (ör. Eylül–Ekim 2026 olaylarının 20/60 günlük pencereleri dışarıda kalır). **W12'de (4 Oca 2027) tek bir "tamamlama koşusu"** aynı dondurulmuş kod/kurallarla, sonradan tamamlanan çiftler için yapılır ve **ayrı raporlanır**. Kurallar iki koşu arasında değiştirilemez; bu prosedür ön kayıtta (`rules-v1.0-prereg`) yazılıdır.
- **Sabah KAP özeti:** her iş günü **08:45** (açılış seansından önce; kişisel rutin 08:45–09:35 ile uyumlu).
- **Vize haftası:** ekip kapasitesi o hafta **%50** planlanır (tarih akademik takvimden W1'de işlenir).
- **Gölge aşaması eşiği (≥ 4 hafta / ≥ 10 fiş)** ekip onayı beklemez, kanoniktir.
- **İsimlendirme:** kodda düğüm/ajan isimleri **İngilizce** (`05-ajan-spesifikasyonlari.md`'deki isimler: `pre_gate`, `guard`, `classifier`, `reader`, `materiality`, `evidence`, `merge`, `skeptic`, `rules`, `compliance`, `risk_gate`, `approval`); dokümanlarda Türkçe isimler + `04-mimari.md`'deki eşleme tablosu.
- **Seans dışı emir:** `intraday_limit` yalnızca sürekli işlemde; seans dışında üretilen öneri **ertesi açılış seansı limit emrine** çevrilir (06 R09 notu).
- 2012–2017 backfill: **stretch** (kapsam dışı, zaman kalırsa).
- **Canlı modun 3 anahtarı** (yalnızca otomatik broker adapter'ları için; `OrderTicket` zaten manuel): (1) sürümlenen config'te `execution.mode: live`, (2) sunucuda ortam değişkeni `KAPTAN_LIVE_ENABLED=true`, (3) oturum başına Admin + Risk Officer'ın arayüzden onayı. Biri eksikse adapter paper'a düşer ve audit'e yazar.

### Kişisel para planı
- Aşama 1 ile 2 arasına **"gölge" aşaması**: sistem emir fişi üretir, gerçek para yok, fişler kaydedilir.
- Gerçek paraya geçiş şartı: holdout'ta **t ≥ 2 ve n ≥ 30** + ≥3 ay / ≥50 paper işlem.
- Gerçekçi başlangıç: **Nisan–Haziran 2027**.
- Aracı kurum komisyonu **≤ %0,05 / taraf** (banka kurumlarının ~%0,20'si çoğu işlemi maliyet kontrolünde eler).
- Tamamen durma: **zirveden %-10** veya **12 ay BIST-100'ü geçememe**.

---

# Orijinal kararlar (Revizyon 1, 29.09.2026)

## Kimlik
- **Proje adı:** KAPtan (alternatifler: Bildirim Masası, Nöbetçi, Teyit)
- **Tek cümle:** BIST'teki her KAP bildirimini yapılandırılmış bir olaya çeviren, her işlem fikrini geçmiş veriden kanıtla destekleyen, kararı LLM'e değil kurallara bıraktıran ve her öneriyi uyum ajanı + risk kapısı + insan onayından geçiren çok ajanlı yatırım masası.
- **Ders:** SENG 429 Enterprise Application Development Lab, Çankaya Üniversitesi, Dr. Bilgin Avenoğlu, Pazartesi 13:20–16:10 (MB06). Not: Proposal %5, Progress %5, Final Presentation %50, Midterm %15, Final %25. 4 kişilik grup. LLM + RAG + Agents, ajanlar Python.
- **Persona:** Portföy yönetim şirketinde fon yöneticisi (günde ~350 KAP bildirimi, TR+EN, SPK denetçisine gerekçe göstermek zorunda). **Kişisel mod:** takım lideri kendi parasıyla, kendi hesabında; sistem emir fişi üretir, kullanıcı aracı kurum uygulamasından manuel girer.

## Temel ilke
**LLM okur, sınıflandırır, kanıt toplar → deterministik kural motoru karar verir → insan onaylar.** LLM asla doğrudan al/sat kararı vermez. Araştırma iddiası (ablation): "sınıflandırıcı LLM + kurallar" vs "serbest karar veren LLM".

## Olay türleri (yalnızca long)
| Kod | Olay | Şart | Tutma |
|---|---|---|---|
| E1 | Pay geri alım **işlemleri** (gerçekleşen alım) | 10 seansta ≥ sermayenin %0,25'i, kümelenmiş | 20–40 gün |
| E2 | Yönetici / ana ortak piyasadan alımı | Küme, tercihen düşüş sonrası | 20–60 gün |
| E3 | Yeni iş ilişkisi / ihale | Tutar ≥ yıllık gelirin %10'u, bağlayıcı, ilişkili taraf değil | 5 gün |
| E4 | Finansal sonuç | Tam rapor + enflasyon muhasebesi + rapor dili | 5–10 gün |

Sadece çıkış/kaçınma filtresi: SPK tedbirleri, volatilite bazlı tedbirler, bedelsiz heyecanı, sulandırıcı bedelli.
Giriş: ertesi açılış / seans içi; son 5 seansta >%8 yükseliş → atla veya yarıya indir (sızıntı).
Evren: likidite + halka açıklık alt sınırı.

## Risk parametreleri (tek set)
- İşlem başına risk: sermayenin %0,5'i · Pozisyon ≤ %10 · Eşzamanlı 8–10 pozisyon · Günlük işlem hacminin ≤ %1'i
- Fiyat bandı: son fiyat ±%2 · Tavan/taban kontrolü
- Beklenen avantaj ≥ 2 × maliyet değilse ret
- **Günlük %-1 → yeni emir durur · Zirveden %-5 → kill switch** (açık emirler iptal). Reset = Admin + Risk Officer
- Kriz rejimi → maruziyet yarıya
- LLM kotası bitti → HOLD
- Canlı mod için 3 ayrı anahtar (config + env + UI onayı)

## Ajanlar (LangGraph)
LLM ajanları (6): **Sınıflandırıcı**, **Okuyucu**, **Önemlilik**, **Kanıt**, **Şüpheci**, **Uyum**.
Deterministik düğümler: **Kural motoru**, **Risk kapısı**. Onay: `interrupt()` + `Command(resume=)` → Risk Officer. Okuyucu/Önemlilik/Kanıt paralel (`Send` fan-out). Checkpointer: `AsyncPostgresSaver`.
KAP `subject` alanı bildirimlerin ~%90'ını zaten tipliyor; LLM sınıflandırma yalnızca "Özel Durum Açıklaması (Genel)" ve serbest metinler için. ~%28 devre kesici bildirimi baştan elenir.

## RAG — 3 taban (pgvector, `PGVectorStore` + `PGEngine`)
1. **Bildirim arşivi:** 2018–2026 KAP bildirimleri (TR+EN), PDF ekleri, finansal rapor metinleri
2. **Olay hafızası:** geçmiş olay özeti embedding + metadata 1/5/20/60 günlük anormal getiri
3. **Kural ve mevzuat:** SPK tebliğleri (II-15.1 özel durumlar, II-22.1 geri alım), piyasa bozucu eylemler, şirket risk politikası
Her aramada `published_at < karar_anı`. Hibrit: bge-m3 dense + Postgres `turkish` FTS + trigram. Chroma karşılaştırma notebook'u.

## Veri
- KAP canlı: kap.org.tr JSON uçları (`/tr/api/disclosure/list/main`, `/tr/api/disclosure/members/byCriteria`), 15–30 sn polling, kendi "ilk görülme" zamanı. Tam metin `/tr/Bildirim/{idx}`. Kütüphane: `kap-client` 1.2.0, `borsapy` 0.11.0. *(Revizyon 3: `kap-client` BIST hisselerinde çalışmıyor → kendi httpx istemcimiz.)*
- MKK API Portal ücretsiz plan = yalnızca sandbox (donmuş ~2023 verisi).
- Fiyat: yfinance (günlük), borsapy (kurumsal işlemler), isyatirimhisse (düzeltilmiş + ham). 15 dk gecikme → strateji ertesi açılış.
- Haber RSS: AA, Dünya, Foreks, Habertürk, TRT Haber, CNBC-e, Borsagündem. (Bloomberg HT RSS 14 Eylül'den beri ölü.)
- Makro: TCMB EVDS → evds3, `evds` ≥ 0.4.0.

## Broker adapter'ları
`SimBIST` (paper, gerçek BIST fiyatlarıyla, komisyon + kayma) — ders ana · `AlpacaPaper` + Benzinga haber — ABD karşılaştırma kolu · `OrderTicket` — kişisel, manuel giriş · `BtcTurk` — opsiyonel stub (önerilmiyor) · `Matriks DEK` — gelecekte (~5.000 TL/ay). **Algolab 31.12.2025'te kapandı.**

## Enterprise
RBAC: **Analist** (görür, not ekler) · **Risk Officer** (onay/ret, kill switch, limitler) · **Admin** (kullanıcı, evren, config). Limit değişikliği ikinci onay ister.
Hash zincirli, yalnızca eklenebilir audit log. "Neden bu işlem?" ekranı. Canlı iz paneli (LangSmith). Sabah KAP özeti.

## Değerlendirme (4 katman)
1. Sınıflandırma: 300 bildirimlik elle etiketli altın set → E1–E4 F1, model karşılaştırması
2. RAG: 50 soruluk altın set → RAGAS 0.4 (faithfulness, context precision/recall)
3. Olay çalışması + backtest: 2018–2024 geliştirme, **2025–2026 holdout**, kurallar önceden sabit
4. İleri dönük paper: **9 Kasım 2026'dan finale**, dondurulmuş `v1.0-fwd`
Baseline/ablation: BIST-100 al-tut · eşit ağırlık evren · yalnızca KAP `subject` kuralı (LLM yok) · serbest karar veren LLM · şüphecisiz versiyon. Prompt-injection red-team seti; Groq Llama Prompt Guard.

## Teknoloji
*(Revizyon 3: ana model Gemini Flash-Lite; zincir Flash-Lite ⇄ Groq gpt-oss → Azure → Ollama → HOLD.)* LangGraph 1.x · Gemini Flash (ana), Groq (hızlı + Prompt Guard), Ollama Qwen (yerel), Azure for Students (final) · bge-m3 · Postgres + pgvector, Redis (stream + cache) · FastAPI (SSE, JWT) + Next.js · RAGAS 0.4, kendi replay harness'ı, vectorbt · LangSmith Developer · Docker Compose, GitHub Actions, SOPS/age + gitleaks. Karar başına ~17K token; günde 30–60 tam karar.

## Takvim
W1 5 Eki (kurulum) · **W2 12 Eki Proposal** · W3 19 Eki (backfill, taksonomi) · W4 26 Eki (uçtan uca iskelet) · W5 2 Kas (olay çalışması, kural motoru, risk kapısı) · **W6 9 Kas ileri dönük paper başlar** · W7 16 Kas (Kanıt/Şüpheci/Uyum, altın set) · **W8 23 Kas Progress** · W9–W10 Ara (frontend, RBAC, audit, RAGAS) · W11 Ara (ablation, red-team) · W12 Oca (freeze, prova) · **Final Oca**. Gerçek tarihler hocadan teyit edilecek.

## Roller
1. **Veri & RAG** · 2. **Ajanlar** · 3. **Strateji, Risk & Yürütme** · 4. **Frontend & Değerlendirme**

## Kişisel para planı
Aşama 0 (Eki–Kas): kendi arşivinde olay çalışması; holdout'ta pozitif değilse gerçek paraya geçme · Aşama 1: ≥3 ay ve ≥50 paper işlem · Aşama 2 (~Şubat 2027+): küçük tutar, ayrı hesap, emir fişiyle manuel, kaldıraç/VİOP yok · Aşama 3: tutarlıysa kademeli büyütme. Sinyaller kimseyle paylaşılmaz (lisanssız yatırım danışmanlığı riski). Ortak para havuzu yok (SPKn 6362 md.109). Gerçekçi beklenti: BIST-100'e göre yılda 0 ile +%5, sıfır olabilir.

## Final demo akışı
1. Bugünkü canlı KAP bildirim sayısı → 2. Sözleşme bildirimi → kanıt kartı → şüpheci küçültür → onay → paper dolum → 3. Kötü niyetli bildirim + tedbirli hisse engellenir → 4. Kill switch + audit zinciri doğrulama → 5. Paper sonuçları vs BIST-100 + ablation → 6. "Aynı kod, son butona yine ben basıyorum."

## Kaynak araştırma dosyaları
`../arastirma/NIHAI-PROJE.md` · `../arastirma/04-derin-arastirma/01..05-*.md` · `../arastirma/02-fikir-B-kurul/*.md` · `../arastirma/01-fikir-A-mutabik/02-klisheler-ve-farklilastiricilar.md`, `04-teknoloji-yigini.md`
