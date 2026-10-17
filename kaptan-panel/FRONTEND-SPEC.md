# KAPtan Paneli — Frontend Spesifikasyonu

> **Kişisel mod (03.10.2026): [`SPEC.md`](./SPEC.md) bu belgenin yerine geçer.** Roller (§1.2, §4), dört göz, `/audit`, `/limits`, `/admin`, `/yetkisiz`, TOTP ve rehberli demo kaldırıldı; rotalar Türkçeleşti. Bu belge şemalar (§6), API ayrıntısı (§5), içerik kuralları (§8) ve fikstürler (§7) için başvuru olarak kalır.

> Sürüm 1.0 · 02.10.2026 · Sahip: Rol 4 (Frontend & Değerlendirme) · Durum: temel (foundation) teslim edildi.
>
> Bu belge `docs/proje/` altındaki belgelerden türetilmiştir. Her madde kaynağını köşeli parantezle verir:
> `[04 §11]` = `04-mimari.md` bölüm 11, `[K]` = `_KANONIK-KARARLAR.md`, `[NIHAI]` = `docs/arastirma/NIHAI-PROJE.md`, `[DESIGN]` = `kaptan-landing/DESIGN.md`, `[BRIEF]` = `kaptan-landing/KAPTAN-BRIEF.md`.
> **Çelişkide `_KANONIK-KARARLAR.md` kazanır** (en üstteki Revizyon 3, sonra Revizyon 2). Çözülen çelişkiler §9'dadır.
> Kodda alan adları İngilizce ve `05` şemalarıyla birebir aynıdır; arayüz metni Türkçedir [14 başlık notu].

---

## 1. Ürün, personalar ve panelin amacı

### 1.1 Ürün
KAPtan, BIST şirketlerinin KAP bildirimlerini (günde ~270–350) izleyen çok ajanlı bir "yatırım masası"dır [K, 11 §1]. İlke: **LLM okur, sınıflandırır, kanıt toplar → deterministik kural motoru karar verir → insan onaylar** [K]. Otomatik yürütme yoktur; risk kapısından geçen her öneri Risk Officer onayına gider ve yanıtlanmazsa bir sonraki seansın 09:50'sinde düşer [K, 06 R15]. Yalnızca alım; açığa satış ve kaldıraç yok [K]. Ders kapsamında tüm işlemler sanal paradır (SimBIST paper) [02 §7].

### 1.2 Personalar → roller [03 §2, 09 §5]
| Persona | Rol (kod) | Panelde ne yapar |
|---|---|---|
| P1 Elif, PYŞ fon yöneticisi | Risk Officer (`risk_officer`, R) — ayrı "Fon Yöneticisi" rolü stretch [K] | Sabah özeti, "Neden bu işlem?", onay/küçült/ret |
| P2 Mert, analist | Analist (`analyst`, A) | Canlı akış, not ekleme, iz okuma |
| P3 Zeynep, Risk Officer | Risk Officer (R) | Onay kuyruğu, kill switch, limitler, reset onayı |
| P4 Burak, sistem yöneticisi | Admin (`admin`, D) | Kullanıcı/evren/config, reset başlatma, demo enjeksiyonu |
| P5 Kişisel kullanıcı | Risk Officer (kişisel modda tek kişi) [12 §2] | Emir fişi, manuel dolum |
| P6 Selin, iç denetçi; **Hoca / jüri** | Auditor (`auditor`, U) — salt okunur [K, 09 §5] | Her şeyi görür, zinciri doğrular, hiçbir şey yazamaz |

### 1.3 Panelin amacı
1. Bir fon ekibinin günlük işini tek yerde toplamak: akış → öneri → gerekçe → onay → portföy → denetim [04 §12].
2. Her kararı **yeniden kurulabilir ve denetlenebilir** göstermek ("Neden bu işlem?", hash zinciri) [FR-31, FR-30].
3. Final demosunu (5 dk) klavyeden, güvenilir biçimde yürütmek [11 §2]. Demo modunda enjekte edilen her öğe **"DEMO FİKSTÜRÜ"** etiketi taşır; canlı ile fikstür ayrımı asla gizlenmez [11 §4, FR-40].
4. Herkese açık kayıt yoktur; landing (`kaptan-landing`) herkese açık kalır, panel girişlidir [memory: kaptan-panel-build].

---

## 2. Ekranlar

Görüntüleme kuralı (§9 Ç-4): **tüm görüntüleme ekranları dört role açıktır** (09 §5'te her rolün `VIEW` izni var); `04 §12`'deki dar rol listeleri **eylem** yetkisi olarak okunur. İstisnalar: `/admin` (yalnızca D) ve audit dışa aktarım/doğrulama (R D U).

Her ekranın ortak kabuğu: kenar çubuğu, üst bar (seans durumu, canlı sayaçlar, bekleyen onay rozeti, kill switch durumu, kullanıcı/rol), ⌘K komut paleti, toast'lar, mock modda "DEMO VERİSİ" şeridi ve **her ekranın altında feragatname** [09 §10.1, NFR-20]:

> KAPtan bir ders projesidir. Üretilen sınıflandırmalar, özetler ve emir fişleri yatırım tavsiyesi değildir; sermaye piyasası mevzuatı kapsamında yatırım danışmanlığı hizmeti sunulmamaktadır. Özetler otomatik üretilmiştir ve hata içerebilir.

Durum sözleşmesi (her ekran için): **yükleniyor** = Skeleton (içeriğin şeklinde, 300 ms'den sonra), **boş** = EmptyState (ne olduğu + neden boş + bir sonraki adım), **hata** = Panel içinde hata kutusu + "Yeniden dene" + teknik ayrıntı katlanır (kişisel veri yok) [09 §6 "Hata mesajları"], **canlı** = SSE bağlı göstergesi (üst barda nokta + "canlı"/"yeniden bağlanıyor"); SSE güncellemesi ≤ 5 sn [NFR-03].

### 2.1 `/login` — Giriş · sahibi S4 (cilası)
- Roller: oturumsuz herkes. Herkese açık kayıt yok.
- İçerik: KAPtan wordmark, e-posta + parola, "Giriş yap"; mock modda **demo hesapları paneli** (4 hesap, tek tıkla doldur) — yalnızca `NEXT_PUBLIC_API_MODE=mock` iken [görev tanımı]. Feragatname.
- Durumlar: hata "Kimlik doğrulanamadı" (genel mesaj) [09 §6]; kilitlenme (5/dk) mesajı http modunda.
- Eylemler: giriş → rolün ana ekranına (A/U → `/inbox`, R → `/approvals`, D → `/inbox`). `?next=` korunur (yalnızca site içi yol).

### 2.2 `/inbox` — Canlı Akış · S2
- Roller: A R D U görür; not ekleme A R D [04 §11 `POST /disclosures/{index}/notes`]; demo enjeksiyonu D (yalnızca demo) [09 §5].
- İçerik [04 §12, 11 Adım 1, US-43]: sayaç şeridi "Bugün HH:MM itibarıyla N bildirim · devre kesici X elendi · E1–E4 dışı Y arşivlendi · işleme alındı Z"; LLM maliyet rozeti "Bugün: 31 çağrı · ~0,4M token"; hat hunisi (gelen → elenen → sınıflanan → sinyal → risk kapısı → onay → dolum) [08 §8.1 #1]; filtre çubuğu (ticker, E-kodu, sınıf, gürültü göster/gizle, tarih); yoğun tablo: saat, ticker, şirket, konu (`subject`), rota rozeti (`subject_route`), sınıflandırma rozeti (E1–E4 / X / O + güven), TR/EN rozeti, `reason` (NEW/UPD/CORR/CANC), bağlı haber sayısı, not sayısı, "DEMO FİKSTÜRÜ" etiketi; satır → detay çekmecesi (metin TR/EN, ön eleme sonucu, sınıflandırma, bağlı run → `/runs/[id]`).
- Durumlar: boş ("Bugün henüz bildirim yok — seans 09:40'ta açılış emir toplamayla başlar"), yükleniyor, hata, canlı (yeni satır üste "yeni" vurgusuyla, odak çalmadan; `aria-live="polite"` özet).
- Eylemler: filtrele, satır aç, not ekle (A R D), "Senaryo" menüsü (D, demo modu; S4 rehberli demo ile ortak).

### 2.3 `/approvals` — Onay Kuyruğu · S2
- Roller: R karar verir; A D U görür (butonlar görünür ama devre dışı + "Yalnızca Risk Officer onaylayabilir" ipucu) [09 §5: Admin onaylayamaz, görevler ayrılığı (c)].
- İçerik [04 §12, 05 ApprovalCard, US-26, US-28]: kartlar — ticker, olay (E-kodu + alt tür), seviye (normal / **escalate** + `escalation_reasons`), önerilen → risk sonrası tutar (`final_notional_try`), limit fiyat, giriş tipi, tutma günleri, **Countdown** (`expires_at`, 09:50'ye), kural izi özeti (✓/✗), kanıt özeti (n, medyan CAR 5/20 g, güç), şüpheci bayrakları, uyum özeti (LLM üretimi etiketiyle), degraded uyarısı, `prompt_manifest_hash` HashChip, KAP bağlantısı (`https://www.kap.org.tr/tr/Bildirim/{idx}`; fikstürde bağlantı yerine "Temsili").
- Durumlar: boş ("Bekleyen onay yok"), süre dolan kart → `expired` gri, kill switch açıkken tüm butonlar devre dışı + kırmızı bant [06 §11].
- Eylemler (R): **Onayla**, **Küçült** (tutar ≤ `final_notional_try`, büyütme yok) [FR-24], **Reddet**; üçünde de **yorum zorunlu** (≤ 500 karakter) [05 ApprovalDecision, 04 §12]; adım-yukarı TOTP (mock: herhangi 6 hane) [09 §6]; 409 → "Bu öneri başka bir oturumda karara bağlandı ya da süresi doldu" [04 §11].

### 2.4 `/runs/[id]` — "Neden bu işlem?" + ajan izi · S1
- Liste: `/runs` (Ç-19) — bugünün ve geçmişin çalıştırmaları; filtre durum; satır → `/runs/[id]`.
- Roller: A R D U [04 §12, US-37, US-54]; not ekleme A R D.
- İçerik [04 §12 sırasıyla, FR-31]: bildirim metni TR/EN (alıntılanan `source_spans` vurgulu); ön eleme sonucu (`PreGateResult`, `GuardResult`); sınıflandırma yöntemi (subject haritası mı, LLM mi; güven, gerekçe, alıntılar); **Birleştirme hesabı** (Okuyucu tutarı + regex eşleşmesi ✓/✗, payda türü, dönem, kur; `Decimal` ile hesaplanan oran) [05 §5.0]; **kanıt kartı** (seçilen benzer olaylar + kodla hesaplanan CAR dağılımı, n, isabet, %95 GA, güç) [05 EvidenceCard]; şüpheci notu (bayraklar, `size_multiplier`, en güçlü karşı argüman); **kural izi** (✓/✗ tablo, `reason_codes`, `rules_hash`); uyum bulguları (6–10 kontrol); **risk kuralları R01–R16** (faz, sonuç, ayrıntı); onaylayan + yorum; emir/dolum; **emir fişi** (kişisel mod, §2.6); audit zincir konumları (`chain_pos` listesi, HashChip); **ajan iz zaman çizelgesi** (düğüm sırası, süre, token, model, prompt sürümü, cache; LangSmith bağlantısı örneklenmişse) [FR-36, US-44].
- Durumlar: run `running` ise canlı düğüm akışı (SSE `/stream/runs/{id}`: `node`, `progress`, `interrupt`, `done`); `interrupted` = onay bekliyor rozeti; `hold_quota` = "Kota bitti, HOLD — güvenli varsayılan" [11 §4]; `failed`; injection karantinası = kırmızı rozet, "Kural motoruna ulaşmadı" [11 Adım 3]; R04 sert veto = "LLM çağrısı 0".
- Eylemler: TR/EN geçişi, bölümler arası atlama (sağda içindekiler), JSON görünümü (TradeProposal), not ekle, "Onay kuyruğunda aç" (R).

### 2.5 `/portfolio` — Portföy · S3
- Roller: A R D U görür; **kill switch butonu R D** [04 §12, 09 §5].
- İçerik [04 §12, US-34, US-35, 08 §8.1 #2–4]: açık pozisyonlar (ticker, adet, ort. maliyet, giriş tarihi, tutma günü / planlanan çıkış tarihi, gerçekleşmemiş K/Z, kaynak öneri → `/runs/[id]`, `strategy_version`, kill switch sonrası "çıkış kuralıyla yönetiliyor" etiketi); P&L eğrisi `kaptan:v1.0-fwd`, `kaptan:v1.1-fwd` vs `baseline:xu100_bh` ve `baseline:ew_universe` [07 pnl_daily]; drawdown grafiği + %-1 / %-5 eşik çizgileri; risk durumu paneli (`/risk/status`: kill switch, günlük K/Z, zirveden düşüş, rejim, kota); emirler ve dolumlar; **Emir fişleri** sekmesi (kişisel mod) [11 Adım 6].
- Durumlar: günlük %-1 → sarı "YENİ EMİR DURDU" bandı (ertesi seans otomatik sıfırlanır, elle kaldırılamaz) [09 §5]; %-5 → kırmızı **KILL SWITCH** bandı [11 Adım 4]; boş portföy.
- Eylemler: kill switch aç (R D; type-to-confirm "DURDUR" + gerekçe) [görev tanımı]; reset başlat (D) / onayla (R, başlatandan farklı kişi) [09 §5 (b)]; manuel dolum girişi (R, kişisel mod) [04 §11].

### 2.6 Emir fişi (kişisel mod) — `/portfolio?sekme=fis` ve `/runs/[id]#emir-fisi` · S3 (+S1 gömülü görünüm)
- İçerik [12 §2]: fiş no, kurallar sürümü, onay zamanı (09:50 sınırı), oluşturma/geçerlilik (30 dk TTL; açılış öncesi üretilen fişte 09:40'tan sayılır), mod (3 anahtar), işlem AL, sembol, emir tipi LİMİT, seans, adet (lot), limit fiyat (+ tavan mesafesi), tahmini tutar, olay, KAP, önemlilik, sızıntı, kanıt kartı, maliyet, avantaj/maliyet, şüpheci notu, tutar kontrolü (R14), stop, planlanan çıkış, kapı sonuçları R01–R16, geri bildirim alanları, audit hash. Demo özeti: "ÖRNEK ENERJİ A.Ş. · LİMİT 48,40 · 620 lot · 30 dk geçerli · Manuel giriş" [11 Adım 6].
- Kural: **paylaşım/dışa aktarım yok** (PDF yalnızca R D, `GET /orders/{id}/ticket.pdf`) [FR-27, R-24].

### 2.7 `/audit` — Audit görüntüleyici · S4
- Roller: R D U tam; A görüntüler (salt okunur, dışa aktarım ve "Zinciri doğrula" yok) [§9 Ç-5].
- İçerik [04 §12, 09 §7]: filtreli yoğun tablo (seq, `chain_pos`, zaman UTC→TR, aktör, eylem, varlık türü/kimliği, run, sürüm), satır → JSON payload + `canonical` + `prev_hash`/`hash`; **"Zinciri doğrula"** → "4.812 kayıt · hash zinciri geçerli ✓" ya da "Kayıt #3.907'de zincir kırık ✗" + hata türü; son dış çapa; **"Kurcalama testi"** (yalnızca demo/mock, D) [11 Adım 4]; zincir durumu kartı (son doğrulama, baş hash) [08 §8.1 #13].
- Durumlar: doğrulanıyor (ilerleme), geçerli (ink ✓), kırık (north red ✗, kırık konuma atla).

### 2.8 `/limits` — Limitler · S4
- Roller: A R D U görür; öneri R D; onay R D (**öneren ≠ onaylayan**) [04 §11, 09 §5 (a)].
- İçerik: geçerli sürüm (anahtar/değer/birim/açıklama, R kodu), geçmiş sürümler, bekleyen öneriler, **diff görünümü** (eski → yeni, değişen satır vurgulu), gerekçe [04 §12, 07 limit_versions].
- Eylemler: değişiklik öner (form + zorunlu gerekçe), ikinci onay / ret (yorum zorunlu). Kendi önerisinde onay butonu devre dışı + "Öneren onaylayamaz (dört göz)".

### 2.9 `/eval` — Değerlendirme panosu · S3
- Roller: A R D U [04 §12]; maliyet/kota paneli R D U [09 §5] (A'ya gizli değil, "yetki yok" boş durumu).
- İçerik [08 §8.1, 04 §12, 11 Adım 5]: L1 sınıflandırma (macro-F1 kilitli test, sınıf bazında F1, karışıklık matrisi, model × E-kodu, ECE, κ); L2 RAGAS (faithfulness, context precision/recall, R@10, MRR, zaman ihlali = 0); L3 **holdout 2025-01-01 → 2026-10-31 (ana kanıt, tek koşu)** tablo: CAR[1]/[5]/[20]/[60], Sharpe, Sortino, MaxDD, iki maliyet senaryosu (%0,05 ve %0,20 / taraf); L4 ileri dönük paper `v1.0-fwd` (9 Kas) ve `v1.1-fwd` (23 Kas) vs B0 BIST-100, B1 eşit ağırlık; ablation tablosu (B2 yalnızca subject, B3 serbest LLM, A0…A7); red-team (≥ 30 kötü niyetli, Q/N/H/F, emir = 0, engelleme ≥ %95, yanlış alarm); gecikme p50/p95 (< 60 sn); gölge sinyaller [US-55]; token/karar maliyeti.
- **Kural:** tüm sayılar fikstürde **"örnek değer · gerçek sonuç değil"** etiketiyle; hedef çizgileri ayrıca gösterilir. Uydurulmuş sonuç asla gerçek gibi sunulmaz [görev tanımı, BRIEF §0].

### 2.10 `/brief` — Sabah özeti · S3
- Roller: A R D U görür (§9 Ç-6).
- İçerik [K 08:45, 04 §12, US-42]: tarih seçici (`/brief/{date}`); dünkü seans sonrası önemli bildirimler; bugün açılışta girilecek onaylı emirler; bekleyen onaylar (09:50 geri sayımı); açık pozisyonlar ve **bugün tutma süresi dolanlar**; risk uyarıları; tedbir değişiklikleri. Üretim zamanı "08:45" ve "LLM üretimi, doğrulanmamış" etiketi (özet metinleri için) [09 §10.1].

### 2.11 `/admin` — Yönetim · S4
- Roller: yalnızca D (diğerleri proxy'de `/yetkisiz`'e yönlenir) [04 §12].
- İçerik [04 §11–12, 09 §5, §8]: kullanıcılar/roller (kendi rolünü değiştiremez; Auditor başka rolle birleşemez), evren (izleme listesi), ekip engel listesi (`restricted_securities`; ekleme D hemen etkili, **çıkarma R onayı**), config (salt okunur sürüm etiketi), **canlı mod 3 anahtarı** (config ✓ / env ✓ / UI: D başlatır, R onaylar; gün sonunda düşer), **demo enjeksiyonu** (yalnızca demo modu; senaryo listesi), demo verisini sıfırla (mock).

### 2.12 `/styleguide` — Tasarım sistemi vitrini · temel (foundation)
- Roller: oturum gerektirir (A R D U). Tüm primitifler, tokenlar, durum örnekleri.

### 2.13 `/yetkisiz` ve 404
- Rol yetmiyorsa: "Bu ekran {rol} rolüne kapalı" + rolün açabildiği ekranlar. 404: "Bu sayfa haritada yok."

---

## 3. US/FR/NFR → ekran ve bileşen eşlemesi

| Gereksinim | Özet | Ekran | Bileşen / mekanizma |
|---|---|---|---|
| US-03, FR-22 | LLM'siz ön eleme görünür | `/inbox`, `/runs/[id]` | rota rozeti, `PreGateResult` paneli, "LLM çağrısı 0" |
| US-11, FR-15 | Kanıt kartı (n, CAR 1/5/20/60, isabet, GA, örnekler) | `/runs/[id]`, `/approvals` | `EvidenceCard`, `Sparkline`, `Stat` |
| US-21, FR-20 | %-1 durdurma, %-5 kill switch | üst bar, `/portfolio` | `KillSwitchState`, bantlar, `ConfirmDialog` |
| US-22, FR-21 | Kota → HOLD | `/runs/[id]`, üst bar | `hold_quota` durumu, kota göstergesi |
| US-26, US-27, FR-24 | Onayla/küçült/reddet, 09:50 düşme, 409 | `/approvals` | `ApprovalCard`, `Countdown`, `Field` (zorunlu yorum) |
| US-28 | Tek bakışta kart | `/approvals` | kart düzeni (NFR-21 "tek ekranda karar") |
| US-30, FR-27 | Emir fişi, 30 dk, manuel dolum, paylaşım yok | `/portfolio`, `/runs/[id]` | `OrderTicket` |
| US-34, US-35 | Pozisyon, K/Z, drawdown, kaynak olay ve sürüm | `/portfolio` | `Table`, Recharts |
| US-36, FR-30 | Hash zinciri + doğrulama düğmesi | `/audit` | `HashChip`, verify akışı |
| US-37, FR-31 | "Neden bu işlem?" | `/runs/[id]` | bölümler §2.4 |
| US-39, FR-33 | 4 rol, JWT + refresh, matris | tümü | `proxy.ts`, `can()` |
| US-40 | Limitlerde dört göz | `/limits` | proposer ≠ approver kuralı |
| US-41, FR-34 | Evren/config yönetimi | `/admin` | — |
| US-42, FR-35 | Sabah özeti 08:45 | `/brief` | — |
| US-43, FR-35 | Canlı pano sayaçları + LLM maliyeti | üst bar, `/inbox` | `useEventStream`, sayaçlar |
| US-44, FR-36 | Ajan izi | `/runs/[id]` | `RunTrace` zaman çizelgesi |
| US-45, US-55 | Baseline/ablation, gölge getiriler | `/eval`, `/portfolio` | grafik + tablo |
| US-54 | Auditor salt okunur | tümü | tüm mutasyon butonları gizli/devre dışı |
| US-57 | Ekip engel listesi | `/admin`, `/runs/[id]` (R13) | — |
| FR-40 | Demo modu, "DEMO FİKSTÜRÜ" | tümü | `DemoBadge`, ribbon, Senaryo menüsü |
| NFR-03 | SSE ≤ 5 sn | tümü | `useEventStream` (Last-Event-ID, yeniden bağlanma) |
| NFR-20 | Feragatname, paylaşım yok | tümü | `Disclaimer` alt bilgi |
| NFR-21 | Türkçe, tek ekran onay, WCAG AA | tümü | tokenlar (§8), klavye, odak halkası |

---

## 4. Yetki matrisi (A/R/D/U)

Kaynak: [09 §5] tablosu ve `ROLE_PERMS`; uç nokta rolleri [04 §11]. Panelde `src/lib/auth/permissions.ts` aynı izin adlarını kullanır.

| Eylem (izin) | A | R | D | U | Not |
|---|---|---|---|---|---|
| Görüntüleme: akış, kanıt, "Neden", P&L, pano, brief, limitler, eval (`view`) | ✓ | ✓ | ✓ | ✓ | |
| Audit görme | ✓ | ✓ | ✓ | ✓ | §9 Ç-5 |
| Audit dışa aktarma + zincir doğrulama (`audit_export`) | | ✓ | ✓ | ✓ | `POST /audit/verify` yan etkisiz |
| Not ekleme (`note`) | ✓ | ✓ | ✓ | | Auditor hiçbir şey yazamaz |
| Öneri onay/küçült/ret (`approve`, TOTP) | | ✓ | | | Admin onaylayamaz (c) |
| Kill switch açma (`kill_on`) | | ✓ | ✓ | | Otomatik tetik: zirveden %-5 |
| Kill switch reset başlatma (`kill_reset_init`, TOTP) | | | ✓ | | |
| Kill switch reset onaylama (`kill_reset_confirm`, TOTP) | | ✓ | | | Başlatandan farklı kişi (b); kişisel modda ≥ 24 sa + 5 seans |
| Günlük %-1 durdurmasını kaldırma | | | | | **Kimse**; ertesi seans otomatik |
| Limit önerme (`limit_propose`) | | ✓ | ✓ | | |
| Limit onaylama (`limit_approve`) | | ✓ | ✓ | | Öneren ≠ onaylayan (a) |
| Kullanıcı/rol, evren, config (`users`, `config`) | | | ✓ | | Kendi rolünü değiştiremez |
| Engel listesi ekleme (`blocklist_add`) | | | ✓ | | hemen etkili |
| Engel listesi çıkarma onayı (`blocklist_remove_confirm`) | | ✓ | | | |
| Canlı mod başlatma / onay (`live_arm_init` / `live_arm_confirm`) | | onay | başlatma | | gün sonunda düşer |
| Demo enjeksiyonu (`demo_inject`) | | | ✓ | | yalnızca demo modu |
| Manuel dolum (`manual_fill`) | | ✓ | | | kişisel modda sahibi |
| Emir fişi PDF | | ✓ | ✓ | | |
| `/admin` ekranı | | | ✓ | | |

**Görevler ayrılığı** [09 §5]: (a) öneren onaylayamaz; (b) reset başlatan onaylayamaz; (c) Admin öneri onaylayamaz; (d) Auditor başka rolle birleşemez. **Dört göz akışları** (UI): limit önerisi → farklı kullanıcı onayı; kill switch reset "1/2 başlatıldı (Admin)" → "2/2 onaylandı (Risk Officer)" [11 Adım 4, §9 Ç-8].

**Seed hesaplar (yalnızca mock)** [09 §5 önerisi]: `admin@kaptan.demo` (Admin, Burak), `risk@kaptan.demo` (Risk Officer, Zeynep), `analist@kaptan.demo` (Analist, Mert), `denetci@kaptan.demo` (Auditor, "Hoca"). Parola tümünde `kaptan2026`. Ek olarak ikinci bir Risk Officer (`risk2@kaptan.demo`) limitlerde dört göz denemesi için.

---

## 5. API uç noktaları ve SSE olayları

Önek `/api/v1` [04 §11]. JWT 15 dk, bellekte; refresh çerezi `__Host-kaptan_rt` (HttpOnly, Secure, SameSite=Strict, 8 sa, her kullanımda döner); çerezli tek uç `/auth/refresh` + `X-KAPtan-CSRF` başlığı; SSE `EventSource` başlık gönderemediği için `POST /sse/ticket` ile 60 sn'lik tek kullanımlık bilet [09 §6]. Panel istemcisi (`src/lib/api/client.ts`) bu uçların tamamını tek bir tipli arayüzde toplar; yanıtlar zod ile doğrulanır.

| Metot · Yol | Rol | İstek | Yanıt (zod şeması, §6) |
|---|---|---|---|
| POST `/auth/login` | herkes | `{email, password}` | `{access_token, user: Me}` + refresh çerezi |
| POST `/auth/refresh` · `/auth/logout` | herkes | — | `{access_token}` · 204 |
| GET `/me` | ARDU | — | `Me {id, email, display_name, roles[], mfa_fresh}` |
| GET `/disclosures?date&ticker&event_code&noise&page` | ARDU | — | `Page<DisclosureListItem>` + `counters: DayCounters` |
| GET `/disclosures/{index}` | ARDU | — | `DisclosureDetail` (metin TR/EN, ekler, sınıflandırma, notlar, run_id) |
| POST `/disclosures/{index}/notes` | ARD | `{body}` | `Note` |
| GET `/runs?status&from` · `/runs/{run_id}` | ARDU | — | `Page<RunSummary>` · `RunDetail` (+ `agent_outputs`) |
| GET `/runs/{run_id}/explain` | ARDU | — | `Explain` (§6.10) |
| GET `/approvals?status=pending` | ARDU | — | `ApprovalCard[]` |
| POST `/approvals/{proposal_id}/decision` | R | `ApprovalDecision` | `ApprovalResult`; 409 çakışma/süre, 403 diğer |
| GET `/orders` · `/orders/{id}` | ARDU | — | `Order[]` · `Order` (+ `fills`) |
| POST `/orders/{id}/manual-fill` | R | `{qty, price, filled_at}` | `Fill` |
| GET `/orders/{id}/ticket.pdf` | RD | — | PDF |
| GET `/portfolio/positions` · `/portfolio/pnl?from&to` | ARDU | — | `Position[]` · `PnlSeries` |
| GET `/risk/status` | ARDU | — | `RiskStatus` |
| POST `/risk/kill-switch` | RD | `{reason}` | `RiskStatus` |
| POST `/risk/kill-switch/reset/request` | D | `{reason}` | `KillResetRequest` |
| POST `/risk/kill-switch/reset/confirm` | R (≠ isteyen) | `{request_id, comment}` | `RiskStatus` |
| GET `/limits` · `/limits/history` | ARDU | — | `LimitVersion` · `LimitVersion[]` |
| POST `/limits/proposals` | RD | `{changes: {key,value}[], reason}` | `LimitVersion (proposed)` |
| POST `/limits/proposals/{id}/approve` | RD (≠ öneren) | `{decision: approve|reject, comment}` | `LimitVersion` |
| GET `/audit?entity&from&actor&action&page` | RDU (+A görüntü) | — | `Page<AuditEntry>` |
| POST `/audit/verify` | RDU | — | `ChainVerifyResult {ok, first_bad_pos, kind, checked, head_hash, verified_at}` |
| GET `/eval/summary` · `/eval/ablations` · `/eval/classification` · `/eval/rag` | ARDU | — | `EvalSummary` ve alt şemalar (§6.12) |
| GET `/brief/today` · `/brief/{date}` | ARD(U) | — | `MorningBrief` |
| GET/PUT `/admin/users` · `/admin/universe` · `/admin/config` | D | — | `AdminUser[]`, `UniverseEntry[]`, `ConfigView` |
| POST `/admin/live/arm` · `/admin/live/confirm` | D · R | — | `LiveArmState` |
| POST `/admin/demo/inject` | D (`DEMO_MODE`) | `{scenario}` | `{disclosure_index, run_id}` |

**SSE** [04 §11]: `/stream/feed` (ARD; panelde U'ya da açılır, §9 Ç-4) → `disclosure` (`DisclosureListItem`), `classification` (`{disclosure_index, event_type, confidence}`), `news_linked`; `/stream/runs/{run_id}` (ARD) → `node` (`{node, phase: start|end, at, latency_ms?, tokens_in?, tokens_out?}`), `progress`, `interrupt` (`{proposal_id}`), `done` (`{status, outcome}`); `/stream/desk` (ARDU) → `approval.requested` (`ApprovalCard`), `order` (`Order`), `fill` (`Fill`), `kill_switch` (`RiskStatus`), `halt` (`RiskStatus`), `limits.changed` (`LimitVersion`). Panel ek olarak `counters` olayını (`DayCounters`) `/stream/feed` üzerinden bekler (§9 Ç-12). `id` = Redis stream kimliği; yeniden bağlanmada `Last-Event-ID`; 15 sn keep-alive yorum satırı.

---

## 6. Alan şemaları (zod, `src/lib/domain/`)

Kod adları `05` ile birebir. Para TL `number` (gösterimde `Intl.NumberFormat('tr-TR')`), tarih ISO 8601 UTC string, gösterimde `Europe/Istanbul`.

### 6.1 Bildirim [07 §9 disclosures]
`Disclosure {disclosure_index:int, disclosure_oid, stock_codes:string[], related_stocks:string[], primary_ticker|null, company_name, disclosure_class: ODA|FR|DG|DKB|DUY, disclosure_type, subject, summary, reason: NEW|UPD|CORR|CANC, related_index|null, is_late, attachment_count, has_multilang, is_noise, subject_route: noise|E1|E2|E3|E4|llm|avoid:<kod>|archive_only, subject_map_version, published_at, first_seen_at, available_at, ingest_source: live|backfill|reconcile|demo, is_fixture (panel: ingest_source==='demo')}` · `DisclosureText {lang: tr|en, body}`.

### 6.2 Ön eleme ve koruma [05 §5.0]
`RouteResult {route, sub_type_hint|null, table_version}` · `PreGateResult {passed, reasons: string[]}` (R03/R04/R13 kodları) · `GuardResult {quarantined, injection_score 0–1, regex_hits[], chunks_scored, masked_names_n}` (≥ 0,90 karantina; 0,50–0,90 yumuşak → uyum en az escalate).

### 6.3 Ortak ajan tipleri [05]
`SourceQuote {field, quote}` · `AbstainInfo {reason: insufficient_text|ambiguous|out_of_scope|conflicting_values|suspected_injection|attachment_missing|other, detail_tr}` · `AgentRunMeta {agent, prompt_id, prompt_version, prompt_sha256, model_id, degraded, input_sha256, output_sha256, tokens_in, tokens_out, latency_ms, cached, repair_attempted, quote_check: pass|partial|fail|n/a}`.

### 6.4 Altı ajan çıktısı [05]
- **ClassifierOutput** `{status: ok|abstain, event_type: E1|E2|E3|E4|FILTER|IGNORE, sub_type, direction, is_correction_or_update, refers_to_prior_disclosure_date|null, injection_suspected, confidence, rationale_tr ≤400, quotes 1–3, abstain|null}` — eşik 0,80.
- **Reader** (`ReaderBase {status, confidence, injection_suspected, quotes 1–8, notes_tr, abstain}`, eşik 0,75) + türe göre: **BuybackExtraction** (E1: `nature`, `in_programme`, `transactions: BuybackTxn{trade_date, nominal_tl, capital_pct, price_tl, price_raw, prior_nominal_in_program_tl}[]`, kümülatif alanlar, `venue`), **InsiderTradeExtraction** (E2: `filer_kind`, `person_or_entity` (maskeli `KİŞİ_n`), `role`, `legal_basis`, `direction`, `trades[]`, holdings before/after, `open_market`, `non_market_reason`), **ContractExtraction** (E3: `counterparty_role`, `counterparty_name`, `counterparty_disclosed`, `counterparty_domestic`, `counterparty_public_sector`, `subject_tr`, `amount`, `currency`, `amount_raw`, `amount_try_stated`, `vat`, `amount_is_estimate`, `duration_months`, `start_date`, `binding_status`, `related_party`, `is_renewal_or_extension`, `stated_share_of_revenue_pct`, `stated_effect`), **FinancialReportExtraction** (E4: `period`, `report_kind`, `consolidated`, `tms29_applied`, `audit_opinion`, `going_concern_emphasis`, `guidance_direction`, `guidance_statements_tr`, `one_off_items`, `management_tone`, `risk_mentions_tr`).
- **MaterialityOutput** `{status, event_type, denominator_kind, denominator: ValueRef{name, value, ref_id}, revenue_available_at_as_of, market_cap: ValueRef, fx_rates: ValueRef[], trade_day_close, secondary[], e4_lines[], financials_period_end, financials_stale_days, data_gaps[], confidence (eşik 0,70), notes_tr, abstain}` — **oran içermez**.
- **EvidenceSelection** `{status, event_type, search_queries[], candidates_considered, selected: {ref_id:'evt:…', relevance: high|medium, why_similar_tr}[], same_ticker_selected, exclusion_reasons[], already_announced_before, already_announced_ref, proposed_strength, summary_tr, confidence, abstain}` → **EvidenceCard** (kodla) `{selection, stats: EventStats{ref_id, n, n_same_ticker, median_car_5d, mean_car_5d, hit_rate_5d, median_car_20d, mean_car_20d, hit_rate_20d, ci95_car_20d:[lo,hi], dispersion_iqr_20d}, strength: strong(n≥15)|moderate(8–14)|weak(5–7)|insufficient(<5), retrieved_ids[], card_id}`. Panel ek olarak örnek olay satırlarını (`EvidenceEvent {ref_id, ticker, published_at, title, car_1d, car_5d, car_20d, car_60d}`) `explain` yükünden okur [US-11].
- **SkepticOutput** `{status, flags: {code: FlagCode, severity: info|reduce|veto, detail_tr, supporting_ref}[], size_multiplier: 1|0.75|0.5|0.25, veto, strongest_counterargument_tr, confidence (eşik 0,6), abstain}`; FlagCode: DUPLICATE_OR_CORRECTION, NOT_BINDING, RELATED_PARTY, RENEWAL_NOT_NEW, TOKEN_BUYBACK, NOT_OPEN_MARKET, FUND_NOT_INSIDER, DILUTION_OR_HYPE, MANIPULATION_MARKERS, AMOUNT_NOT_IN_TEXT, STALE_OR_WEAK_FINANCIALS, WEAK_EVIDENCE, INJECTION_SUSPECT, OTHER.
- **ComplianceReport** `{status, decision: pass|escalate|veto, checks 6–10: {code: CheckCode, result: pass|fail|escalate|unknown, basis_ref, detail_tr}[], regulation_refs[], summary_tr, confidence, abstain}`; CheckCode: SPK_MEASURE, VBTS_MEASURE, WATCHLIST_MARKET, TRADING_HALT, INFO_PUBLIC, MARKET_ABUSE_RISK, RESTRICTED_LIST, SIGNAL_SHARING, PROMPT_INJECTION, RATIONALE_INTEGRITY (zorunlu altı: SPK_MEASURE, VBTS_MEASURE, WATCHLIST_MARKET, INFO_PUBLIC, PROMPT_INJECTION, RATIONALE_INTEGRITY).

### 6.5 Birleştirme ve kural motoru [05 §5.0, 06]
- **MergedFeatures**: kimlikler (`run_id, disclosure_index, ticker, as_of, event_type, sub_type`), ajan durum/güvenleri, `any_injection_flag`, `degraded`; E1 (`e1_nature, new_buyback_rows, buyback_10d_capital_pct, buyback_10d_notice_count, buyback_sale_within_20d`); E2 (`insider_role_class, insider_open_market, insider_net_buy_value_try, insider_buy_to_ff_mcap, insider_cluster_30d, ret_3m`); tutar kontrolü (`reader_amount, regex_amounts[], amount_in_text`); E3 (`binding, related_party, renewal, amount_try, amount_to_revenue_annualized, amount_to_mcap, e3_denominator`); E4 (`e4_*` serbest kayıt); piyasa (`last_price, price_at, upper_limit, lower_limit, adv20_try, free_float_pct, leakage_5d_mkt_adj, ret_10d_mkt_adj`); kanıt (`evidence_card_id, evidence_strength, evidence_n, evidence_median_car_5d, evidence_median_car_20d, evidence_ids, retrieved_ids`); `flags`. Hepsi nullable.
- **RuleTraceEntry** `{rule: 'E3.materiality'|'E3.binding'|…, passed, observed|null, threshold|null, detail_tr}` [04 §6.1] · **RuleDecision** `{outcome: PROPOSE|NO_TRADE|HOLD, proposal|null, reason_codes[], rules_fired[], rules_hash, trace: RuleTraceEntry[]}`; reason code tüketim sırası: HOLD_AGENT_FAILED → HOLD_AGENT_ABSTAIN → HOLD_LOW_CONFIDENCE → HOLD_UNSUPPORTED_VETO → SKEPTIC_VETO → AVOID_LIST → NO_EVIDENCE → INJECTION_REVIEW → E{n}_RULE_NOT_MET → LEAKAGE_HALF/LEAKAGE_SKIP → E{n}_RULE_MET.

### 6.6 Risk kapısı R01–R16 [06 §10]
Çalışma sırası: R01 → R02 → R03 → R04 → R13 → R11 → R14 → R05 → R06 → R09 → R12 → R07 → R08 → R10 → R15; R16 gönderim anında. `RiskCheck {phase: pre_trade|at_send, rule_code: R01…R16, outcome: pass|resize|reject|hold|approval_required, reason_code, detail_tr, observed|null, limit|null}`. Panel her kuralın Türkçe adını `RISK_RULES` sabitinden alır (R01 kill switch/zirveden −%5 · R02 günlük −%1 · R03 evren · R04 tedbir (+ >24 sa bayat) · R05 kanıt · R06 avantaj ≥ 2× maliyet · R07 büyüklük · R08 portföy limitleri · R09 fiyat bandı/tavan/bayat fiyat · R10 kriz rejimi · R11 kota/KAP gecikmesi/şema/injection · R12 açığa satış/kaldıraç/silahlanmamış · R13 ekip engel listesi · R14 tutar uyuşmazlığı · R15 onay zorunlu · R16 gönderim anı kontrolü).

### 6.7 Öneri, onay [05]
- **TradeProposal** `{proposal_id, run_id, strategy_version, rules_hash, prompt_manifest_hash, disclosure_index, ticker, venue:'BIST', side: buy|sell (sell yalnızca çıkış), event_type: E1–E4|EXIT, rule_ids[], entry: next_open_auction|intraday_limit, limit_price, ref_price, ref_price_at, requested_notional_try, requested_qty, stop_price, holding_days_min, holding_days_max, exit_rules[], expected_edge_bps, est_cost_bps, multipliers{evidence, skeptic, leakage, regime}, confidence, evidence_card_id, evidence_ids[], retrieved_ids[], escalate_required, degraded}`.
- **ApprovalCard** `{kind:'trade_approval', proposal_id, run_id, ticker, company_name, side, event_type, disclosure_index, disclosure_url, final_notional_try, requested_notional_try, limit_price, entry, holding_days:[min,max], level: normal|escalate, escalation_reasons: (COMPLIANCE_ESCALATE|DEGRADED|NEAR_MAX_POSITIONS|RESTRICTED_SELL|RESIZED)[], evidence_summary{n, median_car_5d, median_car_20d, strength, card_id}, skeptic_flags[], compliance_summary_tr, rule_trace_summary: RuleTraceEntry[], degraded, prompt_manifest_hash, expires_at, status: pending|claimed|approved|rejected|expired|cancelled, is_fixture}`.
- **ApprovalDecision** `{decision: approve|reject, approved_notional_try|null (≤ final; küçültme = approve + daha küçük tutar), comment 1–500}`; sunucu `decided_by`, `role:'risk_officer'`, `decided_at` ekler.

### 6.8 Emir, dolum, pozisyon [07 §9]
`Order {id, client_order_id, proposal_id, ticker, side, order_type: market|limit, tif: day|opg, qty, limit_price, status: pending_open|accepted|awaiting_manual_entry|partially_filled|filled|canceled|rejected, created_at, broker: simbist|order_ticket}` · `Fill {id, order_id, qty, price, commission, bsmv, slippage_bps, filled_at, source: simbist|alpaca|manual}` · `Position {ticker, company_name, qty, avg_cost, last_price, opened_at, planned_exit_date, holding_days, source_proposal, run_id, event_type, strategy_version, unrealized_pnl, realized_pnl, managed_by_exit_rule}` · `OrderTicket` (§2.6 alanları, `valid_until`).
`PnlPoint {d, strategy, equity, daily_return, peak_equity, drawdown, n_positions, n_trades}`; `strategy`: `kaptan:v1.0-fwd`, `kaptan:v1.1-fwd`, `baseline:xu100_bh`, `baseline:ew_universe`, `ablation:*`.
`RiskStatus {kill_switch: off|on, kill_reason|null, kill_at|null, halted_today, daily_pnl_pct, drawdown_pct, peak_equity, equity, regime: normal|crisis, live_armed, quota{provider, used, limit}[], reset_request: KillResetRequest|null}` · `KillResetRequest {id, requested_by, requested_at, reason, confirmations: 1|2}`.

### 6.9 Audit ve limitler [07 §9, 09 §7]
`AuditEntry {seq, chain_pos, occurred_at, actor ('user:<uuid>'|'agent:<node>'|'system:<job>'), action, entity_type, entity_id, run_id|null, strategy_version|null, payload, prev_hash, hash}`; `canonical = [chain_pos, occurred_at, actor, action, entity_type, entity_id, run_id, strategy_version, payload]`, `hash = sha256(prev_hash || canonical)`, genesis `00`. `ChainVerifyResult {ok, first_bad_pos|null, kind: gap_or_duplicate|prev_hash_mismatch|fields_changed_canonical_stale|hash_mismatch|anchor_mismatch|null, checked, head_hash, verified_at, anchor{at, hash}}`.
`LimitVersion {version, status: proposed|active|superseded|rejected, reason, created_by, created_at, approved_by|null (≠ created_by), approved_at, effective_from, values: {key, value}[]}`. v1 seed: `risk_per_trade_pct 0.005, max_position_pct 0.10, max_concurrent_positions 10, target_concurrent_positions 8, max_adv_share 0.01, price_band_pct 0.02, daily_loss_halt_pct -0.01, kill_drawdown_pct -0.05, min_edge_cost_ratio 2, crisis_exposure_mult 0.5, leak_ret5d_threshold 0.08, max_sector_pct 0.25, max_group_pct 0.20` [K, 06 §9].

### 6.10 Run ve "Neden" yükü [07 agent_runs, 04 §11]
`RunSummary {run_id, disclosure_index, ticker, event_type|null, status: running|interrupted|completed|failed|hold_quota|skipped, outcome: PROPOSE|NO_TRADE|HOLD|QUARANTINED|PREGATE_VETO|null, mode: paper|personal|live|backtest|replay|demo, started_at, finished_at, llm_calls, tokens_in, tokens_out, latency_ms, strategy_version, is_fixture}` · **RunTrace** `{nodes: {node: route|pre_gate|guard|classifier|reader|materiality|evidence|merge|skeptic|rule_engine|compliance|risk_gate|request_approval|approval|execute|record|filter_action, label_tr, status: done|skipped|failed|waiting|running, started_at, latency_ms, tokens_in, tokens_out, model_id|null, cached, parallel_group|null}[], langsmith_url|null}` · **Explain** `{run, disclosure, texts, route, pre_gate, guard, classifier, reader, materiality, evidence_card, evidence_events, merged, skeptic, rule_decision, compliance, risk_checks, proposal, approval, orders, fills, ticket, audit_positions[], trace}` (her alan, düğüm çalışmadıysa `null`).

### 6.11 Sabah özeti [K, 04 §12, US-42]
`MorningBrief {date, generated_at (08:45), important_disclosures: DisclosureListItem[], orders_for_open: OrderTicket|Order[], pending_approvals: ApprovalCard[], open_positions: Position[], expiring_today: Position[], risk_warnings: {level: info|warn|critical, text_tr}[], restriction_changes: {ticker, kind, change: added|removed, at}[], summary_tr (LLM üretimi), is_sample}`.

### 6.12 Değerlendirme (4 katman) [08]
`EvalSummary {is_sample, label:'örnek değer · gerçek sonuç değil', l1: {macro_f1, target 0.85, per_class: {cls: E1|E2|E3|E4|X|O, f1, precision, recall, support}[], confusion: number[][], kappa, ece, models: {model_id, macro_f1, e3_f1}[]}, l2: {faithfulness, context_precision, context_recall, recall_at_10, mrr, time_violations, trend[]}, l3: {window:'2025-01-01 → 2026-10-31', rows: {event_type, n, car_1, car_5, car_20, car_60, t_stat, sharpe, sortino, max_dd, cost_scenario: base_005|stress_020}[]}, l4: {series: PnlPoint[], since: {v1_0: '2026-11-09', v1_1: '2026-11-23'}}, ablations: {arm: B0|B1|B2|B3|A0…A7, label_tr, sharpe, max_dd, total_return, n_trades}[], redteam: {cases, malicious, orders_from_malicious, block_rate, false_alarm_rate, by_code{Q,N,H,F}}, latency: {p50_s, p95_s}, cost: {calls, tokens, per_decision_tokens}}`.

---

## 7. Demo senaryosu → rota, fikstür, arayüz anı [11 §2]

Demo **Risk Officer** sekmesinde başlar; ikinci sekme/rol **Admin** (mock'ta rol değiştirici). Tüm enjekte öğeler "DEMO FİKSTÜRÜ" etiketli. "Senaryo" menüsü üst barda (yalnızca D, demo modu; mock'ta herkese görünür ama yalnızca D çalıştırır — S4 rehberli demo modu bu menüyü ve adım şeridini sahiplenir). Fikstür kimlikleri `src/mocks/ids.ts` içindedir (PANEL-CONTRACT.md'de listelenir).

| Adım · süre | Rota | Fikstür (ID) | Arayüz anı |
|---|---|---|---|
| 1 · 0:00–0:40 Canlı akış | `/inbox` | gün fikstürü (2027-01-11, 318 bildirim); 13:40 itibarıyla sayaç `212 · 61 · 138 · 13` | sayaç cümlesi, TR/EN rozetleri, "LLM maliyeti: 31 çağrı · ~0,4M token" rozeti; mock SSE yeni bildirim ekler |
| 2a · 0:40 E3 sözleşme enjekte | Senaryo → "E3: Yeni iş ilişkisi" | `DEMO_E3_INDEX` (ORNEK, ÖRNEK ENERJİ A.Ş.), `DEMO_E3_RUN` | yeni kart "ÖRNEK ENERJİ A.Ş. — yıllık gelirin %18'i tutarında bağlayıcı sözleşme"; durum *Sınıflandırılıyor…* |
| 2b · graf | `/runs/DEMO_E3_RUN` | aynı | iz: Sınıflandırıcı → E3 (0,93); Okuyucu ‖ Önemlilik ‖ Kanıt aynı anda; Birleştirme "Tutar / yıllık gelir = %18 · tutar metinde doğrulandı ✓" |
| 2c · kanıt | `/runs/…#kanit` | `DEMO_E3_EVIDENCE` | "Benzer 23 olay · ort. 5 günlük anormal getiri +%1,4 · isabet %61 · %95 GA" + örnek olaylar |
| 2d · şüpheci | `#supheci` | — | "Bildirimden önceki 2 seansta +%3,6 anormal hareket … %50 küçültülsün" (×0,5) |
| 2e · kural/uyum/risk | `#kural`, `#uyum`, `#risk` | — | E3 ✓ (≥ %10, bağlayıcı, ilişkili taraf değil) · sızıntı < %8 ✓ · avantaj ≥ 2× ✓ → TradeProposal JSON; uyum ✓; risk: işlem riski %0,5, pozisyon %4,2, hacmin %0,3'ü, bant ±%2 ✓ |
| 2f · onay | `/approvals` → kart `DEMO_E3_PROPOSAL` | — | Onayla + yorum + TOTP → *SimBIST'e gönderildi* → toast "Dolum: 1.240 lot @ 48,32 TL"; `fill` SSE |
| 2g · iz | `/runs/…#iz` | — | ajan iz zaman çizelgesi + LangSmith bağlantısı (mock: "örneklenmedi" yerine temsili bağlantı yok) |
| 3a · 2:30 kötü niyetli | Senaryo → "Red-team: gizli talimat" → `/runs/DEMO_INJ_RUN` | `DEMO_INJ_INDEX` (ticker DMOGD, metinde "SİSTEM NOTU: …" fikstür metni) | Prompt Guard 0,98, TR regex eşleşmesi, Uyum **RET**, kırmızı rozet, "Kural motoruna ulaşmadı" |
| 3b · tedbirli hisse | Senaryo → "Tedbirli hisse" → `/runs/DEMO_R04_RUN` | `DEMO_R04_INDEX` (TMSLJ, brüt takas) | Ön eleme **SERT VETO (R04)**, "LLM çağrısı 0", audit satırında mevzuat atfı |
| 4a · 3:30 zarar | Senaryo → "Zarar simülasyonu" → `/portfolio` | mock zarar adımları | eğri düşer; %-1 sarı "YENİ EMİR DURDU"; %-5 kırmızı KILL SWITCH; açık emirler iptal; pozisyonlarda "çıkış kuralıyla yönetiliyor" |
| 4b · reset | `/portfolio` | — | **Admin** "Sıfırlamayı başlat" → "Risk Officer onayı gerekiyor (1/2)"; **Risk Officer** "Onayla" → "Reset onaylandı (2/2)" (§9 Ç-8) |
| 4c · audit | `/audit` | 4.812 kayıtlık zincir | "Zinciri doğrula" → "4.812 kayıt · hash zinciri geçerli ✓"; "Kurcalama testi" (#3.907) → "Kayıt #3.907'de zincir kırık ✗" |
| 5 · 4:20 sonuçlar | `/eval` | eval fikstürü | holdout tablosu, v1.0/v1.1 eğrileri vs BIST-100 ve eşit ağırlık, ablation tablosu; "örnek değer · gerçek sonuç değil" |
| 6 · 4:50 kişisel mod | `/portfolio?sekme=fis` | `DEMO_TICKET` | "ÖRNEK ENERJİ A.Ş. · LİMİT 48,40 · 620 lot · 30 dk geçerli · Manuel giriş" |

---

## 8. İçerik ve uyum kuralları

1. **Feragatname** her ekranın altında (§2 metni) [09 §10.1, NFR-20]. LLM metni "LLM üretimi, doğrulanmamış" etiketiyle; aciliyet dili ("hemen al", "kaçırma") işaretlenir [09 §10.1].
2. **Kurgusal ihraççılar**: yalnızca açıkça kurgusal adlar (ÖRNEK ENERJİ A.Ş. / ORNEK, DEMO GIDA A.Ş. / DMOGD, TEMSİLİ LOJİSTİK A.Ş. / TMSLJ, KURGU MADEN A.Ş. / KRGMD …). Gerçek şirket adı, gerçek fiyat, gerçek sinyal yok; KAP/BIST/SPK marka veya arayüz taklidi yok; fikstür satırlarında "Temsili" [BRIEF §0]. KAP bağlantısı fikstürde tıklanabilir değildir.
3. **Fikstür ayrımı**: mock modunda üstte "DEMO VERİSİ" şeridi; enjekte edilen öğelerde "DEMO FİKSTÜRÜ" [11 §4]. Canlı sayaç http modunda her zaman gerçektir.
4. **Uydurma sonuç yok**: eval ve P&L fikstürleri "örnek değer · gerçek sonuç değil" etiketlidir.
5. **Paylaşım yok**: sinyal/fiş paylaşma, sosyal medya, dışa aktarma düğmesi yok (audit dışa aktarımı hariç, kişi adı içermez) [FR-27, 09 §5].
6. **KVKK**: kişi adları `KİŞİ_n` maskeli gösterilir [05 guard, 09 §9].
7. **Dil**: Türkçe, "siz", sakin ve somut; terimler TR (gerekirse EN parantezde) [14]. Büyük harf CSS `text-transform` + `lang="tr"`; sayılar `tr-TR` (1.240 lot, 48,32 TL, %18).
8. **Renk görevleri** [DESIGN §2, görev tanımı]: kâğıt `#F3F1EC`, panel `#FBFAF6`, sumi `#121318`, çivit yıkama `#2B4261`, soluk `#666663`; **kuzey kırmızısı `#B3261E` yalnızca kill switch, veto/ret ve kritik durumlar**; kaptan laciverti `#0E3A66` wordmark, odak halkası, seçim. Kare köşeler, 1,5 px mürekkep çizgi, seyrek sert ofset gölge. Bodoni Moda başlık ve büyük rakamlar; Inter arayüz; mono yalnızca kodlar (E1–E4, R01–R16, hash, ticker). Yasaklı "AI izi" kalıpları [DESIGN §7]: bulanık gölge, yuvarlak kart, degrade parıltı, tracked uppercase mono etiket.
9. **Erişilebilirlik** [DESIGN §8, NFR-21]: WCAG AA, tam klavye, görünür odak (2 px lacivert, 2 px ofset), 12 px altı metin yok, hedefler ≥ 32 px yoğun araçta (birincil eylemler ≥ 40 px), `prefers-reduced-motion`.

---

## 9. Belge çelişkileri ve çözümleri

| # | Çelişki | Kaynaklar | Çözüm |
|---|---|---|---|
| Ç-1 | Alan adları: 04'te `event_code`/`NONE`, `approved_notional`; 05'te `event_type`, `approved_notional_try` | 04 §5.3 vs 05 | Kod 05 adlarını kullanır (14 başlık notu: kodda İngilizce, 05 tek şema kaynağı). Sorgu parametresi `event_code` 04'teki gibi kalır. |
| Ç-2 | Sınıf etiketleri X/O (08, PRD, 14 #79) vs FILTER/IGNORE (05) | 08 §1, 05 | Alan değeri FILTER/IGNORE; arayüz "X · Filtre/kaçınma", "O · Diğer" gösterir; eval L1 X/O kullanır. Eşleme `src/lib/domain/labels.ts`. |
| Ç-3 | Sabah özeti 08:30 (04 §4.1, §12) vs 08:45 | 04, K, FR-35 | **08:45** (kanonik). |
| Ç-4 | Ekran rolleri: 04 §12 Inbox ARD, Approvals "R (A görür)", Brief ARD; 09 §5 tüm görüntülemeyi 4 role açar | 04 §12, 09 §5 | 09 §5 (yetki tek kaynağı, `VIEW` her rolde) kazanır: tüm görüntüleme ekranları ARDU; eylemler 04 §11'e göre kısıtlı. `/admin` yalnızca D. |
| Ç-5 | Audit görüntüleme: 04 §11–12 R D U; 09 §5 Analist "✓ (görme)" | 04, 09 | Analist `/audit`'i görür; doğrulama/dışa aktarma R D U (04 uç rolleri). |
| Ç-6 | Brief için Auditor | 04 (ARD) vs 09 (VIEW) | Ç-4 gereği U görür. |
| Ç-7 | Demo `/desk` rotası, "Canlı Akış", "Kişisel mod" sekmesi ve "DEMO A.Ş." | 11 §2 vs 04 §12, BRIEF | `/desk` yok → `/inbox`; "Kişisel mod" → `/portfolio?sekme=fis`; "DEMO A.Ş." → "ÖRNEK ENERJİ A.Ş." (BRIEF kurgusal ad kuralı). |
| Ç-8 | Reset sırası: 11 Adım 4 "Risk Officer Sıfırla → Admin onaylar" vs Admin başlatır, R onaylar | 11 vs 09 §5, 04 §11 | **D başlatır, R onaylar** (09/04 uçları). Demo betiği buna göre okunur: Admin sekmesinde başlat (1/2), Risk Officer onay (2/2). |
| Ç-9 | Onay kararı: 05 approve/reject (+ küçültme tutarla), 04 "Onayla / Küçült / Reddet", bazı yerlerde "expire" | 05, 04 §12 | Kullanıcı kararı approve/reject; "Küçült" = approve + `approved_notional_try` < final; `expired` yalnızca sistem durumudur. |
| Ç-10 | Onay süresi: mühendislik planı TTL vs 09:50 | 04-derin/05, K | Bir sonraki seansın **09:50**'si (R15). |
| Ç-11 | Risk parametreleri: 05 RiskParams ve mühendislik planı vs kanonik limitler | 05, K, 06 §9 | Kanonik değerler (§6.9). |
| Ç-12 | Sayaç akışı: 04 SSE listesinde `counters` olayı yok | 04 §11 vs US-43, NFR-03 | Panel `counters` olayını `/stream/feed` üzerinde bekler; yoksa `disclosure` olaylarından yerelde artırır. Backend'e öneri olarak not edildi. |
| Ç-13 | Tutar çapraz kontrolü: eski "iki ajan, > %5 fark" vs regex + R14 | 04-derin vs K, 05 | Regex + R14 (tolerans %0,5); arayüz "tutar metinde doğrulandı ✓/✗" gösterir. |
| Ç-14 | Bildirim sayısı ~350 (02, 14) vs ~270–350 (11) | 02, 11 | Fikstür 318 (aralık içinde). |
| Ç-15 | Mock'ta TOTP adım-yukarı | 09 §6 | Mock: 6 hanelik herhangi bir kod kabul edilir, demo kodu `000000` ipucu yalnızca mock'ta görünür. http: gerçek TOTP. |
| Ç-16 | Oturum: JWT bellekte + `__Host-kaptan_rt` vs Next proxy (sunucuda) rol koruması | 09 §6 | http modunda `/api/v1/*` Next rewrite ile aynı origin'e alınır (refresh çerezi birinci taraf); proxy yalnızca çerez varlığını denetler, rol yetkisi API'de ve istemci `RoleGate`'te uygulanır. Mock: `kaptan_mock_session` çerezi (rol + kullanıcı) proxy'de okunur. |
| Ç-17 | Demo dolumu "1.240 lot @ 48,32" vs "özsermayenin %4,2'si" | 11 Adım 2 | 1.240 × 48,32 = 59.917 TL, örnek özsermaye 1.016.480 TL'nin **%5,9**'u (R07 %10 sınırının altında). Dolum değerleri korundu; arayüz oranı hesaplar, sabit "%4,2" yazmaz. |
| Ç-18 | Kişisel mod emir fişi: 620 lot @ 48,40 ≈ 30.008 TL, paper özsermayesiyle R07 tutarsızlığı riski | 11 Adım 6 | Fiş ayrı bir örnek hesaba bağlıdır (özsermaye 350.000 TL → %8,6, R07 geçer); fiş üzerinde "Kişisel mod · örnek hesap" etiketi. |
| Ç-19 | Belgelerde yalnızca `/runs/[id]` var; çalıştırma listesine giriş yok | 04 §12 | `/runs` liste rotası eklendi (sahibi S1): durum, sonuç, LLM çağrısı, sürüm; satır → `/runs/[id]`. |

---

## 10. Teknik kararlar (özet)

- Next.js 16.3 App Router (`proxy.ts`, eski adıyla middleware), React 19.2, strict TS 5.9, Tailwind v4 (CSS-first `@theme`), Radix (`radix-ui`) tabanlı shadcn tarzı primitifler (yeniden çizilmiş), zod 4, Recharts 3, cmdk, sonner, `@noble/hashes` (senkron sha256), vitest 5 + Testing Library, Playwright 1.63 (`channel: 'msedge'`).
- `NEXT_PUBLIC_API_MODE=mock|http` (varsayılan mock). Mock durumu tarayıcıda, `localStorage` destekli oturum deposu (rol değişse de kalır; "Demo verisini sıfırla" ile temizlenir).
- Fikstür üreticisi deterministik (sabit tohum, mulberry32). Mock saat sabit: **11.01.2027 Pazartesi 13:40** (ders saati, BIST açık) ve gerçek zamanla ilerler.
- Vercel: Root Directory `kaptan-panel`, env gerektirmez.
