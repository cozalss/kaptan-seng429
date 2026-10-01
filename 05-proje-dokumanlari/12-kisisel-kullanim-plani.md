# 12 — Kişisel Kullanım Planı (kendi param, kendi hesabım)

- Hazırlanma: 29.09.2026 · Revizyon 2 uyumu: 30.09.2026 · Revizyon 3 uyumu: 30.09.2026 · Bağlayıcı kaynaklar: `_KANONIK-KARARLAR.md` (Kişisel para planı; **REVİZYON 3 bölümü Revizyon 2'ye, Revizyon 2 orijinal kararlara üstündür**), `06-strateji-ve-kurallar.md` (kurallar, parametreler, risk kapısı R01–R16 — tek kaynak)
- Etiketler: **[V]** birincil kaynak · **[S]** ikincil kaynak · **[U]** doğrulanmadı · **[K]** kendi kararım
- **Bu bir yatırım tavsiyesi değildir.** Yalnızca benim, kendi hesabımda, kendi kararımla uygulayacağım bir disiplin belgesidir. Kimseyle sinyal paylaşılmaz.

---

## 0. Tek paragrafta

KAPtan bana **emir fişi** üretir; ben fişi okurum, onaylarsam aracı kurum uygulamama **elle** girerim. Sistem otomatik emir göndermez (her öneri insan onayına gider; onay bir sonraki seansın 09:50'sinde düşer). Gerçek paraya ancak (1) kendi olay çalışmam holdout'ta (2025-01-01 → 2026-10-31) maliyet sonrası pozitif ve anlamlı çıkarsa (**t ≥ 2, n ≥ 30**), (2) en az 3 ay ve 50 kapanmış paper işlem kurallar değiştirilmeden tamamlanırsa, (3) ardından **gölge aşaması** (fiş üretilir, gerçek para yok) başarıyla biterse geçerim; gerçekçi başlangıç **Nisan–Haziran 2027**. Beklentim BIST-100'e göre yılda **0 ile +%5** arası; maliyet sonrası kalıcı pozitif anormal getiri olasılığını kabaca **%20–35** görüyorum (Revizyon 3); **sıfır veya negatif de olabilir** ve bu da geçerli bir sonuçtur. Asıl kazanç, ölçülebilir ve denetlenebilir bir süreç kurmaktır.

---

## 1. Aşamalar ve geç/kal ölçütleri

| Aşama | Zaman | Ne yapılır | Geç (go) ölçütleri — hepsi | Kal / geri dön (no-go) |
|---|---|---|---|---|
| **0. Kanıt** | Eki–Kas 2026 (W3–W6) | KAP arşivi 2018–2026, `06` §12 olay çalışması; kurallar W5 sonunda ön kayıtlı (`rules-v1.0-prereg`); holdout **yalnızca bir kez** koşulur | E1–E4'ten **en az bir tipte** holdout (**2025-01-01 → 2026-10-31**) birincil pencerede `mean(CAR_net) > 0`, **t ≥ 2,0**, **n ≥ 30** (kanonik) | Hiçbir tip geçmezse: **gerçek paraya hiç geçilmez.** Proje ders projesi olarak devam eder; kişisel parayla endeks fonu planına dönülür |
| **1. Paper** | 9 Kas 2026 → en az 3 ay | Dondurulmuş `v1.0-fwd` / `v1.1-fwd` ile SimBIST; **yalnızca Aşama 0'ı geçen tipler** paper'da kişisel profilde işlenir | (a) ≥ **50 kapanmış işlem** ve ≥ 3 ay (kanonik); (b) net getiri ≥ BIST-100 getirisi − 2 puan (aynı dönem, TL); (c) maks. düşüş ≤ %10; (d) kurallar dönem boyunca değiştirilmedi; (e) kill switch bir yazılım hatası yüzünden tetiklenmedi | (b) veya (c) sağlanmazsa paper 3 ay uzar; iki uzatmada da sağlanmazsa Aşama 0 sonucu "gerçek dünyada tutmadı" sayılır → dur |
| **2. Gölge** (kanonik) | Aşama 1'den sonra, en az 4 hafta | Sistem kişisel modda (3 anahtar açık) **gerçek emir fişi üretir, gerçek para kullanılmaz**; fişler kaydedilir; her fiş için aracı kurum uygulamasında o anda göreceğim fiyatı ve "girseydim dolar mıydı" bilgisini not ederim | (a) ≥ 4 hafta ve ≥ 10 fiş; (b) kaçırılan fiş oranı (benim yüzümden) ≤ %10; (c) gölge kayma ≤ modeldeki `manual_slippage + half_spread`; (d) seçilen aracı kurumun komisyonu **≤ %0,05 / taraf** sözleşmeyle teyit edildi; (e) sabah rutini 09:50 onay süresine sığıyor | (b) veya (c) sağlanmazsa gölge 4 hafta uzar; komisyon şartı sağlanmazsa gerçek paraya geçilmez |
| **3. Küçük gerçek para** | Gerçekçi başlangıç **Nisan–Haziran 2027** (kanonik; yılda 40–100 işlem beklentisiyle 50 paper işlem 5–7 ay sürebilir) | Ayrı hesapta küçük tutar (§4); emir fişi + manuel giriş; kaldıraç/VİOP/kredi yok | ≥ 3 ay ve ≥ 20 gerçek işlem; işlem başına ortalama net getiri paper ortalamasından en fazla 0,3 puan düşük; kural dışı müdahale (override) sayısı **0**; maks. düşüş ≤ %5 veya kill tetiklendiyse prosedür eksiksiz uygulandı | Override > 2/ay → Aşama 1'e dön. 6 ayda 2 kill → Aşama 1'e dön |
| **4. Kademeli büyütme** | Aşama 3'te 3+ ay tutarlıysa | Sermaye çeyrek başına **en fazla ×1,5**; üst sınır §4'teki pay | Her büyütmeden önce son 3 ayın alfa işareti ≥ 0 ve maliyet raporu model içinde | Rolling 30 işlemlik alfa < 0 ve t < −1 → bir önceki tutara dön; ikinci kez → Aşama 1 |

**Kanonik plan ile ilişki (Revizyon 2):** Aşama sırası (0 Kanıt → 1 Paper → 2 Gölge → 3 Küçük gerçek para → 4 Büyütme), 3 ay / 50 işlem, holdout t ≥ 2 ve n ≥ 30, Nisan–Haziran 2027 başlangıcı, komisyon ≤ %0,05 / taraf ve tamamen durma koşulları (§9) kanoniktir. Ek olarak eklediğim sayısal eşikler (−2 puan, paper'da %10 DD, gölgede ≥ 4 hafta / ≥ 10 fiş, gerçek parada override = 0) kendi kararımdır [K].

---

## 2. Emir fişi nasıl görünür

Fiş, risk kapısından (`06` R01–R15) geçmiş, benim "Risk Officer" rolümle onayladığım ve gönderim anı kontrolünden (R16) geçen bir önerinin **uygulamaya kopyalanacak** halidir. Otomatik yürütme yoktur: onaylamadığım öneri **bir sonraki seansın 09:50'sinde** düşer. Fiş üretildikten sonra 30 dakika (TTL) veya ilgili seans sonunda (hangisi önceyse) geçersiz olur; açılış seansı öncesi üretilen fişte 30 dakika açılış emir toplamanın başladığı 09:40'tan sayılır (yani en geç 09:55).

```
══════════════════════ KAPtan EMİR FİŞİ ══════════════════════
Fiş No        : T-2027-0412-003          Kurallar: rules-v1.0 / fwd
Onay         : 12.04.2027 08:51 (süre sınırı 09:50)
Oluşturma     : 12.04.2027 08:52:10      Geçerlilik: 12.04.2027 09:55 (açılış seansı sonu)
Mod           : KİŞİSEL (3 anahtar: config ✓ env ✓ UI ✓)

İŞLEM         : AL        Sembol: ABCDE (Ana Pazar)
Emir tipi     : LİMİT     Seans: AÇILIŞ SEANSI (09:40–09:55)   Süre: GÜNLÜK
Adet (lot)    : 68
Limit fiyat   : 42,34 TL   (ref 41,51 × 1,02; tavan 45,66 — uzak ✓)
Tahmini tutar : 2.879 TL   (hesap değeri 50.000 TL → %5,8; tavan %10)

Olay          : E1 — Pay geri alım işlemleri
KAP           : idx 1623456, 11.04.2027 19:42 "Payların Geri Alınmasına İlişkin Bildirim"
Önemlilik     : Son 10 seansta 4 bildirim, sermayenin %0,31'i (eşik %0,25) ✓
Sızıntı       : CAR[-5,-1] = +%1,9 (eşik %8) ✓
Kanıt kartı   : Benzer 64 olay · ort. CAR[1,20] +%1,8 · medyan +%1,1 · isabet %58
                Firma geçmişi: 3 olay, ort. +%2,6 → küçültülmüş tahmin +%1,86 → ×0,5 = +%0,93
Maliyet (g-d) : %0,33  (kom. %0,02×1,05×2 + borsa/takas + yarı-spread %0,09×2 + etki + manuel kayma)
Avantaj/Maliyet: %0,93 / %0,33 = 2,8× (eşik 2,0) ✓
Şüpheci notu  : "Program 3. ayında; ana ortak satışı yok; geri alım dalgası: HAYIR"
Alt grup      : SPK 22.09.2026 (60/1711) toplam tutar sınırı kaldırılması sonrası E1 (post_spk_2026) — holdout'ta ayrı raporlandı
Tutar kontrolü: Okuyucu nominali bildirim metnindeki regex tutarlarıyla eşleşti (R14) ✓

RİSK          : Stop (kapanış bazlı) 38,65 TL (−%8,7 = 2,5×ATR20)  · Risk 68×3,69 ≈ 251 TL (%0,5)
Planlanan çıkış: 20. seans kapanışı → 12.05.2027 (yeni E1 gelirse maks. 40 seans)
Kapı sonuçları: R01✓ R02✓ R03✓ R04✓ R13✓ R11✓ R14✓ R05✓ R06✓ R09✓ R12✓ R07✓ R08✓ R10✓(rejim normal)
                R15: onay seviyesi NORMAL · R16 (gönderim anı) ✓

GERİ BİLDİRİM (girişten sonra doldur):
  Gerçekleşen adet: ______  Ortalama fiyat: ______  Saat: ______
  Durum: [ ] Doldu  [ ] Kısmi  [ ] Dolmadı (fiyat kovalamak YASAK)
Audit hash    : 9f3c…e71a (önceki: 44b0…19c2)
═══════════════════════════════════════════════════════════════
```

Çıkış fişi örneği (kısa):
```
Fiş No T-2027-0512-001 · SAT · ABCDE · 68 lot · KAPANIŞ SEANSI (18:00–18:05) · LİMİT 0 = kapanış fiyatından
Sebep: X1 zaman çıkışı (20. seans) · Giriş 42,10 → son 44,02 (+%4,6; XU100 +%1,2)
```
Stop çıkışında (X2) emir **ertesi günün açılış seansına** taban fiyat limitli verilir (çıkış önceliği).

---

## 3. Aracı kurum ve uygulama

**Karar:** SPK lisanslı bir aracı kurumda **ayrı** bir hesap, emirler **mobil/web uygulamadan elle**. Otomasyon yok.

| Seçenek | Durum | Karar |
|---|---|---|
| Elle giriş (herhangi bir lisanslı aracı kurum) | Strateji 5–60 gün tutuyor, hız gerekmiyor; son onay zaten bende | **Seçildi** |
| Deniz Yatırım **Algolab** API | 31.12.2025'te kapandı [V] ([AlgoLab README](https://github.com/atillayurtseven/AlgoLab)) | Mümkün değil |
| **Matriks IQ DEK** (Dışarıdan Emir Kabulü) | Çalışır ama IQ + ALGO + DEK ≈ 5.000+ TL/ay (2025 fiyatları), sürekli açık Windows terminali [V] ([Aktifbank ücret listesi](https://www.aktifbank.com.tr/uploads/20250509104629568.pdf), [DEK API](https://www.matriksdata.com/website/uploads/0_matriksiq-disaridanemirkabuluapi.pdf)) | **Sonra, belki hiç:** yalnızca `beklenen_alfa × sermaye ≥ 3 × yıllık DEK maliyeti` ise. %2 alfa ve ~65.000 TL/yıl maliyetle bu **≈ 10 milyon TL** sermaye demek → öğrenci ölçeğinde anlamsız |
| TradeWize (REST/MCP) | Eylül 2026'da yeni; entegre kurumlar belirsiz [S] | 2027'de yalnızca deneme |
| Kripto (BtcTurk vb.) | Yavaş sistem için kanıt yok, kripto haberinde botlar önde; BtcTurk 2024 ve 2025'te hacklendi; vergi rejimi belirsiz [S] | **Hayır** |
| VİOP / kaldıraç / kredili işlem / açığa satış | Strateji yalnızca long; kaldıraç kill switch mantığını bozar | **Hayır** |

**Aracı kurum seçim ölçütleri (sırayla):**
1. **Komisyon ≤ %0,05 taraf başına (onbinde 5; kanonik sert şart, `06` `c_broker_personal_max`), tercihen ≤ %0,03.** **Revizyon 3:** **Midas ve Enpara Yatırım'da BIST komisyonu %0** [V/ikincil] → bu şart karşılanabilir; banka aracı kurumları binde ~1,9–2 (+ komisyon üzerinden %5 BSMV) [V]. Banka tipi binde 2 (~%0,20) komisyonla gidiş-dönüş maliyet tek başına ~%0,42 olur [S] ([hisse.net 2026](https://www.hisse.net/haber/bankalarin-borsa-istanbul-da-bakim-ve-komisyon-ucretleri-2026-48274)); bu, E1/E2'nin beklenen avantajının yarısından fazlasını yer ve R06'yı çoğu işlemde düşürür. Liste tarifesi değil, **sözleşmedeki pazarlıklı oran** önemlidir; birçok kurum düşük oranı hacme bağlar.
2. Hesap bakım / saklama ücreti düşük (küçük hesapta sabit ücretler yüzdesel olarak büyür).
3. Uygulamada **açılış seansına limit emir** ve **kapanış seansı emri** verilebilmesi; tercihen **koşullu (stop) emir** desteği [U — kuruma göre değişir].
4. Ayrı alt hesap açılabilmesi ve hesap ekstresinin CSV/PDF indirilebilmesi.
5. İki aşamalı doğrulama.

Sıfır komisyonlu kurumlar (Midas [S] ([ücretler](https://www.getmidas.com/ucretler/)), Enpara Yatırım [V/ikincil]) maliyet açısından cazip ve komisyon şartını karşılıyor; kapanış seansı ve koşullu emir desteği, hesap bakım ücreti ve sözleşmedeki fiili oran ayrıca kontrol edilmeli [U]. Komisyon %0 olsa da asıl maliyet alış-satış farkı ve piyasa etkisidir (model bunları `half_spread` + `impact` + `manual_slippage` olarak ayrıca düşer). Komisyon oranı `config/personal.yaml` içinde `c_broker` olarak gerçek değerle girilir; SimBIST baz senaryosu (%0,05 / taraf) veya duyarlılık senaryosu (%0,20 / taraf) değil.

---

## 4. Hesap kurulumu ve tutar

- **Ayrı hesap:** Mevcut uzun vadeli portföyümden (bkz. `Desktop\Yatirim-Notlari`) tamamen ayrı; tercihen ayrı aracı kurum. Sistem yalnızca bu hesabın bakiyesini "equity" sayar.
- **Kapalı olacaklar:** kredili işlem sözleşmesi imzalanmaz; açığa satış, VİOP, varant/sertifika, yurt dışı hisse yetkisi açılmaz.
- **Tutar kuralı [K]:**
  - Tamamen kaybedilse hayatımı, okulumu ve acil durum fonumu etkilemeyecek tutar.
  - **Likit birikimimin %10'unu aşmaz**; ana birikim bu hesapta olmaz (kanonik).
  - Aşama 3 (küçük gerçek para) başlangıcı: **25.000–50.000 TL** bandı. Alt sınır gerekçesi: 50.000 TL'de işlem başı risk 250 TL, pozisyon ≤ 5.000 TL; komisyon asgari ücretleri (ör. işlem başı 1 TL) ve lot yuvarlaması anlamsız hale gelmez. 25.000 TL altında `min_notional` ve lot yuvarlaması boyutlamayı bozar.
  - Aşama 4'te çeyrek başına ×1,5'ten hızlı büyütme yok.
- **Para girişi/çıkışı:** Ay içinde para ekleme/çekme yapılmaz; yapılırsa sistem "equity" ve zirve değerini nakit akışına göre düzeltir (aksi halde kill switch yanlış tetiklenir).

---

## 5. Günlük ve haftalık rutin

| Ne zaman | Süre | İş |
|---|---|---|
| İş günü **08:45–09:35** | 10–15 dk | Sabah KAP özeti; gece gelen E1/E2/E4 önerilerini oku; "Neden bu işlem?" ekranında kanıt kartı ve şüpheci notuna bak; onayla/reddet (ret gerekçesi yazılır). **09:50'ye kadar onaylanmayan öneri düşer** (gölge sinyal olarak izlenir). Onaylananların fişlerini **09:40–09:55** arasında uygulamaya limit emir olarak gir |
| Seans içi | 0 dk (hedef) | E3 seans içi fişleri yalnızca müsaitsem; derste/sınavdaysam fiş kaçar ve "missed" kaydedilir. **Kovalamak yok.** Fiyat bildirimleri kapalı |
| İş günü **18:15–18:30** | 10 dk | Gerçekleşen dolumları sisteme gir (fiyat, adet, saat); X1–X6 çıkış kontrolünün ürettiği satış fişlerini ertesi sabah için sıraya al; N1 uyarıları |
| **Cumartesi** | 30–45 dk | Aracı kurum ekstresi ↔ sistem defteri mutabakatı; haftalık metrikler (açık risk, maruziyet, kayma, override sayısı); günlük: "kurallara uydum mu?" |
| **Ayın ilk hafta sonu** | 1 saat | Aylık rapor: getiri vs BIST-100 (TL ve USD), maliyet/kayma raporu, vergi defteri dışa aktarımı, aşama ölçütleri kontrolü |

Toplam: haftada **~2–2,5 saat**. Haftada 5 saati geçerse sistem amacını kaybetmiştir (§9).
Pazartesi 13:20–16:10 ders saatinde işlem yapılmaz; zaten strateji buna ihtiyaç duymaz.

---

## 6. Kayıt tutma ve vergi

**Kayıt (sistem otomatik + ben):**
- Her fiş, onay/ret gerekçesi, gerçekleşen dolum, komisyon ve BSMV tutarları hash zincirli audit log'da.
- Aylık aracı kurum ekstresi PDF + CSV olarak `personal/ekstreler/YYYY-MM/` altında; **en az 5 yıl** saklanır (VUK zamanaşımı süresine uyum için pratik kural [S]).
- `personal/journal.md`: her override, her kural dışı düşünce, her kill switch olayı.

**Vergi (gerçek kişi, BIST payları, 2026):**
| Gelir | Durum | Etiket |
|---|---|---|
| BIST'te işlem gören pay alım-satım kazancı | GVK geçici 67 kapsamında **%0 stopaj**, beyanname gerekmez. Zarar mahsubu gerekmez | [S] [PwC 2026](https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html), [Midas vergi](https://www.getmidas.com/destek/borsa-istanbul/bist-piyasa-bilgileri/borsa-istanbul-uzerinden-islemlerim-icin-ne-kadar-vergi-odemem-gerekiyor) |
| Yatırım ortaklığı (MKYO/GYO) payları | Farklı oran/elde tutma şartı olabilir | **[U]** — ilk gerçek işlemden önce kontrol; gerekirse evrenden çıkar |
| Temettü | Şirket **%15 stopaj** keser; brüt temettünün yarısı istisna; kalan tutar yıllık beyan sınırını (2026 gelirleri için 400.000 TL [S]) aşarsa beyan | [S] [VergiAlgı](https://vergialgi.com/temettu-kar-payi-gelirinde-vergi-durumu-2025-2026) |
| Yurt dışı hisse, kripto | Bu planın dışında; beyan yükümlülüğü ağır / belirsiz | Kapsam dışı |

Not: Sık işlem yapan bireyin pay kazancının "ticari kazanç" sayılma riski bu ölçekte düşük görünüyor ama doğrulanmadı **[U]**. Aşama 4'te tutar büyürse bir mali müşavire sorulacak. Ekstreler ve audit log her iki durumda da yeterli belge sağlar.

---

## 7. Hukuki: yapılacaklar ve yapılmayacaklar

**Yapılmayacaklar**
1. **Sinyal paylaşmak yok.** Fişler, kanıt kartları, "bu hisse iyi" yorumları arkadaşlara, aileye, Telegram/X/WhatsApp gruplarına, ekip üyelerine **gönderilmez**. Düzenli olarak başkalarına al-sat yönlendirmesi izinsiz yatırım danışmanlığı sayılabilir (SPKn md.39 izin şartı; md.109/2: 2–5 yıl hapis ve 5.000–10.000 gün adli para cezası) [S] ([SPK izinsiz faaliyetler](https://spk.gov.tr/yatirimcilar/izinsiz-sermaye-piyasasi-faaliyetleri), [mevzuat 6362](https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6362&MevzuatTur=1&MevzuatTertip=5)). SPK 2024'te Telegram/X'te hedef fiyat veren **154 kişi** hakkında işlem yaptı [S] ([HaberGo](https://www.habergo.com.tr/haber/borsada-manipulasyon-turleri-ve-spk-cezalari-suni-fiyat-yalanci-emir-ve-pump-dump-nasil-tespit-ediliyor)); Eylül 2026'da sosyal medya manipülasyonuna gözaltılar oldu [S].
2. **Para havuzu yok.** Başkasının parasını almak, "ortak hesap" açmak, "sen de koy, sistem yönetsin" demek yok (SPKn md.109 izinsiz faaliyet / halktan para toplama riski). Ekip arkadaşları kodu kendi paper'larında çalıştırabilir; gerçek parayla kullanım kendi kararları ve kendi kurulumlarıdır, benden sinyal almazlar.
3. **Hesap kullandırmak yok.** Başkasının hesabında işlem yapmam, kendi hesabımı kimseye açmam.
4. **İçsel bilgi yok (SPKn md.106).** Benim, bir ekip üyesinin veya yakınımın/tanıdığımın çalıştığı ya da kamuya açıklanmamış bir şey duyduğum şirketin sembolü **ekip içeriden-öğrenen engel listesine** (`restricted_securities`) eklenir; sistem bu sembolde alım önerisi üretmez (`06` R13).
5. **Pozisyonlarımı sosyal medyada paylaşmam**, özellikle küçük şirketlerde (SPKn md.107/2 bilgi bazlı piyasa dolandırıcılığı riski).
6. Final sunumunda ve raporlarda **canlı sinyal gösterilmez**: demo paper'dır; gerçek sembol içeren ileri dönük sonuçlar en az 30 gün gecikmeli ve toplu (sembol bazında değil) sunulur. Repo'da açık feragatname.

**Yapılacaklar**
- Yalnızca SPK lisanslı aracı kurum.
- Her yıl vergi durumunu ve komisyon sözleşmesini kontrol et.
- Mevzuat değişirse (ör. KAP erişim şartları, SPK tedbirleri) sistemi durdur, değerlendir.

Hukuki yorumlar avukat tarafından doğrulanmamıştır **[U]**.

---

## 8. Psikolojik kurallar

1. **Sistemi ezmem.** İzinli tek müdahale: fişi **atlamak**, yalnızca şu sebeplerle: teknik hata, fişte açık bir veri hatası, kişisel likidite ihtiyacı. Her atlama `journal.md`'ye yazılır. "İçimden gelmedi" geçerli sebep değildir.
2. **Sistemin üretmediği işlem yok.** Bu hesapta "fırsat gördüm" alımı yapılmaz.
3. **Maliyet düşürme (ortalama düşürme) yok, piramit yok, stop genişletme yok.** Stop yalnızca yukarı (X6).
4. **İntikam işlemi yok.** Kill switch (zirveden −%5) açık emirlerimi iptal eder ama pozisyonlarımı satmaz; pozisyonlar kendi çıkış kurallarıyla kapanır. **Kişisel modda reset:** Admin ve Risk Officer onaylarını ben veririm, bu yüzden iki onay arasında **en az 24 saat** ve her onayda ayrı yazılı gerekçe; ayrıca tetikten itibaren **en az 5 seans** bekleme zorunlu (`06` §11). Günlük −%1 durdurmasından sonra o gün uygulamayı açmam.
5. **Fiyat kovalamak yok.** Açılışta dolmayan emir tekrar girilmez.
6. **Gün içi fiyat izlemem.** Bildirimler kapalı; rutin dışı uygulama açılışı haftalık "kaç kez baktım" metriğine yazılır.
7. **Kural değişikliği yalnızca yeni sürümle.** Kaybeden bir işlemden sonra parametre değiştirmek yasak; değişiklik önerisi yazılır, bir sonraki sürümde ön kayıtla paper'da test edilir.
8. **Aylık override incelemesi:** Override > 2/ay → Aşama 1'e (paper) dönüş.
9. Taahhüt: Bu belgeyi Aşama 3 (küçük gerçek para) başında imzalayıp tarih atarım; her ay ilk hafta sonu yeniden okurum.

---

## 9. Tamamen durma koşulları

Aşağıdakilerden **herhangi biri** → gerçek parayla işlem biter, bakiye endeks fonuna/nakde döner, sistem yalnızca ders/paper için kalır:

1. Aşama 0'da hiçbir olay tipi holdout ölçütünü geçmez.
2. Gerçek hesapta **zirveden %-10** düşüş (kanonik; kill switch'in iki katı — kurallar çalışıyorsa buraya gelinmemeli).
3. 6 ay içinde **2. kill switch** ve ardından Aşama 1'de de ölçütler sağlanmaz.
4. **12 ay** gerçek para sonunda **BIST-100'ü geçememe** (kanonik; maliyet sonrası alfa ≤ 0).
5. Yapısal değişiklik: KAP erişimi kapanır, SPK kuralları stratejiyi geçersiz kılar (ör. geri alım/yönetici bildirim rejimi), maliyetler R06'yı sistematik olarak düşürür.
6. Haftada 5 saatten fazla zaman alır veya uyku/okul/ruh hâlimi etkiler.
7. Sınav dönemleri ve bitirme projesi teslim haftaları: **geçici** duraklama (yeni giriş yok, açık pozisyonlar kurallara göre kapanır).

---

## 10. Dürüst beklentiler

- **Beklenti:** BIST-100'e göre yılda **0 ile +%5** alfa; geniş güven aralığı; **sıfır veya negatif olabilir** (kanonik). Maliyet sonrası kalıcı pozitif anormal getiri olasılığı kabaca **%20–35** (Revizyon 3); yani en olası tek sonuç "anlamlı avantaj yok"tur ve bu da geçerli bir bulgudur. Literatür: en iyi gruplarda işlem başına maliyet öncesi +%0,5–2; yayımlanan anomaliler yayından sonra ortalama %58 zayıflıyor (McLean & Pontiff 2016) → literatür rakamları üst sınırdır; LLM tabanlı haber sinyallerinin Sharpe'ı her yıl kabaca yarıya indi (Lopez-Lira & Tang).
- **Kanıt kısıtları (Revizyon 3):** E1'in dayandığı **Ünal (2022)** (BIST-100, 2015–2020, 711 geri alım; XU100'e göre 1 ayda +%2,0, 3 ayda +%3,4) getirileri **işlem tarihinden** ölçer (bildirim tarihinden değil; benim girebileceğim an bildirimden sonradır), **maliyet içermez**, basit t-testi kullanır ve 2021 öncesi rejimdendir; yönetici alımlarında örneklem yalnızca **n = 89**. Bu yüzden "~+%1,5–2" rakamı benim için ulaşılabilir getiri değil, iyimser bir üst sınırdır. Ersan vd. (2021) basit bilginin BIST'te **saniyeler içinde** fiyatlandığını gösterir → yavaş (günlük, elle girilen) sistemim ancak karmaşık/yavaş fiyatlanan bilgide şans bulabilir. E3 (yeni iş/ihale) için BIST'e özgü çalışma yok; E3 keşifseldir.
- **SPK 22.09.2026 kararı (60/1711):** kaldırılan, geri alımlardaki **toplam tutar üst sınırıdır** (fiyat sınırı değil) ve **geçicidir**; sonraki hafta 60 şirket ~1,99 milyar TL geri alım yaptı. "Piyasa destekleme" amaçlı geri alımlar E1 sinyalinin bilgi değerini seyreltebilir → `post_spk_2026` alt grubunu ayrı izlerim; bu dönemde gelen E1 fişlerine ekstra iyimserlik yüklemem.
- **TL ölçeğinde:** 50.000 TL hesapta +%3 alfa = yılda **1.500 TL**. Haftada 2 saat × 52 = 104 saat → saat başına ~15 TL. Para kazanma aracı olarak değil, **öğrenme ve süreç** aracı olarak değerlidir.
- **Mutlak getiri:** Toplam getirinin büyük kısmı piyasadan (BIST-100) gelir; enflasyon ve TL değer kaybı nedeniyle sonuçlar hem TL hem USD bazında raporlanır. Kötü bir piyasa yılında "alfa pozitif" olup para kaybetmek mümkündür.
- **İstatistik:** 50 işlemle anlamlı alfa kanıtlamak çok zor. Paper ve ilk gerçek dönem sonuçları **işaret ve süreç** metrikleriyle (kurallara uyum, kayma, kaçırılan fiş) değerlendirilir, "kanıtlandı" denmez.
- **Karşılaştırma ölçütü:** Aynı parayı düşük maliyetli bir BIST-100 endeks fonunda tutmak. Sistem 12 ayda bunu maliyet sonrası geçemezse (§9/4) endeks fonu kazanır.
- **En olası iyi sonuç:** Küçük, pozitif ama anlamsız bir alfa; iyi belgelenmiş bir sistem; ders projesi için güçlü bir "ölçtük" hikâyesi.

---

## 11. Önerilen değişiklikler — durum (Revizyon 2)

- **K1 — Gerçek para başlangıcı Nisan–Haziran 2027:** ✅ Kabul edildi ve uygulandı (§1 Aşama 3). ❌ "Şubat 2027 en erken tarih olarak kalsın" kısmı reddedildi: araya gölge aşaması girdiği için Şubat artık gerçekçi değil.
- **K2 — Sayısal geç/kal ölçütleri:** ✅ Holdout t ≥ 2 ve n ≥ 30 kabul edildi ve uygulandı (kanonik). ⏳ Açık: paper'da BIST-100 − 2 puan, maks. DD ≤ %10 ve gerçek parada override = 0 kanona girmedi; kişisel [K] kurallar olarak kalıyor.
- **K3 — Komisyon ≤ %0,05 / taraf:** ✅ Kabul edildi ve uygulandı (§3, gölge aşaması şartı (d); `06` §8.1).
- **K4 — Tek kişilik kill switch reset (24 sa + 5 seans):** ✅ Kabul edildi ve uygulandı (§8/4, `06` §11).
- **K5 — Tamamen durma (zirveden %-10 veya 12 ay BIST-100'ü geçememe):** ✅ Kabul edildi ve uygulandı (§9/2, §9/4).
- **K6 (yeni, kanon kaynaklı) — Gölge aşaması:** ✅ Uygulandı (§1 Aşama 2). Eski metindeki "paper'ın son 4 haftası gölge" yaklaşımı ayrı aşamaya taşındı; gölge süresi (≥ 4 hafta / ≥ 10 fiş) ✅ Revizyon 2'de kanonik yapıldı.
