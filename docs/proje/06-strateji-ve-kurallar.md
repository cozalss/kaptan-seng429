# 06 — Strateji ve Kurallar Spesifikasyonu (KAPtan)

- Sürüm: `rules-v1.0-draft` · Hazırlanma: 29.09.2026 · **Revizyon 2 uyumu: 30.09.2026** · **Revizyon 3 uyumu: 30.09.2026** · Sahibi: Rol 3 (Strateji, Risk & Yürütme)
- Bağlayıcı kaynak: `_KANONIK-KARARLAR.md` (**REVİZYON 3 bölümü Revizyon 2'ye, Revizyon 2 orijinal kararlara üstündür**). Bu belge kanonik kararları **sayılara ve test edilebilir kurallara** çevirir. Kanonikten sapma gerektiren her öneri en sondaki "Önerilen değişiklikler" bölümündedir; gövde metni kanonik değerleri kullanır.
- **Risk kapısı kurallarının tek kaynağı bu belgedir (R01–R16, §10).** Diğer dokümanlar (05 ajan spesifikasyonu, 09 güvenlik, 12 kişisel plan) kural ID'leriyle buraya referans verir; farklı numaralandırma kullanan eski metinler için eşleme tablosu §10.0'dadır.
- Etiketler: **[V]** birincil kaynaktan doğrulandı · **[S]** ikincil kaynak · **[U]** doğrulanmadı / varsayım · **[K]** bizim tasarım kararımız (kaynak gerektirmez, geliştirme verisinde kalibre edilir).
- Kapsam: Kural motoru (deterministik), risk kapısı (deterministik), olay çalışması metodolojisi, parametre tablosu. LLM ajanları burada yalnızca **alan üreticisi** olarak geçer; hiçbir kural LLM'in serbest metin kararına bağlı değildir.

---

## 0. Özet: karar zinciri

```
KAP bildirimi (publishDate, disclosureIndex, subject, stockCodes, gövde, ekler)
  → S0 LLM'siz ön eleme: gürültü, "Düzeltme", işlem görebilirlik,
       evren (R03), SPK/VBTS tedbiri (R04), ekip engel listesi (R13)   [kod, LLM çağrısı yok]
  → Sınıflandırma: subject → olay tipi (≈%90) | LLM (Genel ÖDA)       [kod + LLM alanı]
  → Okuyucu (tutar, taraf, bağlayıcılık) ‖ Önemlilik (yalnızca sayılar:
       finansallar, piyasa değeri, kur) ‖ Kanıt (getiri görmeden seçim)  [LLM alanı + deterministik parser]
  → Birleştirme düğümü: oranlar (önemlilik, float payı) + regex tutar
       çapraz kontrolü (R14) + kanıt istatistikleri (ort. CAR, isabet, n) [kod]
  → S-E1..S-E4 tetik kuralları + S-L sızıntı + S-C maliyet/avantaj     [kod]  → TradeProposal
  → Uyum ajanı bayrakları (yalnızca veto/uyarı)                        [LLM alanı]
  → Risk kapısı R01..R15 (yalnızca küçültür/reddeder)                   [kod]
  → İnsan onayı (interrupt) — OTOMATİK YÜRÜTME YOK; onay bir sonraki
       seansın 09:50'sinde düşer (R15)
  → Gönderim anı yeniden kontrol (R16) → SimBIST dolumu | Emir fişi (kişisel)
  → Çıkış kuralları X1..X6 her seans sonunda                             [kod]
```

Değişmez ilke: **kural motoru ve risk kapısı saf fonksiyondur** (`f(proposal, context, params) → result`), dış çağrı yapmaz, aynı girdiye aynı çıktıyı verir. Tüm parametreler §13'teki tek YAML dosyasından okunur. **LLM hiçbir oranı hesaplamaz**: Önemlilik ajanı yalnızca ham sayıları getirir, oranları Birleştirme düğümü Okuyucu'nun (regex ile doğrulanmış) tutarıyla hesaplar; Kanıt ajanı geçmiş olayları getirilerini görmeden seçer, istatistikleri kod hesaplar.

**Tüm kollar aynı kapıdan geçer:** ana sistem, `v1.0-fwd` (Sınıflandırıcı + kurallar) ve serbest karar veren LLM baseline'ı aynı R01–R16 zincirinden geçirilir (bkz. `08-degerlendirme-plani.md`).

---

## 1. Piyasa yapısı gerçekleri (kuralların dayandığı)

| Konu | Değer | Kaynak / etiket |
|---|---|---|
| Seans akışı (pay piyasası) | Açılış seansı emir toplama 09:40–09:55, eşleştirme/fiyat belirleme 09:55–10:00 · Sürekli işlem 10:00–18:00 · Kapanış seansı emir toplama 18:00/18:01–18:05, kapanış fiyatı belirleme 18:05–18:08 · Kapanış fiyatından işlemler 18:08–18:10 | [S] [ÜNLÜ](https://www.unlumenkul.com/borsa-istanbul-seanslar-ve-islem-saatleri/), [Enuygun 2026](https://www.enuygunfinans.com/finans-rehberi/borsa-saat-kacta-aciliyor-ve-kapaniyor-borsa-islem-saatleri/), [BIST işlem saatleri](https://www.borsaistanbul.com/en/trading-hours) |
| Gün ortası tek fiyat seansı (13:00–14:00) | Sürekli işlem 10:00–18:00 **kesintisiz** (Prosedür §9 seans çizelgesi). 13:00–14:00 tek fiyat süreci yalnızca **tek fiyat yöntemiyle işlem gören** paylarda var (YİP/PÖİP, VBTS 3. kademe "tek fiyat"; günde 5 fiyat belirleme, Tablo-10) | **[V]** [BIST Pay Piyasası Prosedürü rev.54, 21/09/2026](https://www.borsaistanbul.com/files/pay-piyasasi-proseduru.pdf) (erişim 2026-10-29) · `midday_break: false` doğru |
| Günlük fiyat marjı | Baz fiyata (önceki kapanış) göre **Yıldız Pazar ±%20, Ana Pazar ±%15; Alt Pazar, YİP, PÖİP ±%10**; limitler içeri doğru fiyat adımına yuvarlanır (§5.1.11) | **[V]** [BIST Pay Piyasası Prosedürü rev.54, 21/09/2026](https://www.borsaistanbul.com/files/pay-piyasasi-proseduru.pdf) (erişim 2026-10-29) · kod: `market/ticks.py` `daily_limit_pct(market)` + `config/trading.yaml` `price_limit_pct_by_market`; pazar bilinmiyorsa ±%10 (en dar bant, muhafazakâr) |
| Pay bazlı devre kesici | Eşik: ilgili pazarın marjı (Tablo-4) devre kesici referans fiyatına uygulanır; tetiklenince **10 dk emir toplama + 2 dk eşleşme** (17:45–18:00 arasında 15 dk, kapanış seansına devreder) (§5.3.4.1) | **[V]** [BIST Pay Piyasası Prosedürü rev.54, 21/09/2026](https://www.borsaistanbul.com/files/pay-piyasasi-proseduru.pdf) (erişim 2026-10-29) · eşik oranı Tablo-4'ten okunmadı **[U]** |
| Borsa payı (pay piyasası) | İşlem hacminin **0,25 baz puanı** (%0,0025), taraf başına | [V] [BIST Ücretlendirme Tablosu](https://www.borsaistanbul.com/files/borsa-istanbul-ucretlendirme-tablosu.pdf) |
| Takasbank takas komisyonu | İşlem hacminin **milyonda 4** (%0,0004) | [V] [Takasbank tarife](https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-23012025.pdf) |
| Aracı kurum komisyonu | Banka kökenli kurumlar ~**binde 1,9–2,0** (%0,19–0,20) taraf başına [V, Rev. 3]; Deniz/QNB binde 5 (liste tarifeleri); **Midas ve Enpara Yatırım BIST komisyonu %0** [V/ikincil, Rev. 3] | [S] [hisse.net 2026](https://www.hisse.net/haber/bankalarin-borsa-istanbul-da-bakim-ve-komisyon-ucretleri-2026-48274), [Midas](https://www.getmidas.com/ucretler/) |
| BSMV | Banka aracı kurumlarında komisyon üzerinden %5 (komisyon %0 ise BSMV de 0) | [V, Rev. 3] |
| Pay kazancı vergisi | GVK geçici 67: BIST'te işlem gören paylarda **%0 stopaj**, beyan yok (Mart 2026 değişikliği TEFAS dışı hisse yoğun serbest fonları etkiledi) | [S] [PwC 2026](https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html), [Alomaliye 11107](https://www.alomaliye.com/2026/03/27/gvk-gecici-67-nci-maddesinde-yer-alan-tevkifat-oranlari-karar-sayisi-11107/) |
| VBTS | Kademeli: (1) açığa satış + kredili işlem yasağı, (2) brüt takas, (3) tek fiyat; + emir paketi / internet emir yasağı; **her kademe 1 ay** (15/11/2021'den beri, önce 15 gün); sonraki kademe öncekilerin bitişini kendi sonuna uzatır | **[V]** [BIST KAP duyurusu](https://kap.org.tr/tr/api/BildirimPdf/976897) md.4 (erişim 2026-10-29) → `VBTS_DEFAULT_MONTHS = 1` |
| SPK işlem yasakları | Kişi bazlı işlem yasakları SPK bülteni + idari yaptırımlar sayfası | [V] [SPK İşlem Yasakları](https://idariyaptirimlar.spk.gov.tr/IslemYasaklari) |

**Kurala etkisi:** Tek fiyat ve brüt takas altındaki paylar zaten evren dışıdır (§2), bu yüzden tek fiyat seans saatlerinin kesin bilgisine kural motoru bağımlı değildir.

### 1.1 Mevzuat: E1 ve E2'nin dayandığı açıklama yükümlülükleri

**II-22.1 Geri Alınan Paylar Tebliği** [V] ([mevzuat.gov.tr PDF](https://mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=19226&mevzuatTur=Teblig&mevzuatTertip=5), [SPK PDF](https://spk.gov.tr/data/61e3664d1b41c61270320801/c5136b19-1e8c-499a-b4d7-83f4188d3d8a.pdf)):
- **md.12/4:** Geri alıma başlamadan **iki iş günü önce** dönem başlangıç/bitiş, nominal tutar ve sermayeye oran açıklanır.
- **md.12/5:** **Her geri alım işlemi**, işlem tarihini izleyen iş günü **seans başlamadan önce** KAP'ta açıklanır. İçerik: nominal tutar, **sermayeye oranı**, işlem fiyatı, program kapsamında daha önce geri alınan payların nominal tutarı, işlem tarihi. → E1 için tüm alanlar yapılandırılmış gelir; en erken uygulanabilir giriş aynı günün açılış seansıdır.
- **md.12/6:** Geri alınan payların **elden çıkarılması** da ertesi iş günü seans öncesi açıklanır → E1'in ters sinyali (X4).
- **md.15/1:** Geri alım emri açılış seansında ve **son 15 dakikada** verilemez. Fiyat, mevcut tekliflerden veya son satış fiyatından yüksek olamaz. **Günlük geri alım ≤ son 20 günlük ortalama işlem miktarının %25'i** (düşük likiditede Kurul onayıyla %50'ye kadar).
- **md.9:** Toplam geri alınan paylar ödenmiş/çıkarılmış sermayenin **%10'unu** aşamaz.
- **md.11:** Program süresince yönetim kontrolüne sahip ortaklar ve idari sorumluluğu olanlar borsada **satış yapamaz** (E1 ile E2'yi aynı yönde tutar).
- **İlke kararı i-SPK.22.9 (19.03.2025, 16/531)** ile genel kurul programı olmadan geri alım yolu ve günlük %25 sınırından muafiyet imkânı; **22.09.2026 tarihli 60/1711 sayılı karar** ile md.9/3'teki toplam bedel üst sınırı "ikinci bir duyuruya kadar" uygulanmıyor. **Revizyon 3 netleştirmesi:** kaldırılan, geri alımlardaki **toplam tutar üst sınırıdır; fiyat sınırı değildir** ve kaldırma **geçicidir**. Karardan sonraki hafta 60 şirket ~1,99 milyar TL geri alım yaptı. [S] [CNBC-e](https://www.cnbce.com/haberler/spkdan-pay-geri-alimlarinda-yeni-karar-ust-sinir-kaldirildi-h37803), [Yatırımx](https://www.yatirimx.com.tr/piyasa/spkdan-kritik-karar-pay-geri-alimlarinda-ust-sinir-kaldirildi/25270). → **2025 sonrası geri alım rejimi 2015–2020 literatür örnekleminden farklıdır** (bkz. §3.1 dalga filtresi ve Önerilen değişiklik Ö2).

**II-15.1 Özel Durumlar Tebliği** [V] ([mevzuat.gov.tr PDF](https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=19331&mevzuatTur=Teblig&mevzuatTertip=5)):
- **md.11 (2017 değişikliği):** İdari sorumluluğu bulunan kişiler, bunlarla yakından ilişkili kişiler ve **ana ortak**, paylar ve paya dayalı araçlardaki **tüm işlemlerini** kamuya açıklar. **Eşik: kişi başına bir takvim yılında toplam 250.000 TL**; eşik aşıldıktan sonraki tüm işlemler açıklanır. Eşik nominal ve enflasyona endeksli değil → 2026'da neredeyse her anlamlı yönetici işlemi açıklanır.
- **md.12:** Doğrudan/dolaylı pay veya oy hakkının **%5, 10, 15, 20, 25, 33, 50, 67, 95** eşiklerine ulaşması/altına düşmesi açıklanır. Doğrudan sahiplikte açıklamayı **MKK** yapar (md.12/4).
- **md.23/3:** md.12 ve 22 kapsamındaki açıklamalar **işlemi izleyen üçüncü iş günü saat 09:00'a kadar** ekteki formla yapılır. md.11 işlemleri için genel kural "derhal"dır; pratikteki gecikme dağılımı **[U]** — backfill'den ölçülecek.
- Form alanları [V]: işlem tarihi, fiyat aralığı, alım nominal (TL), satım nominal (TL), net nominal, gün başı/gün sonu sahip olunan nominal ve oran.

### 1.2 Akademik kanıt ve beklenti (Revizyon 3 düzeltmeleri)

| Olay / konu | Kanıt | Kısıtlar ve kullanım |
|---|---|---|
| E1 geri alım | **Ünal (2022):** BIST-100 şirketleri, **2015–2020, 711 geri alım**; XU100'e göre fazla getiri **1 ayda +%2,0, 3 ayda +%3,4** | Getiriler **işlem tarihinden** ölçülmüş (bildirim tarihinden değil → uygulanabilir getiriyi olduğundan yüksek gösterir), **maliyet yok**, basit t-testi, 2021 öncesi rejim. Dokümanlardaki "~+%1,5–2" ifadesi bu kaynak ve kısıtlarıyla birlikte yazılır. |
| E2 yönetici alımı | Ünal (2022) yönetici alımı alt örneklemi: **n = 89** | Küçük örneklem; aynı ölçüm kısıtları (işlem tarihi, maliyetsiz). |
| Fiyatlama hızı | **Ersan vd. (2021):** 2015–2017, 9.223 duyuru; fiyat tepkisi 300 sn'lik pencerede **saniyeler içinde** başlıyor | "BIST yavaş fiyatlıyor, gün/hafta süren avantaj var" gerekçesi olarak **kullanılmaz**. Doğru okuma: basit bilgi saniyeler içinde fiyatlanır; yavaş (günlük) bir sistem yalnızca karmaşık/yavaş fiyatlanan bilgide şans bulabilir. |
| E3 yeni iş / ihale | **BIST'e özgü olay çalışması bulunamadı.** En yakını Eyüboğlu & Bulut (2016, BIST-30, "operasyonel haber") | E3 **keşifsel** olay türüdür; kanıtı yalnızca kendi olay çalışmamızdan (§12) gelir (`m_evidence = 0,5` bu yüzden en düşük). |
| Yayın sonrası bozulma | **McLean & Pontiff:** anomali getirileri yayından sonra ~%58 düşer | Literatür rakamları **üst sınır** sayılır → §8.2 `edge_adj = 0,5 × edge_raw`. |

**Beklenti:** Maliyet sonrası kalıcı pozitif anormal getiri olasılığı kabaca **%20–35**. Yıllık 0 ile +%5 aralığı korunur; **sıfır veya negatif sonuç geçerli bir bulgudur** ve araştırma iddiası (kurallı LLM vs serbest LLM) her durumda test edilir.

---

## 2. Evren tanımı (S-U kuralları)

Evren her **Pazartesi 08:30**'da (ve günlük olarak VBTS/tedbir değişikliklerinde) **point-in-time** anlık görüntü olarak hesaplanır; backtest aynı fonksiyonu tarihsel verilerle çağırır.

| ID | Kural | Eşik | Etiket |
|---|---|---|---|
| U1 | Pazar | Yıldız Pazar veya Ana Pazar. Alt Pazar, Yakın İzleme Pazarı (YİP), GİP ve Nitelikli Yatırımcı İşlem Pazarı **hariç** | [K] |
| U2 | Likidite | Son 20 seansın **medyan** günlük işlem hacmi (TL) ≥ **50.000.000 TL** | [K] (araştırma 02 §7.3) |
| U3 | Halka açıklık | MKK fiili dolaşımdaki pay oranı (FDPO) ≥ **%25** | [K] |
| U4 | Halka açık piyasa değeri | FDPO × piyasa değeri ≥ **1.500.000.000 TL** | [K] |
| U5 | Geçmiş | Borsada ≥ **250 seans** işlem görmüş (tahmin penceresi için) | [K] |
| U6 | Fiyat adımı | `tick_size(price) / price ≤ %0,25` (çok düşük fiyatlı paylarda adım maliyeti) | [K]; fiyat adımı tablosu **[V]** Prosedür §5.1.9 Tablo-7 ([BIST Pay Piyasası Prosedürü rev.54, 21/09/2026](https://www.borsaistanbul.com/files/pay-piyasasi-proseduru.pdf) (erişim 2026-10-29)): <20→0,01 · <50→0,02 · <100→0,05 · <250→0,10 · <500→0,25 · <1000→0,50 · <2500→1,00 · ≥2500→2,50; tek kaynak `market/ticks.py` |
| U7 | Tedbir geçmişi | Son **20 seansta** VBTS tedbiri, SPK/BIST tedbiri veya işlem durdurma **yok** | [K] |
| U8 | Varlık türü | Yalnızca paylar. Varant, sertifika, BYF, yatırım fonu, rüçhan kuponu **hariç** | [K] |

Sonuç: `universe_snapshot(date) → set[symbol]`, veritabanında `universe_history(date, symbol, reason_codes)` olarak saklanır. Beklenen evren büyüklüğü 2026 için ~120–200 pay **[U]**, W3'te ölçülecek.

---

## 3. Olay tipleri: tespit ve tetik kuralları

KAP satır alanları [V] (bkz. `07-veri-hatti-ve-sema.md`): `publishDate` (İstanbul saati), `disclosureIndex`, `stockCodes`, `disclosureClass` (ODA/FR/DG/DKB/DUY), `disclosureType`, `subject`, `summary`, `attachmentCount`, `modifyStatus`, `isLate`. Tam metin `/tr/Bildirim/{idx}`, yedek kaynak `/tr/api/BildirimPdf/{idx}`.

Ortak ön koşullar (her E için):
- `stockCodes` tek sembol ve sembol ∈ `universe_snapshot(publish_date)`; sembol işlem görebilir, aktif tedbirsiz ve ekip engel listesinde değil (S0, LLM çağrısından **önce**).
- **Yinelenen olay:** yalnızca **"Düzeltme"** bildirimi yeni olay sayılmaz; önceki olayın alanları güncellenir, yeni giriş üretilmez **[K]**. "Güncelleme: Evet" işaretli bildirim **otomatik olarak yinelenen sayılmaz** — gerçekleşen işlem bildirimi (ör. ihalenin sözleşmeye dönüşmesi, yeni geri alım işlemi) olabilir; tetik kuralları yeniden değerlendirilir.
- **Tutar çapraz kontrolü (R14):** Okuyucu'nun çıkardığı tutar, bildirim metninden regex ile çıkarılan tutarlar kümesinde yoksa öneri reddedilir. Tüm oranları Birleştirme düğümü bu tutarla hesaplar.
- Aynı sembolde açık pozisyon varsa yeni giriş yok, ama tutma süresi uzatılabilir (E1/E2 devam kuralları).
- LLM ile sınıflandırılan olaylarda `confidence ≥ 0,80`; subject eşlemesiyle tiplenenlerde `confidence = 1,0`.

### 3.1 E1 — Pay geri alım işlemleri (gerçekleşen alım)

**Tespit:** `subject == "Payların Geri Alınmasına İlişkin Bildirim"` (ODA; güncel ad, 30.09.2026 canlı veride doğrulandı [V]). Eski dönem adı `"Geri Alınan Paylara İlişkin Bildirim"` yalnızca backfill eşlemesinde kullanılır. **`"Geri Alınan Payların Elden Çıkarılması"` E1 değildir** (satış → FILTER / çıkış bilgisi). Alanlar deterministik tablo parser'ı ile çıkarılır, LLM (Okuyucu) yalnızca doğrular. Form alan adları gerçek örneklerden doğrulanacak **[U]**: işlem tarihi, geri alınan nominal (TL), işlem fiyatı / fiyat aralığı, sermayeye oranı (%), program kapsamında toplam.

**Önemlilik formülü (Birleştirme düğümü, kod):**
```
buyback_ratio_10 = Σ nominal_bought(trade_date ∈ son 10 seans) / ödenmiş_sermaye_nominal
n_notices_10     = son 10 seansta aynı şirket için E1 bildirimi sayısı
buyback_val_adv  = Σ (nominal × fiyat)(son 10 seans) / (10 × ADV20_TL)   # bilgi amaçlı özellik
```
**Tetik (S-E1):**
```
E1_trigger = buyback_ratio_10 ≥ 0,25%
          OR (n_notices_10 ≥ 3 AND buyback_ratio_10 ≥ 0,10%)
```
**Hariç tutma:** Son 20 seansta aynı şirketin geri alınan pay **satışı** (md.12/6 bildirimi) varsa tetik yok. Bağlı ortaklık alımları şirket toplamına eklenir (II-22.1 kapsamı).

**Geri alım dalgası alt grubu [Kanonik R2, ön kayıtlı ikincil analiz]:** İki işaret tutulur: (a) `wave=True` — son 5 seansta E1 tetiği üreten şirket sayısı 2018–2024 dağılımının 90. yüzdeliğini aşıyor; (b) `post_spk_2026=True` — olay SPK'nın **22.09.2026** tarihli, geri alımlardaki **toplam tutar üst sınırını geçici olarak kaldıran** kararından (60/1711; fiyat sınırı değil) sonra. Birincil kural boyutu değiştirmez; olay çalışmasında `wave` ve `post_spk_2026` alt grupları **ayrı** raporlanır. (Eylül 2026 krizi ve SPK'nın geri alım gevşetmeleri, şirketlere özgü bilgi yerine piyasa desteği amaçlı toplu alımlar üretiyor.)

**Tutma:** 20 seans. Tutma süresinin son 5 seansında yeni E1 tetiği gelirse +20 seans uzatılır; toplam en fazla **40 seans**.

### 3.2 E2 — Yönetici / ana ortak piyasadan alımı

**Tespit:** `subject == "Pay Alım Satım Bildirimi"` (ODA veya DKB; II-15.1 md.11). Okuyucu ajan formdan şu alanları çıkarır: `buyer_role ∈ {YK_üyesi, genel_müdür/idari_sorumlu, yakından_ilişkili, ana_ortak, fon/kurumsal_yatırımcı, diğer}`, `buy_nominal`, `sell_nominal`, `price_range`, `trade_dates`, `venue`, `transaction_nature`.

**Kapsam (Kanonik R2):** E2 yalnızca **yönetici (idari sorumlu) / yönetim kurulu üyesi / kontrol eden pay sahibi (ana ortak)** alımlarıdır. **md.12 pay sahipliği eşik bildirimleri (%5, 10, … — çoğunlukla fon, portföy yönetim şirketi veya yabancı kurumsal yatırımcı) E2 değildir** ve `O` (diğer) olarak etiketlenir; ana ortağın md.12 bildirimi bile md.11 formu yoksa E2 üretmez. Yakından ilişkili kişiler ve ≥%10 ortak olup kontrol etmeyen pay sahipleri de kapsam dışıdır.

**Önemlilik formülü (Birleştirme düğümü; Önemlilik ajanı yalnızca FDPO, piyasa değeri ve fiyatı getirir):**
```
net_nominal     = buy_nominal − sell_nominal
avg_price       = orta_nokta(price_range)        # yoksa işlem günü VWAP ≈ (H+L+C)/3
net_buy_value   = net_nominal × avg_price         # TL
float_share     = net_buy_value / (FDPO × piyasa_değeri)
cluster_30      = son 30 takvim gününde net alımı > 0 olan farklı içeriden kişi sayısı
drawdown_60     = hissenin son 60 seanslık getirisi
```
**Tetik (S-E2):**
```
E2_trigger = buyer_role ∈ {YK_üyesi, idari_sorumlu, ana_ortak}
         AND net_nominal > 0
         AND transaction_nature == "borsada_alım"
         AND net_buy_value ≥ min_value_TL(karar_tarihi)
min_value_TL(t) = 1.000.000 TL (2026 TL'si) × TÜFE(t) / TÜFE(2026-09)   # TÜFE(t): t anında yayımlanmış son endeks; backtest'te geriye deflate
E2_strong  = E2_trigger AND (cluster_30 ≥ 2 OR float_share ≥ 0,10% OR drawdown_60 ≤ −15%)
```
**Hariç tutulan işlem doğaları** (LLM serbest metinden çıkarır, Şüpheci ajan doğrular): miras/intikal, bağış, grup içi devir, toptan satışlar pazarında grup şirketleri arası blok, bedelsiz/bedelli sermaye artırımından edinim, tahsisli satış, teminat/rehin işlemleri, opsiyon/pay bazlı ödeme kullanımı, halka arz tahsisi.

**Zamanlama notu:** Olay zamanı her zaman `publishDate`'tir, işlem tarihi değildir (Ünal 2022 işlem tarihini kullandı → getirileri olduğundan yüksek gösterebilir; yönetici alımı alt örneklemi yalnızca n = 89, maliyetsiz; bkz. §1.2).

**Tutma:** 20 seans; `E2_strong` ise **60 seans**. Tutma süresince aynı şirkette içeriden net satış ≥ ilk alımın %50'si → X4 çıkışı.

### 3.3 E3 — Yeni iş ilişkisi / ihale / sipariş

**Kanıt durumu (Revizyon 3):** E3 için BIST'e özgü olay çalışması yok → **keşifsel** olay türü (§1.2).

**Tespit:** `subject ∈ {"Yeni İş İlişkisi", "Özel Durum Açıklaması (Genel)"}` ve Sınıflandırıcı alt tipi ∈ {sözleşme, ihale_kazanımı, sipariş}. Revizyon 3 [V]: "Yeni İş İlişkisi" KAP'ta **ayrı bir `subject`** olduğundan E3 adaylarının çoğu LLM'siz tiplenir; ayrıca "İhale Süreci / Sonucu" konusu vardır ve ihale kazanımı adayı olarak aynı kurallardan geçer. Okuyucu alanları: `contract_value`, `currency`, `duration_months`, `counterparty`, `status`, `is_related_party`, `is_renewal`, `is_framework`.

**Önemlilik formülü (Birleştirme düğümü; tutar Okuyucu'dan + R14 regex doğrulaması, hasılat/piyasa değeri/kur Önemlilik ajanının getirdiği ham sayılardan):**
```
value_TL        = contract_value × TCMB_döviz_alış(karar_tarihi)   # TL ise 1; karar anında yayımlanmış son TCMB kuru (15:30 belirlenir, 16:00–16:30 yayımlanır → available_at 16:30 [V] TCMB SSS, erişim 2026-10-29)
annual_value_TL = value_TL / max(1, duration_months / 12)           # süre belirtilmemişse duration yok → toplam tutar
revenue_TTM     = son 4 çeyrek hasılat, fundamentals_pit'ten available_at < karar_anı
                  (TMS 29'lu tablolar raporlama tarihinin satın alma gücündedir)
if revenue_TTM mevcut:  materiality = annual_value_TL / revenue_TTM          ; eşik 10%
else (yedek):           materiality = value_TL / piyasa_değeri(karar_anı)    ; eşik mcap_materiality_min [K]
```
**Tetik (S-E3):**
```
E3_trigger = materiality ≥ eşik (hasılat bazlı %10 | yedek piyasa değeri bazlı %5 [K])
         AND status ∈ {"sözleşme_imzalandı", "ihale_kesinleşti_ve_sözleşme_imzalandı", "kesin_sipariş"}
         AND NOT is_related_party
         AND NOT is_renewal
         AND NOT is_framework_without_committed_amount
         AND precedent_ok
precedent_ok = (n_prec(firma, E3) ≥ 5 AND median CAR[1,5] > 0)
            OR (n_prec(firma, E3) < 5 AND tip düzeyi median CAR[1,5] > 0)     # bu durumda m_evidence × 0,5
```
Bağlayıcı sayılmayanlar: niyet mektubu, mutabakat zaptı (MoU), "en avantajlı teklif", ön yeterlilik, ihale üzerinde kalma (sözleşme imzası öncesi), çerçeve anlaşma.

**Tutma:** 5 seans.

### 3.4 E4 — Finansal sonuç (tam rapor okuması)

**Tespit:** `disclosureClass == "FR"` (finansal rapor) + aynı dönem için "Faaliyet Raporu" / yatırımcı sunumu (72 saat içinde gelenler). Yalnızca **konsolide** tablo varsa konsolide kullanılır. Sayısal alanlar **yapılandırılmış finansal veriden** (`fundamentals_pit`, `available_at` point-in-time) okunur; genel PDF ayrıştırma stretch kapsamındadır (Kanonik R2), rapor dili skoru KAP metin/HTML içeriğinden üretilir.

**TMS 29 notu (kritik):** SPK'nın 07.03.2024 tarih 14/382 sayılı kararıyla ihraççılar 31.12.2023'ten itibaren TMS 29 uygular [S] ([Erdem & Erdem](https://www.erdem-erdem.av.tr/bilgi-bankasi/spknin-ihraccilar-ve-sermaye-piyasasi-kurumlari-icin-verdigi-tms-29-ve-enflasyon-muhasebesi-uygulamasina-iliskin-karari)). 7571 sayılı Kanunla **vergi (VUK) tarafında** 2025–2027 enflasyon düzeltmesi yapılmayacak, ama bu TFRS/SPK tablolarını değiştirmez [S] ([Muhasebetr](https://www.muhasebetr.com/yazarlarimiz/muhammedkutubbagirgan/053/)). TMS 29'un ne zaman biteceği (3 yıllık kümülatif enflasyon < %100) **[U]** → config bayrağı `tms29_active`.

Sonuçları:
1. TMS 29 tablolarında karşılaştırmalı dönem, raporlama tarihinin satın alma gücüne **yeniden ifade edilir** → yıllık karşılaştırma zaten reeldir; başlıktaki "net kâr" karşılaştırması ise **net parasal pozisyon kazancı/kaybı (NPP)** yüzünden yanıltıcıdır.
2. Çeyreklik tablolar **kümülatiftir** (3A, 6A, 9A, 12A). Tek çeyrek değeri: `Q3 = YTD9A(t3) − YTD6A(t2) × (TÜFE(t3)/TÜFE(t2))` (6A değeri önce 9A tarihinin satın alma gücüne taşınır). Bu dönüşüm deterministiktir; LLM yapmaz.

**Özellikler (deterministik + LLM):**
```
core_op_q    = esas faaliyet kârı_q − tek seferlik kalemler_q   # yeniden değerleme, varlık satış kârı, yatırım amaçlı GD değer artışı
Δcore        = core_op_q − core_op_{q−4}                        # ikisi de aynı satın alma gücünde
SUE_real     = Δcore / std(Δcore, son 8 çeyrek)                 # < 6 çeyrek veri → E4 yok
cfo_quality  = CFO_TTM / net_kâr_TTM                            # net_kâr ≤ 0 ise özel durum: CFO_TTM > 0 şartı
npp_share    = |NPP_q| / |net_kâr_q|
tone         = LLM rapor dili skoru ∈ [−1, +1] (faaliyet raporu + sunum; firma adı maskelenmiş)
guidance     = LLM ∈ {yükseltildi, korundu, düşürüldü, yok}
```
**Tetik (S-E4):**
```
E4_trigger = SUE_real ≥ 1,0
         AND CFO_TTM > 0 AND cfo_quality ≥ 0,8
         AND npp_share < 0,5
         AND tone ≥ +0,2
         AND guidance ≠ "düşürüldü"
         AND denetim görüşü ∈ {olumlu, sınırlı_denetim_olumlu}
```
**Tutma:** 5 seans (birincil); 10 seans ikincil analiz olarak raporlanır.

### 3.5 N1 — Yalnızca kaçınma/çıkış filtreleri

| Kod | Olay | Tespit | Etki |
|---|---|---|---|
| N1a | SPK tedbiri / işlem yasağı (pay veya şirket içerisi kişi) | SPK haftalık bülten + [idari yaptırımlar](https://idariyaptirimlar.spk.gov.tr/IslemYasaklari) günlük tarama; KAP DKB bildirimleri | Yeni giriş yasak (R04); açık pozisyon → X3 |
| N1b | VBTS tedbiri (her kademe) | KAP `disclosureClass == "DKB"` + subject/özet içinde "Volatilite Bazlı Tedbir", "Brüt Takas", "Tek Fiyat", "Açığa Satış" | Yeni giriş yasak; açık pozisyon → X3 |
| N1c | Bedelsiz sermaye artırımı (YK kararı veya SPK onayı) | subject "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim" (`disclosureType=CA`), tür = bedelsiz | 10 seans yeni giriş yok; eldeyse SPK onay bildirimini izleyen **1. seans kapanışında** çık (+1 günü pozitif, +2..+5 negatif; Erol & Aytekin 2018) |
| N1d | Sulandırıcı bedelli / tahsisli | Aynı subject; bedelli ≥ sermayenin %20'si **veya** tahsisli fiyat < son kapanış | 20 seans yeni giriş yok; eldeyse X3 |
| N1e | Olumsuz / şartlı denetim görüşü, görüş vermekten kaçınma | FR ekinden LLM + anahtar kelime | Yeni giriş yok; eldeyse X3 |
| N1f | YİP'e alınma, işlem durdurma > 1 seans | KAP DKB | X3 |

---

## 4. Sızıntı filtresi (S-L)

```
pre_run = Π(1 + R_i,t) − Π(1 + R_XU100,t),  t ∈ [−5, −1] seans (olay seansı öncesi)
if pre_run > 8%:
    E1, E2  → m_leak = 0,5
    E3, E4  → sinyal iptal (reason = "LEAKAGE")

# E4 ek kontrolü (Kanonik R2): sonuç öncesi daha uzun run-up
pre_run_10 = Π(1 + R_i,t) − Π(1 + R_XU100,t),  t ∈ [−10, −1] seans
if event_type == "E4" and pre_run_10 > 12%:
    sinyal iptal (reason = "LEAKAGE_E4_10D")
```
Olay seansı tanımı §12.2'dedir. Piyasa düzeltmeli basit fark kullanılır (tahmin penceresi gerektirmez, canlıda hızlı hesaplanır).

---

## 5. Giriş zamanlaması (seansa duyarlı)

Karar anı `t_dec = publishDate + ajan işleme süresi`; tüm kurallar `t_pub = publishDate`'e göre kovalanır.

| `t_pub` penceresi (işlem günü d) | E1 / E2 / E4 | E3 |
|---|---|---|
| d−1 18:10 → d 09:30 | **d açılış seansı** (09:40–09:55 limit emir) | d açılış seansı |
| d 09:30 → 09:55 | d açılış seansı mümkünse; ajan zinciri 09:55'e yetişmezse d sürekli işlem 10:15 sonrası | aynı |
| d 10:00 → 17:30 | **d+1 açılış seansı** (birincil, backtest ile aynı) | Seans içi giriş: `t ≥ t_pub + 15 dk` **ve** `P_now / P_pre − 1 < +4%` ise limit emir; değilse d+1 açılış yalnızca `gap = Open_{d+1}/Close_d − 1 < +4%` **veya** d günü tavan kilitli kapandıysa |
| d 17:30 → 18:10 | d+1 açılış seansı | d+1 açılış seansı (aynı gap kuralı) |
| Tatil / hafta sonu | Sonraki işlem günü açılış seansı | aynı |

- `P_pre` = `t_pub`'dan önceki son işlem fiyatı. Ücretsiz veri 15 dk gecikmeli olduğundan seans içi E3 girişleri **ikincil varyanttır**: birincil (pre-registered) sonuç her tip için "ilk uygulanabilir açılış seansı" girişidir.
- **Emir tipi:** Her zaman **limit**. `limit = min(ref_price × 1,02, üst_marj_fiyatı − 1 tick)`. `ref_price` = fiş anındaki son fiyat (açılış öncesi için önceki kapanış). Emir **o seans sonunda (GÜN) geçersiz**; fiş TTL = 30 dk (kişisel mod).
- Açılış seansında dolmayan emir **tekrarlanmaz** (fiyat kovalamak yok). Olay "missed" olarak kaydedilir; backtest'te de aynı kural (Open > limit → dolum yok).

---

## 6. Çıkış kuralları (X1..X6)

Tüm çıkış kontrolleri **her seans kapanışından sonra (18:15)** günlük verilerle çalışır; çıkış emirleri ertesi seansın açılış seansına limit/piyasa emri olarak verilir (X5 hariç).

| ID | Kural | Tetik | Uygulama |
|---|---|---|---|
| X1 | Zaman çıkışı | `held_sessions == hold_N` (E1: 20→maks 40, E2: 20/60, E3: 5, E4: 5) | N. seansın **kapanış seansında** sat (SimBIST: kapanış fiyatı; kişisel: kapanış seansı emri, yoksa ertesi açılış) |
| X2 | Stop-loss (kapanış bazlı) | `Close_t ≤ stop_price` | Ertesi açılış seansında sat; limit = `taban_fiyatı` (çıkış önceliklidir) |
| X3 | N1 filtre çıkışı | §3.5'teki olaylar | Ertesi açılış seansında sat |
| X4 | Sinyal tersine dönmesi | E1: geri alınan pay satışı bildirimi; E2: aynı şirkette içeriden net satış ≥ ilk alımın %50'si | Ertesi açılış seansında sat |
| X5 | Kill switch | R01 tetiklendi | Açık **alım** emirleri iptal; **açık pozisyonlar satılmaz**, X1–X4 ile yönetilir (panik satış yok). Tasfiye kill switch'in parçası değildir; gerekirse ayrı SELL önerileri olarak normal insan onayından geçer |
| X6 | Başa baş stopu | `max(Close) ≥ entry × (1 + 2 × stop_pct)` | `stop_price ← entry` (stop yalnızca yukarı taşınır) |

**Sabit kâr al (take-profit) yok.** Gerekçe: strateji sürüklenme (drift) yakalamaya çalışıyor; sabit hedef dağılımın sağ kuyruğunu keser. X6 kazanılmış kârı kısmen korur.

### 6.1 Stop seviyesi (kapanış bazlı ATR — Kanonik R2)
Stop yalnızca **seans kapanış fiyatıyla** kontrol edilir (X2); gün içi stop yok (15 dk gecikmeli veriyle tekrarlanabilir değil). İşlem başına %0,5 risk büyüklüğü bu `stop_pct` ile hesaplanır (§7.1).
```
ATR20      = 20 seanslık Average True Range (ham fiyat, bedelsiz/bölünme düzeltmeli)
stop_pct   = clamp(k_type × ATR20 / entry_price, lo_type, hi_type)
stop_price = entry_price × (1 − stop_pct)
```
| Tip | k | lo | hi |
|---|---|---|---|
| E1 | 2,5 | %5 | %12 |
| E2 | 2,5 | %5 | %12 |
| E3 | 2,0 | %4 | %6 |
| E4 | 2,0 | %4 | %8 |

**Boşluk (gap) riski:** ±%10 marj yüzünden taban kilitli seanslarda çıkış mümkün olmayabilir; gerçekleşen zarar planlanan riskin 2 katına çıkabilir. Risk raporunda "gerçekleşen R / planlanan R" dağılımı izlenir.

---

## 7. Pozisyon büyüklüğü ve portföy kısıtları

### 7.1 Boyutlama formülü
```
m_evidence = {E1: 1,0, E2: 1,0, E4: 0,7, E3: 0,5}      # holdout sonrası güncellenir, asla > 1
m_conf     = 1,0 if confidence ≥ 0,80 else 0 (ret)
m_leak     = 0,5 if S-L bayrağı (E1/E2) else 1,0
m_regime   = 0,5 if kriz rejimi else 1,0
m_skeptic  = Şüpheci ajan önerisi ∈ {1,0; 0,5; 0}      # yalnızca küçültür

risk_TL    = equity × 0,005 × m_evidence × m_conf × m_leak × m_regime × m_skeptic
qty_risk   = floor(risk_TL / (entry_price × stop_pct))
qty_pos    = floor(equity × 0,10 / entry_price)
qty_adv    = floor(0,01 × ADV20_TL / entry_price)
qty_cash   = floor(cash_free / (entry_price × (1 + cost_side)))
qty        = min(qty_risk, qty_pos, qty_adv, qty_cash)
if qty × entry_price < min_notional: RET ("TOO_SMALL")
```
`equity` = mark-to-market toplam hesap değeri (son bilinen fiyat). `min_notional` = max(2.000 TL, equity × %1).

**Örnek:** equity 1.000.000 TL, E1, fiyat 40 TL, ATR20 1,40 TL → 2,5 × 1,40 / 40 = %8,75 (aralık içinde) → risk_TL = 5.000 → qty_risk = 5.000 / (40 × 0,0875) = 1.428 lot (57.120 TL). qty_pos = 2.500; ADV20 80 m TL → qty_adv = 20.000 → **1.428 lot**.

### 7.2 Portföy kısıtları
| ID | Kısıt | Değer |
|---|---|---|
| P1 | Eşzamanlı pozisyon | Hedef 8, **maks 10** |
| P2 | Pozisyon başına | ≤ equity'nin %10'u (maliyet bazında ve piyasa değerinde; piyasa değeri %15'i aşarsa kısmi satış **yok**, yalnızca rapor) |
| P3 | Sektör | ≤ %25 (holdingler ayrı sektör; BIST sektör sınıflaması) |
| P4 | Grup | Aynı şirketler grubu (ör. aynı holding iştirakleri) ≤ %20 |
| P5 | Brüt maruziyet | ≤ %100 (kaldıraç yok); kriz rejiminde ≤ %50 |
| P6 | Nakit tamponu | ≥ %5 |
| P7 | Günlük yeni giriş | ≤ 3 |
| P8 | Sembol bekleme süresi | Stop (X2) çıkışından sonra 10 seans aynı sembole giriş yok |
| P9 | Piramit | Yok — açık pozisyona ekleme yapılmaz, yalnızca tutma uzatılır |
| P10 | Hacim | Emir ≤ ADV20'nin %1'i |

---

## 8. Maliyet modeli ve "avantaj ≥ 2 × maliyet" kontrolü (S-C)

### 8.1 Maliyet bileşenleri (taraf başına)
```
commission_side = c_broker × (1 + 0,05)                 # BSMV %5
fees_side       = 0,000025 + 0,0000004                  # borsa payı 0,25 bp + Takasbank milyonda 4
half_spread     = CS_hl_spread / 2                      # Corwin–Schultz (2012) yüksek-düşük tahmincisi, 20 seans medyanı
                                                        # canlı derinlik verisi varsa gerçek (ask−bid)/(2×mid)
impact          = Y × σ_daily × sqrt(Q / ADV20_shares)  # karekök kanunu, Y = 0,7 [K]
manual_slip     = 0,0005 (yalnızca kişisel mod; gerçekleşen veriyle kalibre edilir)
cost_side       = commission_side + fees_side + half_spread + impact (+ manual_slip)
round_trip      = 2 × cost_side
round_trip_used = max(round_trip, floor_rt)             # floor_rt = %0,30 (stres tabanı; Lopez-Lira & Tang 20 bp'de öldü)
```
**SimBIST maliyet senaryoları (Revizyon 3):** **baz senaryo `c_broker` = %0,05 / taraf + hacme bağlı kayma** (`half_spread` + `impact`); **duyarlılık senaryosu `c_broker` = %0,20 / taraf** (banka tipi kurum; BSMV komisyon üzerinden %5). Borsa payı %0,0025 [V]. Asıl maliyet, düşük likit hisselerdeki alış-satış farkı ve piyasa etkisidir. Her olay çalışması ve backtest sonucu iki senaryoda da raporlanır.

`c_broker` config'ten okunur: SimBIST baz varsayılanı **%0,05** (Revizyon 3; eski %0,03 [K] değeri kaldırıldı), duyarlılık **%0,20**; kişisel mod gerçek sözleşme oranı, **üst sınır %0,05 / taraf** (Kanonik R2; bu oranın üstündeki aracı kurumla kişisel mod açılmaz, `c_broker_personal_max`). **Uyarı:** Banka tipi ~%0,20 taraf başı komisyonla `round_trip` tek başına ≥ %0,42 olur; bu E1/E2'nin beklenen avantajının büyük kısmını yer (bkz. kişisel plan §3).

### 8.2 Beklenen avantaj
```
CAR_type   = tip düzeyi ortalama CAR[1,H] (geliştirme verisi 2018–2024; holdout sonrası 2018–2026)
CAR_firm   = firma+tip ortalaması (n_f olay)
w          = n_f / (n_f + 20)                                   # küçülme (shrinkage)
edge_raw   = w × CAR_firm + (1 − w) × CAR_type
edge_adj   = 0,5 × edge_raw                                      # yayın/benimseme sonrası bozulma payı (McLean & Pontiff: −%58)
S-C geçer ⇔ edge_adj ≥ 2 × round_trip_used
```
H = tipin birincil penceresi (E1/E2: 20, E3/E4: 5). **Örnek (baz senaryo):** E1 edge_raw %2,0 → edge_adj %1,0; round_trip = 2 × (0,0525% + 0,0025% + 0,08% + 0,04%) ≈ %0,35 → 2 × %0,35 = %0,70 ≤ %1,0 → **geçer**. **Duyarlılık senaryosu (%0,20 / taraf):** round_trip = 2 × (0,21% + 0,0025% + 0,08% + 0,04%) ≈ %0,67 → 2 × %0,67 = %1,33 > %1,0 → **geçmez**.

---

## 9. Rejim / kriz tespiti

```
crisis_on = (XU100_close < SMA50(XU100) AND RV20 ≥ P80(RV20, son 756 seans))
         OR XU100 günlük getirisi ≤ −5%
         OR son 5 seansta endeks bazlı devre kesici / piyasa geneli durdurma
RV20      = sqrt(252) × std(günlük log getiri, 20 seans)
crisis_off: crisis_on koşullarının hiçbiri 5 ardışık seans boyunca sağlanmıyor (histerezis)
```
Kriz etkisi: `m_regime = 0,5`, brüt maruziyet ≤ %50, **yeni E3 yok**, günlük yeni giriş ≤ 1. Açık pozisyonlar zorla kapatılmaz. (16.09.2026: XU100 gün içi −%7,5, kapanış −%5,54 → üçüncü koşul tetiklenirdi; [Kısa Dalga](https://kisadalga.net/haber/gundem/fonlardan-borsaya-yayilan-krizi-anlama-kilavuzu-satis-dalgasi-nasil-basladi-spk-neden-130-fon-icin-tasfiye-karari-aldi-140429).)

---

## 10. Risk kapısı: R01–R16 (tek kaynak)

İlkeler: (1) Kurallar **sırayla** çalışır, ilk `REJECT` zinciri durdurur, `RESIZE`'lar kümülatif olarak küçültür. (2) Kapı yalnızca `PASS`, `RESIZE(↓)`, `REJECT`, `HOLD` döndürür; **asla büyütmez** (monotonluk özellik testi, Hypothesis). (3) `kaptan.risk` paketinde **%100 satır + dal kapsamı** CI kapısıdır. (4) Çıkış (SELL) emirleri yalnızca R01 (kısmen), R09, R12, R15 ve R16'dan geçer; kill switch çıkışları engellemez. (5) **Otomatik yürütme yoktur:** R01–R14'ten geçen her öneri (SELL dahil) R15 ile insan onayına gider; yalnızca `mode="backtest"` replay'inde onay simüle edilir. (6) R03, R04 ve R13 ayrıca **S0 LLM'siz ön elemede** (LLM çağrısından önce) ve R16'da (gönderim anında) tekrar çalışır — "üç fren".

**Sıra:** R01 → R02 → R03 → R04 → R13 → R11 → R14 → R05 → R06 → R09 → R12 → R07 → R08 → R10 → R15; onaydan sonra R16. (Sert retler önce, küçültmeler sonra, onay seviyesi en son.)

### 10.0 Kural listesi ve eski numaralandırmayla eşleme

| ID | Ad | Sonuç | `05-ajan-spesifikasyonlari.md` §5.2 eski kodu |
|---|---|---|---|
| R01 | Kill switch / zirveden −%5 | REJECT (BUY) | R01_KILL_SWITCH |
| R02 | Günlük −%1 zarar durdurma | REJECT (BUY) | R02_DAILY_STOP |
| R03 | Evren | REJECT | R03_UNIVERSE |
| R04 | Tedbir / N1 sert vetosu + tedbir verisi tazeliği | REJECT (BUY) | R05_SPK_HARD |
| R05 | Kanıt şartı (kimlik, zaman, n) | REJECT | R04_EVIDENCE |
| R06 | Avantaj ≥ 2 × maliyet | REJECT | R10_EDGE |
| R07 | Boyut (risk %0,5, pozisyon %10, ADV %1, nakit) | RESIZE / REJECT | R14_POSITION_CAP, R15_ADV |
| R08 | Portföy kısıtları (eşzamanlılık, sektör, grup, günlük giriş, bekleme) | RESIZE / REJECT | R11_RATE, R12_CONCURRENCY |
| R09 | Fiyat bandı ±%2, tavan/taban, bayat fiyat | REJECT / HOLD | R07_PRICE_BAND, R08_LIMIT_UP_DOWN, R09_STALE_PRICE |
| R10 | Kriz rejimi | RESIZE ×0,5 / REJECT (E3) | R16_REGIME |
| R11 | Veri ve LLM sağlığı (kota, KAP gecikmesi, şema, injection) | HOLD / REJECT | R06_LLM_BUDGET |
| R12 | Mod, canlı silahlanma (3 anahtar), yalnızca long, kaldıraçsız | REJECT | R13_NO_SHORT, R17_LIVE_KEYS |
| R13 | Ekip içeriden-öğrenen engel listesi | REJECT (BUY) | — (yeni) |
| R14 | Tutar çapraz kontrolü (Okuyucu ↔ regex) | REJECT | — (yeni) |
| R15 | Zorunlu insan onayı, onay seviyesi ve onay süresi (09:50) | APPROVAL_REQUIRED (normal / escalate) | R18_APPROVAL_LEVEL |
| R16 | Gönderim anı yeniden kontrol + onay süresi dolumu + kişisel fiş süresi (30 dk) | REJECT | `phase="at_send"` |

> 05 dokümanındaki R-kodları bu tabloya göre yeniden adlandırılmalıdır; çelişkide bu belge geçerlidir. 05'teki "R12 ≥ 8 pozisyon → escalate" uyarısı R15 escalate nedenlerine taşınmıştır.

```python
@dataclass(frozen=True)
class GateContext:
    equity: Decimal; cash_free: Decimal; peak_equity: Decimal; day_start_equity: Decimal
    kill_switch: bool; positions: tuple[Position, ...]; universe: frozenset[str]
    restrictions: Mapping[str, tuple[str, ...]]   # sembol -> aktif N1 kodları
    restrictions_as_of: datetime                  # tedbir verisinin son başarılı güncellenmesi
    restricted_securities: frozenset[str]         # ekip içeriden-öğrenen engel listesi (R13)
    crisis: bool; last_price: Decimal; price_ts: datetime; upper_limit: Decimal; lower_limit: Decimal
    adv20_tl: Decimal; kap_lag_s: int; llm_budget_ok: bool; mode: Literal["backtest","paper","personal"]
    live_keys: tuple[bool, bool, bool]; now: datetime; entries_today: int; sector_exposure: Mapping[str, Decimal]
    compliance: Literal["pass","escalate","veto"]; degraded: bool
```

### R01 — Kill switch / zirveden düşüş
```python
def r01(p, c, l):
    dd = c.equity / c.peak_equity - 1
    if c.kill_switch or dd <= l.kill_dd:            # kill_dd = -0.05
        return REJECT("R01_KILL") if p.side == "BUY" else PASS
    return PASS
```
| # | equity | peak | kill_switch | side | Beklenen |
|---|---|---|---|---|---|
| 1 | 960.000 | 1.000.000 | False | BUY | PASS (−%4) |
| 2 | 950.000 | 1.000.000 | False | BUY | REJECT (−%5,0 sınırda dahil) |
| 3 | 1.000.000 | 1.000.000 | True | BUY | REJECT |
| 4 | 900.000 | 1.000.000 | True | SELL | PASS (çıkış engellenmez) |

### R02 — Günlük zarar
```python
def r02(p, c, l):
    day_ret = c.equity / c.day_start_equity - 1
    return REJECT("R02_DAILY_LOSS") if (p.side == "BUY" and day_ret <= l.daily_loss) else PASS   # -0.01
```
| # | day_start | equity | side | Beklenen |
|---|---|---|---|---|
| 1 | 1.000.000 | 991.000 | BUY | PASS |
| 2 | 1.000.000 | 990.000 | BUY | REJECT |
| 3 | 1.000.000 | 980.000 | SELL | PASS |

### R03 — Evren
```python
def r03(p, c, l):
    return PASS if p.symbol in c.universe else REJECT("R03_UNIVERSE")
```
| # | symbol | universe | Beklenen |
|---|---|---|---|
| 1 | THYAO | {THYAO, ASELS} | PASS |
| 2 | XYZAB | {THYAO} | REJECT |
| 3 | thyao (küçük harf) | {THYAO} | REJECT (normalizasyon üst katmanın işi; kapı kör değildir) |

### R04 — Tedbir / N1 sert vetosu + tedbir verisi tazeliği
```python
def r04(p, c, l):
    if p.side != "BUY": return PASS
    if (c.now - c.restrictions_as_of) > l.max_restriction_age: return REJECT("R04_STALE_RESTRICTIONS")  # 24 sa
    active = c.restrictions.get(p.symbol, ())
    return REJECT("R04_RESTRICTED", codes=active) if active else PASS
```
| # | restrictions[sym] | veri yaşı | side | Beklenen |
|---|---|---|---|---|
| 1 | () | 2 sa | BUY | PASS |
| 2 | ("VBTS_BRUT_TAKAS",) | 2 sa | BUY | REJECT |
| 3 | ("SPK_TEDBIR",) | 2 sa | SELL | PASS |
| 4 | ("N1c_BEDELSIZ",) | 2 sa | BUY | REJECT |
| 5 | () | **30 sa** | BUY | REJECT STALE (tedbir bilinmiyorsa alım yok) |

### R05 — Kanıt şartı
```python
def r05(p, c, l):
    ok = (p.evidence_ids and set(p.evidence_ids) <= set(p.retrieved_ids)
          and all(e.published_at < p.decision_ts for e in p.evidence)
          and p.n_precedents >= l.min_precedents)            # min_precedents = 5 (tip düzeyi)
    return PASS if ok else REJECT("R05_EVIDENCE")
```
| # | evidence_ids | retrieved | published_at < karar | n_prec | Beklenen |
|---|---|---|---|---|---|
| 1 | {a,b} | {a,b,c} | evet | 12 | PASS |
| 2 | {} | {a} | — | 12 | REJECT |
| 3 | {a,z} | {a,b} | evet | 12 | REJECT (uydurma kanıt) |
| 4 | {a} | {a} | **hayır** (gelecekten) | 12 | REJECT |
| 5 | {a} | {a} | evet | 3 | REJECT |

Not: Kanıt ajanı emsal olayları **getirilerini görmeden** seçer; `n_precedents`, ortalama CAR ve isabet oranı kod tarafından `event_returns` tablosundan `available_at < decision_ts` filtresiyle hesaplanır (chunk metadata'sındaki getiri kullanılmaz).

### R06 — Avantaj ≥ 2 × maliyet
```python
def r06(p, c, l):
    return PASS if p.edge_adj >= l.edge_cost_mult * p.round_trip_used else REJECT("R06_EDGE")   # 2.0
```
| # | edge_adj | round_trip_used | Beklenen |
|---|---|---|---|
| 1 | %1,00 | %0,31 | PASS |
| 2 | %0,60 | %0,30 | PASS (eşitlik dahil) |
| 3 | %0,59 | %0,30 | REJECT |
| 4 | %1,00 | %0,55 (banka komisyonu) | REJECT |

### R07 — Boyut (risk, pozisyon, hacim, nakit)
```python
def r07(p, c, l):
    q = min(p.qty,
            floor(c.equity * l.risk_per_trade * p.multipliers / (p.price * p.stop_pct)),
            floor(c.equity * l.max_pos / p.price),
            floor(l.max_adv * c.adv20_tl / p.price),
            floor(c.cash_free / (p.price * (1 + p.cost_side))))
    if q * p.price < max(l.min_notional_abs, c.equity * l.min_notional_pct): return REJECT("R07_TOO_SMALL")
    return PASS if q == p.qty else RESIZE("R07_SIZE", new_qty=q)
```
| # | equity | fiyat | stop_pct | ADV20 | istenen qty | Beklenen |
|---|---|---|---|---|---|---|
| 1 | 1.000.000 | 40 | %8,75 | 80 m | 1.428 | PASS |
| 2 | 1.000.000 | 40 | %4 | 80 m | 3.125 | RESIZE → 2.500 (%10 tavanı) |
| 3 | 1.000.000 | 40 | %8,75 | 3 m | 1.428 | RESIZE → 750 (%1 ADV) |
| 4 | 1.000.000 | 40 | %8,75 | 80 m | 1.428, cash_free 5.000 | REJECT (124 lot × 40 < 10.000 min_notional) |

### R08 — Portföy kısıtları
```python
def r08(p, c, l):
    if p.side != "BUY": return PASS
    if any(x.symbol == p.symbol for x in c.positions): return REJECT("R08_DUPLICATE")
    if len(c.positions) >= l.max_positions: return REJECT("R08_MAX_POS")             # 10
    if c.entries_today >= (l.max_entries_crisis if c.crisis else l.max_entries_day): return REJECT("R08_DAILY_ENTRIES")
    if in_cooldown(p.symbol, c, l.cooldown_sessions): return REJECT("R08_COOLDOWN")
    room = l.max_sector * c.equity - c.sector_exposure.get(p.sector, 0)             # 0.25
    if room <= 0: return REJECT("R08_SECTOR")
    if p.notional > room: return RESIZE("R08_SECTOR", new_qty=floor(room / p.price))
    gross_cap = (l.gross_crisis if c.crisis else l.gross_max) * c.equity             # 0.5 / 1.0
    ... aynı mantıkla gross ve grup (0.20) sınırı ...
    return PASS
```
| # | açık pozisyon | sektör maruziyeti | istenen | Beklenen |
|---|---|---|---|---|
| 1 | 7, farklı semboller | %10 | %8 | PASS |
| 2 | 10 | — | — | REJECT MAX_POS |
| 3 | 5, aynı sembol var | — | — | REJECT DUPLICATE |
| 4 | 5 | %20 | %8 | RESIZE → %5 |
| 5 | 5, kriz, brüt %48 | %0 | %8 | RESIZE → %2 |

### R09 — Fiyat bandı, tavan/taban, bayat fiyat
```python
def r09(p, c, l):
    if (c.now - c.price_ts) > l.max_price_age and session_open(c.now): return HOLD("R09_STALE")   # 20 dk
    if abs(p.limit / c.last_price - 1) > l.price_band: return REJECT("R09_BAND")                  # 0.02
    if p.side == "BUY" and c.last_price >= c.upper_limit * (1 - l.near_limit): return REJECT("R09_NEAR_UPPER")  # 0.01
    return PASS
```
| # | side | last | limit | upper | fiyat yaşı | Beklenen |
|---|---|---|---|---|---|---|
| 1 | BUY | 40,00 | 40,80 | 44,00 | 5 dk | PASS |
| 2 | BUY | 40,00 | 41,00 | 44,00 | 5 dk | REJECT BAND (%2,5) |
| 3 | BUY | 43,70 | 43,70 | 44,00 | 5 dk | REJECT NEAR_UPPER |
| 4 | BUY | 40,00 | 40,50 | 44,00 | 35 dk (seans açık) | HOLD STALE |
| 5 | SELL | 36,00 | 36,00 | 44,00 | 5 dk | PASS (taban yakınında satış serbest) |

Not: SELL için R09 bant kontrolü `limit ≥ lower_limit` şartına indirgenir (çıkış önceliği).

**Fiyat serisi (Revizyon 3) [V]:** R09'un bant ve tavan/taban kontrolleri (`last_price`, `upper_limit`, `lower_limit`) ile SimBIST dolumları **ham fiyatla** yapılır (İş Yatırım `HG_KAPANIS`); getiri ve CAR hesabı **düzeltilmiş** fiyatla (`HGDG_KAPANIS` / yfinance `Close`). yfinance ham fiyat vermediğinden bu kontrollerde kullanılmaz.

**Piyasa kapalıyken üretilen emir (Revizyon 2, 05 Ö-12):** `intraday_limit` emir tipi yalnızca sürekli işlem seansında geçerlidir. Seans dışında üretilen öneri otomatik olarak **ertesi seans açılış seansı limit emrine** (`opening_auction_limit`) çevrilir; bant kontrolü önceki kapanışa göre yapılır ve R16 gönderim anında (açılıştan önce) tekrar çalışır. Test vakası: seans dışı BUY, last=40,00 (önceki kapanış), limit=40,60 → PASS, tip=`opening_auction_limit`.

### R10 — Kriz rejimi
```python
def r10(p, c, l):
    if not c.crisis or p.side != "BUY": return PASS
    if p.event_type == "E3": return REJECT("R10_CRISIS_E3")
    return RESIZE("R10_CRISIS", new_qty=floor(p.qty * 0.5)) if not p.regime_applied else PASS
```
| # | crisis | tip | regime_applied | Beklenen |
|---|---|---|---|---|
| 1 | False | E3 | — | PASS |
| 2 | True | E3 | — | REJECT |
| 3 | True | E1 | False | RESIZE ×0,5 |
| 4 | True | E1 | True (kural motoru zaten uyguladı) | PASS (çift küçültme yok) |

### R11 — Veri ve LLM sağlığı
```python
def r11(p, c, l):
    if not c.llm_budget_ok: return HOLD("R11_LLM_QUOTA")
    if c.kap_lag_s > l.max_kap_lag_s: return HOLD("R11_KAP_LAG")          # 300 sn
    if p.schema_errors: return REJECT("R11_SCHEMA")
    if p.injection_flag: return REJECT("R11_INJECTION")                   # Türkçe kural tabanlı kontrol ∨ Prompt Guard ∨ Uyum bayrağı
    return PASS
```
`max_kap_lag_s` (300 sn), KAP polling aralığının (seans içi **≥ 30 sn**) üstünde tolerans bırakır. `injection_flag`, Prompt Guard'ın Türkçeyi resmî olarak desteklememesi nedeniyle Türkçe kural tabanlı injection kontrolünün sonucunu da içerir (bkz. `09-guvenlik-ve-uyum.md`).
| # | llm_budget_ok | kap_lag | schema_errors | injection | Beklenen |
|---|---|---|---|---|---|
| 1 | True | 40 sn | [] | False | PASS |
| 2 | False | 40 | [] | False | HOLD |
| 3 | True | 900 | [] | False | HOLD |
| 4 | True | 40 | ["qty<0"] | False | REJECT |
| 5 | True | 40 | [] | True | REJECT |

### R12 — Mod, canlı silahlanma, yalnızca long, kaldıraçsız
```python
def r12(p, c, l):
    if p.side == "SELL" and p.qty > held_qty(p.symbol, c): return REJECT("R12_NO_SHORT")
    if p.side == "BUY" and p.notional * (1 + p.cost_side) > c.cash_free: return REJECT("R12_NO_LEVERAGE")
    if c.mode == "personal" and not all(c.live_keys): return REJECT("R12_NOT_ARMED")   # config + env + UI
    return PASS
```
| # | mode | side | held | qty | live_keys | nakit | Beklenen |
|---|---|---|---|---|---|---|---|
| 1 | paper | BUY | 0 | 100 | — | yeterli | PASS |
| 2 | paper | SELL | 50 | 100 | — | — | REJECT NO_SHORT |
| 3 | personal | BUY | 0 | 100 | (T,T,F) | yeterli | REJECT NOT_ARMED |
| 4 | personal | BUY | 0 | 100 | (T,T,T) | yeterli | PASS |
| 5 | personal | BUY | 0 | 100 | (T,T,T) | yetersiz | REJECT NO_LEVERAGE |

(Emir fişi süresi — eski `R12_TICKET_EXPIRED` — onaydan sonra anlamlı olduğu için R16'ya taşındı.)

### R13 — Ekip içeriden-öğrenen engel listesi
Ekip üyelerinin (veya birinci derece yakınlarının) çalıştığı, yönetiminde bulunduğu ya da içeriden bilgiye erişebileceği şirketlerin payları `restricted_securities` tablosunda tutulur; liste Admin tarafından yönetilir, her değişiklik audit'e yazılır.
```python
def r13(p, c, l):
    return REJECT("R13_INSIDER_BLOCKLIST") if (p.side == "BUY" and p.symbol in c.restricted_securities) else PASS
```
| # | symbol | restricted_securities | side | Beklenen |
|---|---|---|---|---|
| 1 | ASELS | {} | BUY | PASS |
| 2 | ASELS | {ASELS} | BUY | REJECT |
| 3 | ASELS | {ASELS} | SELL | PASS (listeye sonradan eklenen pozisyondan çıkış serbest; R15 escalate) |

### R14 — Tutar çapraz kontrolü
Okuyucu'nun çıkardığı tutar (E1 nominal, E2 alım/satım nominali, E3 sözleşme tutarı), bildirim ham metninden deterministik regex ile çıkarılan tutarlar kümesinde (TR/EN sayı biçimi normalize edilmiş, ±%0,5 yuvarlama toleransı) bulunmalıdır. Önemlilik ajanı tutar çıkarmaz; oranları Birleştirme düğümü bu doğrulanmış tutarla hesaplar.
```python
def r14(p, c, l):
    if p.event_type not in ("E1", "E2", "E3"): return PASS
    ok = any(abs(p.reader_amount / a - 1) <= l.amount_tol for a in p.regex_amounts if a > 0)
    return PASS if ok else REJECT("R14_AMOUNT_MISMATCH")
```
| # | Okuyucu tutarı | regex tutarları | Beklenen |
|---|---|---|---|
| 1 | 125.000.000 | {125.000.000; 3.000.000} | PASS |
| 2 | 12.500.000 | {125.000.000} | REJECT (basamak kayması) |
| 3 | 125.000.000 | {} (tablo görsel/PDF) | REJECT |
| 4 | — (E4) | — | PASS (E4 yapılandırılmış finansal veriden) |

### R15 — Zorunlu insan onayı, onay seviyesi ve onay süresi
Otomatik yürütme yoktur. Önceki kurallardan geçen **her** öneri `interrupt()` ile Risk Officer'a (kişisel modda kullanıcıya) gider. R15 yalnızca onay kartının seviyesini ve son geçerlilik zamanını belirler.
```python
def r15(p, c, l):
    if c.mode == "backtest":                                       # simüle onay; "onaysız" ablation 08'de
        return APPROVED_SIMULATED
    reasons = [r for r, cond in (
        ("COMPLIANCE_ESCALATE", c.compliance == "escalate"),
        ("DEGRADED", c.degraded),
        ("NEAR_MAX_POSITIONS", len(c.positions) >= l.target_positions),   # ≥ 8
        ("RESTRICTED_SELL", p.side == "SELL" and p.symbol in c.restricted_securities),
        ("RESIZED", p.was_resized)) if cond]
    expires = next_session_open(c.now).replace(hour=9, minute=50)      # bir sonraki seansın 09:50'si
    return APPROVAL_REQUIRED(level="escalate" if reasons else "normal", reasons=reasons, expires_at=expires)
```
| # | mode | compliance | pozisyon | now | Beklenen |
|---|---|---|---|---|---|
| 1 | paper | pass | 5 | Sal 14:10 | APPROVAL normal, `expires_at` = Çar 09:50 |
| 2 | paper | escalate | 5 | Sal 14:10 | APPROVAL escalate |
| 3 | personal | pass | 8 | Cum 19:00 | APPROVAL escalate, `expires_at` = Pzt 09:50 |
| 4 | backtest | pass | 5 | — | APPROVED_SIMULATED |

Not: Onay süresi dolan BUY önerisi düşer ve "gölge sinyal" olarak kaydedilir (08 §4). Süresi dolan **çıkış** (X1–X4) önerisi düşmez; sonraki seans için escalate seviyesinde yeniden üretilir.

### R16 — Gönderim anı yeniden kontrol (`phase="at_send"`)
Onay ile emir gönderimi arasında durum değişebilir. `execute` düğümü emri/fişi üretmeden hemen önce:
```python
def r16(p, c, l, approval):
    if c.now > approval.expires_at: return REJECT("R16_APPROVAL_EXPIRED")                    # 09:50 kuralı
    for rule in (r01, r02, r03, r04, r09, r12, r13):                                          # güncel bağlamla
        r = rule(p, c, l)
        if r.outcome in ("REJECT", "HOLD"): return REJECT("R16_" + r.code)
    return PASS
# kişisel mod: üretilen emir fişi 30 dk (ticket_ttl) içinde girilmezse geçersizdir → R16_TICKET_EXPIRED
# açılış öncesi üretilen fişte süre 09:40'tan (açılış emir toplama) başlar → en geç 09:55; seans sonunda da düşer
```
| # | Durum | Beklenen |
|---|---|---|
| 1 | Onay Sal 16:00, gönderim Çar 09:45, değişiklik yok | PASS |
| 2 | Onay Sal 16:00, gönderim Çar 09:55 | REJECT APPROVAL_EXPIRED |
| 3 | Onaydan sonra kill switch açıldı | REJECT R16_R01_KILL |
| 4 | Onaydan sonra hisseye VBTS tedbiri geldi | REJECT R16_R04_RESTRICTED |
| 5 | Kişisel fiş 45 dk önce üretildi, girilmedi | REJECT TICKET_EXPIRED |

### 10.1 Kapı düzeyinde özellik testleri (Hypothesis)
- `∀ input: result.qty ≤ input.qty` (monotonluk).
- `kill_switch=True ∧ side=BUY ⇒ REJECT`.
- `side=SELL ⇒ result ∉ {REJECT by R01, R02, R04, R08, R10, R13}`.
- `mode ≠ "backtest" ⇒` hiçbir emir/fiş, geçerli bir insan onayı (R15) ve R16 `PASS` olmadan üretilmez (otomatik yürütme yok).
- `now > expires_at ⇒ R16 REJECT`; `symbol ∈ restricted_securities ∧ side=BUY ⇒ REJECT`.
- `reader_amount ∉ regex_amounts (tolerans dışı) ⇒ REJECT` (E1–E3).
- Aynı girdi iki kez → aynı çıktı ve aynı audit hash'i (determinizm).
- Parametre dosyası değişmeden `rules_version` değişmez; değişirse eski kararlar yeniden oynatıldığında eski sürümle aynı sonucu verir.

---

## 11. Kill switch mantığı ve reset prosedürü

**Tetikler:** (a) otomatik: `equity / peak_equity − 1 ≤ −%5` (mark-to-market, her fiyat güncellemesinde ve seans sonu); (b) manuel: **Admin veya Risk Officer** (tek rol yeterli; UI, API, `scripts/kill.py`) — Analist ve Auditor tetikleyemez; (c) sistem: aynı gün içinde ≥ 3 R11 REJECT (şema/injection) → güvenlik kill'i.

**Tetiklenince (atomik, tek transaction):**
1. `system_flags.kill_switch = true`, sebep + tetikleyici + equity/peak anlık görüntüsü audit'e yazılır.
2. Tüm broker adapter'larında `cancel_all()` (**açık emirler iptal**); bekleyen onay kartları geçersiz sayılır. Kişisel modda sistem **"İPTAL" fişleri** üretir; kullanıcı aracı kurum uygulamasında iptal edip "iptal edildi" onayını girer; onay gelmeyene kadar UI kırmızı kalır.
3. **Açık pozisyonlar satılmaz**; X1–X4 çıkış kurallarıyla yönetilmeye devam eder (zorla tasfiye yok).
4. Telegram/e-posta uyarısı.

**Günlük durdurma (R02) farkı:** −%1 günlük zarar yalnızca **o gün** yeni alımı durdurur ve ertesi seans açılışında kendiliğinden kalkar. Kill switch kendiliğinden kalkmaz.

**Reset prosedürü:**
1. Olay sonrası inceleme formu (sebep: piyasa / kural / hata / veri) doldurulur ve audit'e eklenir.
2. Bekleme süresi: paper modda en az ertesi seans; **kişisel modda en az 5 seans** (tetiklenmeden itibaren).
3. İki anahtar: **Admin ve Risk Officer** ayrı hesaplarla onaylar (aynı hesap iki onayı veremez). Kişisel modda (tek kişi) iki rol aynı kişi olduğundan: iki onay arasında **≥ 24 saat** ve her onayda ayrı yazılı gerekçe (tek kişilik dört göz); reset ancak hem 5 seans bekleme hem 24 saat ara şartı sağlanınca etkinleşir.
4. Zirve sıfırlanmaz. Reset sonrası `m_reset = 0,5` boyut çarpanı, equity eski zirvenin −%2,5'i içine dönene kadar uygulanır. Reset seviyesinden ek −%3 düşüş → yeniden kill.
5. 6 ay içinde 2. kill → kişisel planda bir alt aşamaya dönüş (bkz. `12-kisisel-kullanim-plani.md`).

**Sınıf askıya alma (kill'den ayrı):** Bir olay tipi için son 30 kapanmış işlemin net anormal getirisi < 0 **ve** t < −1 → o tip `suspended`; yalnızca yeni `rules_version` + ileri dönük paper ile geri açılır.

---

## 12. Olay çalışması metodolojisi

### 12.1 Veri ve örneklem
- Olaylar: 2018-01-01 → holdout sonu KAP arşivi (saniye hassasiyetli `publishDate`), §3 tetik kurallarıyla **aynı kod** üzerinden. Point-in-time evren (§2).
- **Yıllık aday sayıları (Revizyon 3; 24 rastgele iş günü, Eki 2025–Eyl 2026) [V, yıllıklandırma ≈]:**

  | Bildirim türü | Yıllık ≈ |
  |---|---|
  | Tüm bildirimler | ~68.600 |
  | Gerçekleşen geri alım (E1 adayı) | ~1.100 |
  | Pay alım satım (yönetici/ana ortak, alış+satış; E2 adayı) | ~2.000 |
  | Yeni İş İlişkisi (E3 adayı) | ~600 |
  | İhale (E3 adayı) | ~385 |
  | Finansal Rapor (E4 adayı, mevsimsel) | ~2.700 |
  | Devre kesici (gürültü) | ~13.900 |

  **Bildirim ≠ bağımsız olay:** geri alımlar 45 şirkette yoğunlaşıyor ve düşüş günlerinde patlıyor (29.09.2026: 47 geri alım) → bağımsız olay sayısı bu rakamlardan belirgin biçimde düşüktür (§12.3 kümeleme).
- Fiyatlar (Revizyon 3) [V]: getiri için İş Yatırım **düzeltilmiş** kapanış (`HGDG_KAPANIS`, temettü + bedelsiz/bölünme; yfinance `Close` ile birebir aynı); dolum ve R09 kontrolleri için **ham** kapanış (`HG_KAPANIS`); `borsapy` kurumsal işlemleri; yfinance yalnızca çapraz kontrol (ham fiyat vermez). `Volume == 0` sahte tatil satırları atılır, takvim `market_calendar`/XU100'e hizalanır; kod değişimleri `ticker_history` ile eşlenir (ör. KOZAL → TRALT); **borsadan çıkan paylar İş Yatırım'dan** alınır (hayatta kalma yanlılığı). Endeks: XU100 fiyat endeksi (getiri endeksi erişimi **[U]**; hisse getirisi toplam getiri olduğundan küçük pozitif yanlılık raporlanır).
- Veri bölümleri: **geliştirme 2018–2022**, **doğrulama 2023–2024**, **holdout 2025-01-01 → 2026-10-31** (yalnızca **bir kez** çalıştırılır; projenin ana sayısal kanıtı). **Tamamlanmış pencere kuralı:** W6 ana koşusu yalnızca penceresi koşu tarihinden önce tamamlanmış (olay, ufuk) çiftlerini içerir; W12'de (4 Oca 2027) aynı dondurulmuş kodla tek bir "tamamlama koşusu" sonradan tamamlanan çiftleri ekler ve ayrı raporlanır (kanon Revizyon 2). Kanonik "2018–2024 geliştirme" = geliştirme + doğrulama. Holdout getirileri geliştirme notebook'larından bir view ile gizlenir.
- Backtest/replay'de insan onayı **simüle** edilir (her öneri onaylanmış sayılır, R15 `APPROVED_SIMULATED`); ileri dönük testteki onay etkisi ayrıca "onaysız" ablation olarak raporlanır (08).

### 12.2 Olay seansı ve getiri tanımları
- `t_pub < 09:40` işlem günü d → olay seansı d; giriş fiyatı `Open_d`.
- `09:40 ≤ t_pub ≤ 18:10` → olay seansı d; **uygulanabilir** giriş `Open_{d+1}` (birincil); klasik literatürle karşılaştırma için `Close_{d−1}` bazlı CAR[0,k] ayrıca raporlanır.
- `t_pub > 18:10` veya tatil → olay seansı sonraki işlem günü.
- Birincil pencereler (giriş seansı = 1): **CAR[1,1], CAR[1,5], CAR[1,20], CAR[1,60]**; sızıntı penceresi CAR[−5,−1].

### 12.3 Model
```
Piyasa modeli:  R_i,t = α_i + β_i × R_XU100,t + ε_i,t
Tahmin penceresi: [−250, −30] seans (olay seansına göre), ≥ 120 geçerli gözlem; yoksa piyasa düzeltmeli (α=0, β=1)
AR_i,t = R_i,t − (α̂_i + β̂_i × R_XU100,t)
CAR_i[a,b] = Σ AR_i,t (giriş seansının ilk gününde açılıştan kapanışa getiri kullanılır)
```
- Tahmin penceresinde başka bir E-olayı veya bedelsiz/bedelli varsa o günler çıkarılır.
- Aynı firmada 10 seans içinde tekrarlayan E1 bildirimleri **tek olay** (ilk tetik) olarak sayılır; örtüşme ayrıca raporlanır.
- **Bağımsız olay kümeleme (Revizyon 3, zorunlu):** Bildirim ≠ bağımsız olay. Geri alımlar 45 şirkette yoğunlaşıyor ve piyasa düşüş günlerinde topluca geliyor (29.09.2026: tek günde 47 geri alım). Bu yüzden olaylar **şirket + pencere** bazında kümelenir; raporlanan `n` bağımsız küme sayısıdır (ham bildirim sayısı ayrıca verilir) ve takvim kümelenmesi §12.4'teki Kolari–Pynnönen düzeltmesi, firma kümelenmiş standart hata ve takvim-zaman portföyüyle ele alınır.

### 12.4 İstatistik
- Kesitsel t: `t = mean(CAR) / (sd(CAR)/√n)`.
- **BMP** (Boehmer–Musumeci–Poulsen) standartlaştırılmış test + **Kolari–Pynnönen** çapraz korelasyon düzeltmesi (takvim kümelenmesi, ör. Eylül 2026 geri alım dalgası).
- Parametrik olmayan: Corrado sıra testi ve genelleştirilmiş işaret testi.
- 20/60 günlük pencerelerde örtüşen olaylar için **takvim-zaman portföyü** (her gün açık olay pozisyonlarının eşit ağırlıklı portföyü, XU100'e regresyon, α ve Newey–West t).
- Firma kümelenmiş standart hatalar; tarih bloklu bootstrap (5.000 tekrar) güven aralığı.
- Maliyet sonrası: her olay için §8 maliyet modeliyle `CAR_net = CAR − round_trip_used`; baz (%0,05 / taraf + kayma) ve duyarlılık (%0,20 / taraf) senaryoları ayrı raporlanır.
- Çoklu test: 4 tip × 4 pencere = 16 test → **Holm–Bonferroni**. Her tipin **birincil sonlanım noktası** önceden sabit: E1 CAR[1,20], E2 CAR[1,20], E3 CAR[1,5], E4 CAR[1,5]. Diğerleri keşifsel.
- Alt gruplar (önceden kayıtlı, keşifsel): büyüklük tersilleri, `wave`, **`post_spk_2026` (22.09.2026 SPK 60/1711 kararıyla geri alım toplam tutar üst sınırının geçici kaldırılması sonrası E1; "geri alım dalgası")**, `E2_strong`, E3 hasılat bazlı vs piyasa değeri yedekli önemlilik, seans içi vs seans dışı yayın, kriz rejimi.

### 12.5 LLM kaynaklı özellikler için geçerlilik
- E3/E4 alanlarını çıkaran modelin bilgi kesim tarihinden önceki olaylarda firma adı ve tarih **maskelenir** (Glasserman & Lin). Holdout iddiası yalnızca maskelenmiş çıktılarla yapılır.
- Aynı olaylar için subject-only (LLM'siz) kural sonucu da raporlanır → ablation temeli.

### 12.6 Ön kayıt (pre-registration)
1. `prereg/rules-v1.0.yaml` (§13) + `prereg/analysis-plan.md` (bu bölüm) yazılır.
2. SHA-256 hash audit log'a eklenir, git tag `rules-v1.0-prereg` atılır. **Tarih: W5 (2 Kas 2026) sonu, holdout sorgusundan önce.**
3. Holdout fiyat verisi ayrı şemada (`holdout.*`) tutulur; okuma rolü yalnızca `holdout_runner` servis hesabına verilir, çalıştırma Risk Officer onayı ister ve audit'e yazılır.
4. Holdout **bir kez** çalıştırılır. Sonrasında yapılan her kural değişikliği yeni `rules_version`'dır ve yalnızca ileri dönük paper ile değerlendirilir.
5. Gerçek paraya geçiş ölçütü (tip bazında): holdout'ta birincil pencerede `mean(CAR_net) > 0`, **t ≥ 2,0** (BMP-KP düzeltmeli) ve **n ≥ 30**. `mean(CAR_net) > 0` ama t < 2 → yalnızca paper'da kalır. Ek şartlar (Kanonik R2): ≥ 3 ay ve ≥ 50 paper işlem + gölge aşaması (bkz. `12-kisisel-kullanim-plani.md`).

---

## 13. Parametre tablosu (kod config için tek kaynak)

| Grup | Anahtar | Değer | Kaynak |
|---|---|---|---|
| Risk | `risk_per_trade` | 0,005 | Kanonik |
| Risk | `max_pos` | 0,10 | Kanonik |
| Risk | `max_positions` / `target_positions` | 10 / 8 | Kanonik |
| Risk | `max_adv` | 0,01 | Kanonik |
| Risk | `price_band` | 0,02 | Kanonik |
| Risk | `daily_loss` | −0,01 | Kanonik |
| Risk | `kill_dd` | −0,05 | Kanonik |
| Risk | `edge_cost_mult` | 2,0 | Kanonik |
| Risk | `max_sector` / `max_group` | 0,25 / 0,20 | [K] |
| Evren | `adv20_min_tl` | 50.000.000 | [K] |
| Evren | `free_float_min` / `float_mcap_min_tl` | 0,25 / 1.500.000.000 | [K] |
| Olay | E1 `ratio_10` / `ratio_10_multi` / `n_multi` | 0,0025 / 0,0010 / 3 | Kanonik / [K] |
| Olay | E2 `min_value_tl_2026` (TÜFE endeksli) | 1.000.000 | Araştırma 02 / Kanonik R2 |
| Olay | E3 `materiality_min` / `mcap_materiality_min` (yedek) | 0,10 / 0,05 | Kanonik R2 / [K] |
| Olay | E4 `sue_min`, `cfo_q_min`, `npp_share_max`, `tone_min` | 1,0 / 0,8 / 0,5 / 0,2 | [K] |
| Sızıntı | `leak_window` / `leak_threshold` | 5 / 0,08 | Kanonik |
| Sızıntı | E4 `leak_window_long` / `leak_threshold_long` | 10 / 0,12 | Kanonik R2 |
| Risk | `max_restriction_age_h` / `amount_tol` | 24 / 0,005 | 05 §5.2 / [K] |
| Onay | `approval_expiry` | sonraki seans 09:50 | Kanonik R2 |
| Maliyet | `c_broker_paper` (baz), `c_broker_sensitivity`, `bsmv`, `exch_fee`, `clearing_fee`, `impact_y`, `floor_rt` | 0,0005 / 0,0020 / 0,05 / 0,000025 / 0,0000004 / 0,7 / 0,003 | Kanonik R3 / [V] / [K] |
| Maliyet | `c_broker_personal_max` | 0,0005 | Kanonik R2 |

```yaml
# config/rules-v1.0.yaml  — tek kaynak; değişiklik = yeni sürüm + 4 göz onayı
rules_version: "1.0"
timezone: "Europe/Istanbul"
session:
  opening_collect: ["09:40", "09:55"]
  continuous: ["10:00", "18:00"]
  closing_collect: ["18:00", "18:05"]
  closing_price_trades: ["18:08", "18:10"]
  midday_break: false            # [V] Prosedür §9: sürekli işlem 10:00–18:00 kesintisiz
  daily_limit_pct: {YILDIZ: 0.20, ANA: 0.15, ALT: 0.10, YIP: 0.10, POIP: 0.10}  # [V] §5.1.11; bilinmeyen pazar → 0.10
universe:
  markets: ["YILDIZ", "ANA"]
  adv20_median_min_tl: 50_000_000
  free_float_min: 0.25
  float_mcap_min_tl: 1_500_000_000
  min_listed_sessions: 250
  max_tick_to_price: 0.0025
  restriction_lookback_sessions: 20
  refresh: "MON 08:30"
events:
  E1:
    subject: "Payların Geri Alınmasına İlişkin Bildirim"   # Rev. 3 [V]; eski ad backfill eşlemesinde: "Geri Alınan Paylara İlişkin Bildirim"
    ratio_10: 0.0025
    ratio_10_multi: 0.0010
    n_notices_multi: 3
    lookback_sessions: 10
    exclude_if_sale_within_sessions: 20
    hold: {base: 20, extend: 20, max: 40, extend_if_new_trigger_in_last: 5}
    wave_percentile: 0.90          # ikincil analiz, boyutu değiştirmez
    regime_break_date: "2026-09-22"  # SPK 60/1711: toplam tutar üst sınırı geçici kaldırıldı (fiyat sınırı değil); post_spk_2026 ayrı raporlanır
  E2:
    subjects: ["Pay Alım Satım Bildirimi"]
    roles: ["YK_UYESI", "IDARI_SORUMLU", "ANA_ORTAK"]   # kontrol eden pay sahibi = ANA_ORTAK
    exclude_threshold_filings: true                     # md.12 fon/kurumsal eşik bildirimleri E2 değil
    min_net_value_tl_2026: 1_000_000
    min_value_index: {series: "TUFE", base: "2026-09", point_in_time: true}
    strong: {cluster_days: 30, cluster_min: 2, float_share_min: 0.001, drawdown_60_max: -0.15}
    hold: {base: 20, strong: 60}
    reverse_exit_sell_ratio: 0.5
  E3:
    subjects: ["Yeni İş İlişkisi", "Özel Durum Açıklaması (Genel)", "İhale Süreci / Sonucu"]   # Rev. 3: konu adları gerçek satırlardan teyit edilir
    evidence_status: "exploratory"   # BIST'e özgü olay çalışması yok (Rev. 3)
    materiality_min: 0.10            # yıllıklandırılmış tutar / yıllık hasılat (TTM, point-in-time)
    annualize: true                  # süre yoksa toplam tutar
    fx_source: "TCMB_doviz_alis_karar_tarihi"
    fallback_if_no_revenue: {basis: "market_cap", materiality_min: 0.05}   # [K] kalibre edilecek
    precedent_min_n: 5
    intraday: {min_delay_min: 15, max_move: 0.04}
    next_open_max_gap: 0.04
    hold: 5
  E4:
    classes: ["FR"]
    sue_min: 1.0
    min_quarters: 6
    cfo_quality_min: 0.8
    npp_share_max: 0.5
    tone_min: 0.2
    hold: 5
    tms29_active: true
classifier:
  min_confidence: 0.80
dedup:
  new_event_exclude: ["Düzeltme"]   # "Güncelleme: Evet" yeniden değerlendirilir
prescreen:                          # S0, LLM çağrısından önce
  checks: ["tradeable", "universe", "restrictions", "restricted_securities"]
merge:                              # Birleştirme düğümü (deterministik)
  ratios_by: "code"                 # Önemlilik ajanı yalnızca ham sayı getirir
  amount_cross_check: {method: "regex", tol: 0.005}
leakage:
  window_sessions: 5
  threshold: 0.08
  action: {E1: 0.5, E2: 0.5, E3: "skip", E4: "skip"}
  E4_long: {window_sessions: 10, threshold: 0.12, action: "skip"}
stops:
  E1: {k_atr: 2.5, lo: 0.05, hi: 0.12}
  E2: {k_atr: 2.5, lo: 0.05, hi: 0.12}
  E3: {k_atr: 2.0, lo: 0.04, hi: 0.06}
  E4: {k_atr: 2.0, lo: 0.04, hi: 0.08}
  atr_window: 20
  basis: "close"
  breakeven_at_r: 2.0
sizing:
  risk_per_trade: 0.005
  m_evidence: {E1: 1.0, E2: 1.0, E3: 0.5, E4: 0.7}
  min_notional_abs_tl: 2_000
  min_notional_pct: 0.01
portfolio:
  max_positions: 10
  target_positions: 8
  max_pos: 0.10
  max_sector: 0.25
  max_group: 0.20
  gross_max: 1.00
  gross_crisis: 0.50
  cash_buffer: 0.05
  max_entries_day: 3
  max_entries_crisis: 1
  cooldown_sessions_after_stop: 10
  max_adv: 0.01
costs:
  c_broker: 0.0005               # baz senaryo (Rev. 3); kişisel modda gerçek sözleşme oranı ile ezilir
  c_broker_sensitivity: 0.0020   # duyarlılık senaryosu (banka tipi kurum), ayrı raporlanır
  c_broker_personal_max: 0.0005  # üstündeyse kişisel mod açılmaz
  bsmv: 0.05                     # komisyon üzerinden (banka kurumları); komisyon 0 ise etkisiz
  price_series: {fills_and_r09: "raw_HG_KAPANIS", returns: "adjusted_HGDG_KAPANIS"}
  exchange_fee: 0.000025
  clearing_fee: 0.0000004
  spread_estimator: "corwin_schultz_20d_median"
  impact_y: 0.7
  manual_slippage: 0.0005        # yalnızca personal
  floor_round_trip: 0.003
edge:
  shrink_k: 20
  haircut: 0.5
  cost_multiple: 2.0
regime:
  sma_window: 50
  rv_window: 20
  rv_percentile: 0.80
  rv_lookback: 756
  index_crash: -0.05
  breaker_lookback_sessions: 5
  exit_confirm_sessions: 5
  size_mult: 0.5
  block_types: ["E3"]
risk_gate:
  order: [R01, R02, R03, R04, R13, R11, R14, R05, R06, R09, R12, R07, R08, R10, R15]
  at_send: [R01, R02, R03, R04, R09, R12, R13]   # R16
  price_band: 0.02
  near_limit: 0.01
  max_price_age_min: 20
  daily_loss: -0.01
  kill_dd: -0.05
  min_precedents: 5
  max_kap_lag_s: 300
  max_restriction_age_h: 24
  amount_tol: 0.005
  ticket_ttl_min: 30             # R16, yalnızca personal
approval:
  auto_execute: false            # otomatik yürütme yok (backtest hariç: simüle)
  expires_at: "next_session 09:50"
  backtest_mode: "simulated_approve_all"
  escalate_if_positions_gte: 8
kill_switch:
  trigger_roles: ["admin", "risk_officer"]
  on_trigger: {cancel_open_orders: true, liquidate_positions: false}
  reset_roles: ["admin", "risk_officer"]
  personal_min_cooldown_sessions: 5
  personal_confirm_gap_hours: 24
  post_reset_size_mult: 0.5
  post_reset_recover_to_dd: -0.025
  post_reset_extra_dd: -0.03
class_suspension:
  window_trades: 30
  t_max: -1.0
event_study:
  estimation: [-250, -30]
  min_obs: 120
  windows: [[1, 1], [1, 5], [1, 20], [1, 60]]
  leak_window: [-5, -1]
  primary: {E1: [1, 20], E2: [1, 20], E3: [1, 5], E4: [1, 5]}
  splits: {dev: ["2018-01-01", "2022-12-31"], val: ["2023-01-01", "2024-12-31"], holdout: ["2025-01-01", "2026-10-31"]}
  holdout_runs_max: 1
  subgroups: ["size_tercile", "wave", "post_spk_2026", "E2_strong", "E3_fallback_mcap", "intraday_pub", "crisis"]
  go_live: {t_min: 2.0, n_min: 30, paper_months_min: 3, paper_trades_min: 50}
  multiple_testing: "holm"
  bootstrap_reps: 5000
```

---

## 14. Açık doğrulama listesi

| # | Konu | Nasıl | Sahibi | Hafta |
|---|---|---|---|---|
| 1 | Gün ortası tek fiyat seansı var mı, 2026 seans saatleri | BIST Pay Piyasası Prosedürü | Rol 3 | W1 |
| 2 | ±%10 marj ve fiyat adımı tablosu | BIST prosedürü | Rol 3 | W1 |
| 3 | VBTS kademe süreleri ve duyuru zamanı (seans sonu → ertesi gün?) | BIST VBTS sayfası + 20 örnek DKB bildirimi | Rol 1 | W3 |
| 4 | E1/E2 KAP form alan adları | 50 gerçek bildirim | Rol 1 | W3 |
| 5 | md.11 bildirim gecikme dağılımı (işlem → yayın) | Backfill | Rol 3 | W5 |
| 6 | XU100 getiri endeksi verisi | isyatirimhisse / BIST | Rol 1 | W3 |
| 7 | TMS 29'un 2026 yıl sonu tablolarında sürüp sürmediği | KGK / SPK duyuruları | Rol 3 | Ara |
| 8 | Evren büyüklüğü ve eşiklerin 2018 TL'sine göre ayarı (sabit TL eşikler enflasyonla kayar) | Backtest'te eşikleri TÜFE ile geriye deflate et | Rol 3 | W3 |

---

## 15. Önerilen değişiklikler — durum (Revizyon 2)

- **Ö1 — E4 sızıntı penceresi (10 seans / %12):** ✅ Kabul edildi ve uygulandı (§4 `LEAKAGE_E4_10D`, YAML `leakage.E4_long`).
- **Ö2 — E1 rejim değişikliği / dalga alt grubu:** ✅ Kabul edildi ve uygulandı (§3.1 `wave` + `post_spk_2026`, §12.4). ⏳ Açık: holdout sonrası `m_wave = 0,5` çarpanı — yalnızca yeni `rules_version` ile, ileri dönük paper'da değerlendirilir.
- **Ö3 — E2 TL eşiğinin enflasyonla güncellenmesi:** ✅ Kabul edildi ve uygulandı (§3.2 TÜFE endeksli `min_value_TL`). ❌ Alternatif "piyasa değerinin %0,01'i" eşiği reddedildi: kanon TÜFE güncellemesini seçti, iki eşik ön kaydı karmaşıklaştırır.
- **Ö4 — Geçiş ölçütü (t ≥ 2, n ≥ 30):** ✅ Kabul edildi ve uygulandı (§12.6/5; ek olarak ≥3 ay / ≥50 paper işlem).
- **Ö5 — Kapanış bazlı ATR stopu:** ✅ Kabul edildi ve uygulandı (§6.1).
- **Ö6 — Kill switch, tek kişilik mod (24 sa + 5 seans):** ✅ Kabul edildi ve uygulandı (§11).
- **Ö7 (yeni, Revizyon 2 kaynaklı) — E3 yedek eşiği:** Kanon "tutar / piyasa değeri" yedeğini belirledi ama eşik vermedi; bu belge `%5` [K] kullanıyor. ⏳ Açık: geliştirme verisinde kalibre edilip ön kayıttan (W5) önce sabitlenecek.
