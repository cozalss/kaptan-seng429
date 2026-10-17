# KAPtan Landing — Yaratıcı Brief ve Ajan Sözleşmesi

> Bu dosya içerik gerçekleri için tek doğruluk kaynağıdır (§0). Tasarım sistemi `DESIGN.md`'dedir. Site, pirinç kâğıdına basılmış bir çizgi roman olarak yeniden tasarlanmıştır; eski galeri tasarımına (beyaz zemin, Instrument Serif, hero merceği, 3D pirinç pusula) ait kararlar geçersizdir.

## 0. KAPtan nedir (içerik için gerçekler — uydurma yok)

KAPtan, SENG 429 Enterprise Application Development Lab (Çankaya Üniversitesi, Dr. Bilgin Avenoğlu, güz 2026) için 4 kişilik bir ekip projesidir. BIST şirketlerinin KAP'ta (Kamuyu Aydınlatma Platformu) yayımladığı bildirimleri (günde ~350) izler.
- **İlke:** Yapay zekâ okur ve kanıt toplar → deterministik kurallar karar verir → insan onaylar. LLM asla al/sat demez. Otomatik emir yok.
- **LLM ajanları (6):** Sınıflandırıcı (türü bulur: E1–E4, filtre, diğer) · Okuyucu (tutar, karşı taraf, süre) · Önemlilik (şirketin finansallarını, piyasa değerini getirir) · Kanıt (benzer geçmiş olayları **getirilerini görmeden** seçer; istatistiği kod hesaplar) · Şüpheci (açık arar: sızıntı, abartı; büyüklüğü küçültür/veto eder) · Uyum (SPK tedbirleri, prompt-injection).
- **Deterministik:** Ön eleme (LLM'den önce: işlem görebilirlik, tedbir, evren) · Birleştirme düğümü (oranları hesaplar) · Kural motoru (E1–E4 kuralları) · **Risk kapısı (16 kural, R01–R16)**: yalnızca küçültür veya reddeder.
- **Olay türleri (yalnızca alım, kaldıraç yok):** E1 pay geri alım işlemleri (10 seansta ≥ sermayenin %0,25'i; 20–40 gün) · E2 yönetici/ana ortak alımı (20–60 gün) · E3 yeni iş ilişkisi/ihale (yıllıklandırılmış tutar ≥ yıllık gelirin %10'u; 5 gün) · E4 finansal sonuç (5–10 gün). Sızıntı filtresi: son 5 seansta >%8 yükseliş → atla/yarıya indir.
- **Risk:** işlem başına %0,5 risk · pozisyon ≤ %10 · günlük −%1 → yeni emir durur · zirveden −%5 → kill switch (açık emirleri iptal eder, pozisyon satmaz) · onay bir sonraki seansın 09:50'sinde düşer.
- **RAG:** 3 bilgi tabanı (bildirim arşivi, olay hafızası, SPK kuralları) · pgvector + Chroma karşılaştırma · LangGraph · hash zincirli denetim kaydı · roller: Analist, Risk Officer, Admin, Auditor.
- **Ölçüm:** 200 kilitli test bildirimi (macro-F1 ≥ 0,85) · RAGAS faithfulness ≥ 0,85 · kötü niyetli bildirimden çıkan emir = 0 · holdout 2025-01-01 → 2026-10-31 (ana kanıt) · canlı sanal para testi 9 Kasım (kurallar) ve 23 Kasım (tüm ajanlar).
- **Takvim:** Proposal 12 Eki 2026 · İskelet 26 Eki · Canlı test 9 Kas · Progress 23 Kas · Final Ocak 2027.
- **Dürüstlük:** Beklenti BIST-100'e göre yılda 0 ile +%5; sıfır olabilir. **Yatırım tavsiyesi değildir.** Ders projesi. Sanal para.

**Yasal/etik kırmızı çizgiler (ihlal etme):**
- KAP, Borsa İstanbul, SPK logosu/markası/arayüzü **taklit edilmez**. Bildirim görselleri **kurgusal ve açıkça temsili** olur: şirket "ÖRNEK ENERJİ A.Ş." / "ÖRNEK", ticker "ORNEK" gibi; üzerinde küçük "Temsili" ibaresi. Gerçek şirket adı, gerçek fiyat, gerçek sinyal yok.
- "Para kazandırır", "garanti", "en iyi" gibi iddialar yok. Uydurma istatistik, ödül, yorum yok.
- Kişisel veri toplanmaz (form yok, bülten yok).

## 1. Tasarım yönü (özet)

Site, pirinç kâğıdına basılmış bir **çizgi roman kitabıdır** (SBS "The Boat"tan esinli sumi-e mürekkep): fırtınada küçük bir tekne, okuyan bir tayfa, dümeni tutan kurallar, son imzayı atan bir insan. Tasarım sisteminin tamamı — renk görevleri, tipografi, kitap bileşenleri, hareket haritası, tek WebGL bağlamı kuralı, illüstrasyon hattı, yasaklı "AI izi" kalıpları, erişilebilirlik, bütçeler ve QA — **`DESIGN.md`**'dedir. Kısaca:

- Zemin kâğıt `#F3F1EC`, mürekkep `#121318`, deniz ve yıkamalar için koyu çivit `#2A4C8C`; köşeler kare, gölgeler bulanık değil sert ofset.
- **Kuzey kırmızısı `#B3261E`** yalnızca pusula iğnesi, teknenin bayrağı ve Pusula sahnesindeki tek ONAYLANDI mührü. **Kaptan laciverti `#0C2F63`** ikinci mürekkep: wordmark, odak halkası, seçim rengi, etkin seçim ve odak sayılar. Site güneşli sınıfta projeksiyonla gösterildiği için tüm değerler soluklaşmaya dayanıklıdır (`DESIGN.md` §2.1).
- Başlıklar Bodoni Moda Display büyük harf, ikinci satır içeriden; metin Inter, cümle düzeni; mono yalnızca kural kodları (E1–E4, R01–R16).
- Tüm metin Türkçe, "siz" dili, sakin ve somut. Büyük harf CSS `text-transform` + `lang="tr"` ile; JS'te `toLocaleUpperCase('tr-TR')`.

## 2. Bölümler ve kimlikler (sayfa sırası)

| Bölüm | `id` | Başlık | Dosyalar |
|---|---|---|---|
| Yükleyici | — | 0,6 sn'lik tek gösteri (en çok 0,7 sn): kadran kendini çizer, iğne küçülen salınımlarla kuzeye oturur; "Bildirimler taranıyor · n/total" | `src/components/loader/` |
| Üst bar | — | KAPtan · Proje · İçindekiler · Demo akışı (bölüm başlıklarının sol yuvası canlı folyo: bölüm çentikleri + "s. n / N"; wordmark yalnızca üst barda) | `src/components/header/`, `src/ui/` |
| Bölüm 1 · Fırtına | `#hero` | "Kanıt / önce." — WebGL mürekkep deniz, tekne, üç anlatı paneli, pusula | `src/components/hero/` |
| Bölüm 2 · Tayfa | `#ajanlar` | "Sekiz kişilik / tayfa." — 8 ajan paneli (6 LLM + Kural Motoru + Risk Kapısı), ajan ayrıntı sayfası, çift sayfa seyir haritası | `src/components/services/`, `src/ui/service-modal*`, `src/ui/agent-scenes/` |
| Bölüm 3 · Seyir Kuralları | `#olaylar` | "Dört olay. / Yalnızca alım." — Sancak Tezgâhı: E1–E4 maddeleri (statik metin) + her kural için tek paylaşılan yuvada bir alet, tutan kuralın flaması direğe çekilir; filtreler flamayı yalnızca indirir; dipnot (yatırım tavsiyesi değildir) | `src/components/rules-bench/`, `src/components/menu/menu.css`, `src/data/events.js` |
| Ara · 350'den 1'e | `#pusula` | "350 bildirim. / Tek yön." — Canvas 2D mürekkep sahnesi: Gürültü → Kanıt → Onay → Yön | `src/components/compass/` |
| Bölüm 4 · Rota | `#yolculuk` | "Bir bildirimin / rotası." — Yakala · Anla · Kanıtla · Onayla | `src/components/ritual/` |
| Kolofon | `#kolofon` | künye, tayfa rolleri, bağlantılar, yasal satır, "— Son —" | `src/components/footer/` |
| Katmanlar | — | İçindekiler çekmecesi · "Demo akışı" çekmecesi (6 mürekkep kare, statik; "Final sunumunda gösterilecek") · "Proje hakkında" · "Yasal uyarı" · ajan ayrıntısı (`#ajan-<id>`, 8 ajanın 8 canlı diyoraması) · mobil yapışkan sekme ("İçindekiler · Demo akışı", yalnızca yukarı kaydırırken) | `src/ui/`, `src/components/sticky-cta/` |

Proje bağlantıları `src/config/site.js` → `SITE.links` (yer tutucu `null` → soluk "· yakında"; ölü `#` yok). Ajan sırası `src/data/agents.js`: Sınıflandırıcı, Okuyucu, Önemlilik, Kanıt, Şüpheci, Uyum, Kural Motoru, Risk Kapısı.

## 3. Görsel dosyalar

`public/images/generated/` altında; adlar ve genişlikler `src/lib/responsive-images.js` ile uyumlu olmalı. Üretim ayrıntıları `DESIGN.md` §6'da.

| Dosyalar | Kullanım | Üreten |
|---|---|---|
| `ajan-{1..8}-{400,600,800}.{avif,webp,jpg}` (3:4) | Tayfa panelleri ve ajan ayrıntısı (mürekkep tayfa portreleri) | `npm run visuals` → `scripts/kaptan-visuals/crew/` (`STYLE.md`) |
| `ajan-{1..8}-detail-{400,600}.{avif,webp,jpg}` | şu an sayfada kullanılmıyor | aynı |
| `harita-{1280,1920}.{avif,webp,jpg}` (3:2) | Bölüm 2'yi kapatan çift sayfa harita (rota ve lejant canlı SVG) | `scripts/kaptan-visuals/chart.mjs` |
| `yolculuk-{1..4}-{600,900,1200,1600,2000}.{avif,webp,jpg}` | Rota duraklarının küçük levhaları | `scripts/kaptan-visuals/journey.mjs` |
| `pusula-01-{900,1400}.{avif,webp}` | Pusula sahnesinin son karesi (reduced-motion / script yok) | `scripts/build-pusula-still.mjs` (çalışan dev sunucusu gerekir) |
| `og-1280.jpg` (1280×853) | og:image / twitter:image (hero'nun tek kare baskısı) | `npm run visuals -- --only=og` → `scripts/kaptan-visuals/og.mjs` + `og-wordmark.mjs` |

Hero'nun görsel dosyası yoktur: deniz WebGL shader'ıyla çizilir, WebGL yoksa `index.html`'deki basılı SVG dalgalar kalır.

## 4. Çalışma kuralları

- Gerçekler yalnızca §0, `src/config/site.js` ve `src/data/*`'tan gelir; işaretlemedeki metin statik yedektir.
- Paylaşılan dosyalarda (`index.html`, `src/main.js`, `vite.config.js`) tüm dosyayı yeniden yazmak yerine küçük düzenlemeler yapın; `index.html`'deki `HERO`, `PUSULA`, `OLAYLAR`, `WIPE` işaret yorumlarını koruyun.
- Genel API'leri koruyun: `initSeaStage({ section })`, `initCompass({ section })`, `renderServices(track, agents)`, `initKaptanUI(...)`, `claimGLSlot(release)`.
- `npm test` her zaman yeşil, `npm run build` hatasız, konsolda hata yok. Kaldırılan özelliğin testi kaldırılır; yeni saf mantık için test yazılır (kapsam eşiği %80).
- Kontrol boyutları: 1440×900, 1280×720, 390×844 ve reduced-motion (`node scripts/qa/shot.mjs`, bkz. `DESIGN.md` §10).
- Erişilebilirlik (odak, klavye, aria, reduced-motion, 44px hedefler) ve performans (tek WebGL bağlamı, DPR sınırları, tembel yükleme) kuralları `DESIGN.md` §8–§9'dadır.
