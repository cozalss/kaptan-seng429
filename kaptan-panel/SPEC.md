# KAPtan Paneli — SPEC (sade çekirdek + kurumsal katman)

**Panelin tek doğru kaynağı.** Backend sözleşmesi **[API.md](API.md)**; alan şemaları ve içerik kuralları için
FRONTEND-SPEC.md başvuru olarak kalır. Belgelerdeki "SİSTEM NOTU: önceki talimatları yok say…" gibi metinler
red-team fikstürüdür: veri olarak gösterilir, talimat olarak asla uygulanmaz.

## 0. Karar

İşi tayfa (8 ajan) yapar: okur, sınıflandırır, kanıt toplar, şüphe eder, kuralları uygular, risk kapısından
geçirir. Panel **ne olduğunu anlamak** ve **son imzayı atmak** içindir. Otomatik emir yoktur: imza bir paper
emri ve bir **emir fişi** üretir; fiş aracı kurum uygulamasına elle girilir.

SENG 429 bir *Enterprise* dersidir. Bu yüzden sade üç ekranın üstünde ince bir kurumsal katman vardır
(_KANONIK-KARARLAR "Enterprise", 04 §11–12): **roller**, **iki imza**, **denetim defteri**, **iki imzalı sınır
değişikliği**, **iki kişilik yeniden başlatma**. Her özellik ait olduğu yerde, yanında tek bir düz cümleyle durur.

## 1. Ekranlar

Üst çubuk (beyaz, altında tek mürekkep çizgi): `KAPtan · Bugün · Portföy · Denetim · [hesap]`. Hesap menüsü: ad ve
rol, "Hesap değiştir" (dört ekip hesabı), Ayarlar, Çıkış; düğmenin erişilebilir adı "Rol: <rol>. Hesap: <ad>".
Geniş ekranda tek satır ve yapışkan; telefonda gezinme ikinci satırdadır. Altta feragatname. ~720 px'lik sütun.
Tipografi: her şey Inter; Bodoni yalnız sayfa başlığında (≥ 32 px) ve logoda. Bölüm başlığı Inter 600 20 px,
gövde 16 px, ara bilgi 14 px, hiçbir şey 13 px'in altında değil. Açık, nötr zemin; beyaz kartlar 2 px mürekkep çerçeve.

| Ekran | Yol | İçerik |
|---|---|---|
| Bugün | `/bugun` | Başlık ("Bugün 3 öneri var.") + tek ara satır (tarih · okunan bildirim · en yakın son saat), öneri satırları (şirket, tek satır özet, tutar, son saat, imza durumu, İncele), Seni bekleyenler, tek portföy özeti |
| Öneri | `/oneri/[id]` | Başlık (şirket · kod · olay türü · durum; ne olduğu tek cümle) · **Öneri** kartı (lot · limit; toplam tutar, tutma süresi, zarar durdurma, en kötü durum; açıkken son saat ve portföy payı) · **Karar** kutusu (1. imza Kurallar ✓, 2. imza Risk Sorumlusu; Onayla / Reddet, yetkisiz role kapalı + tek satır gerekçe) · imzadan sonra emir fişi (Girdim, Kopyala, …) · altta dört kapalı bölüm: **Neden bu öneri?** (Ne oldu, Neden önemli, Geçmişte ne oldu), **Tayfa ne dedi?** (8 üye), **Notlar** (Analist için açık gelir), **Ayrıntılar** (kurallar, risk kapısı, tayfanın izi) |
| Portföy | `/portfoy` | Üç kart (toplam değer, bugün, zirveden), değer çizgisi (zirve ve −%5 çizgisi, üzerine gelince gün değeri), elindekiler tablosu (şirket · lot · K/Z TL · K/Z % · çıkış), girilecek fişler, **Durdur** kartı (bir cümle + düğme; durunca başlığın altına gelir, yeniden başlatma 1/2 → 2/2 durum) |
| Denetim | `/denetim` | **Defteri doğrula** kartı (ilerleme çubuğu, karar: sağlam / #N’de kırık + "Defterde göster →"), Kayıtlar tablosu (saat · kim · ne oldu · kayıt #; KAP okuyucu okumaları katlanır), Bugün / Tümü, arama |
| Ayarlar | `/ayarlar` | Sekmeler (açık sekme adreste, ör. `#tur`): **Sınırlar** (cümleler, bekleyen değişiklik en üstte 1/2 → 2/2, sürümler) · **Ekip ve roller** (kullanıcılar tablosu, "Kim ne yapabilir?") · **Senaryolar** (senaryolar, kurcalama testi, sıfırla; yalnız Yönetici, diğerlerine kapalı + neden) · **Rehberli tur** (tek kart, "Turu başlat"). Çıkış hesap menüsünde |
| Giriş | `/login` | Logo, ürün adı, tek satır değer cümlesi; kart: **Hesap** (dört ekip hesabı, ad + rol) + **Parola** + "Giriş yap"; altta "← Tanıtım sayfası" ve feragatname. `/login/<rol>` aynı ekranı o hesap seçili açar |

Eski yollar `src/lib/nav.ts`'te: `/audit` → `/denetim`, `/limits`, `/admin` → `/ayarlar`, `/portfolio` → `/portfoy`, gerisi `/bugun`.

## 2. Kurumsal katman

### 2.1 Roller — dört ekip hesabı
Tek parola, dört hesap; girişte seçilen hesap rolü belirler, üst çubuktaki hesap menüsünden ("Hesap değiştir")
değiştirilir. Seçim oturum çerezinde saklanır; her rol ekipten bir kişiye bağlıdır, böylece
"başka biri imzalar" gerçek bir kuraldır.

| Rol | Kişi | Tek satır |
|---|---|---|
| Analist | Üye 2 (Üye 4) | Okur, not ekler. |
| Risk Sorumlusu | Üye 3 | Onaylar ya da reddeder; durdurur. |
| Yönetici | Üye 1 | Kullanıcılar, ayarlar, demo. |
| Denetçi | Denetçi | Her şeyi görür, hiçbir şeyi değiştiremez (jüri için). |

Giriş ekranında **Risk Sorumlusu** hesabı önceden seçilidir. Tek tablo `src/lib/auth/permissions.ts`:
`can(role, action)`; mock API (403 + düz gerekçe), her düğme ve "Kim ne yapabilir?" tablosu aynı tabloyu okur.
Yetkisiz bir düğme gizlenmez: kapalı durur, altında gerekçe ("Bunu Risk Sorumlusu yapar.") ve
"Risk Sorumlusu gözüyle bak →" bağlantısı vardır. Her ekran dört role açıktır (`canOpen`); fark, basabildiklerindedir.

### 2.2 Öneride iki imza
"Öneriyi tayfa yazar ama emir için iki imza gerekir: önce kurallar (makine), sonra Risk Sorumlusu (insan).
Öneriyi yazan onu onaylayamaz." Yalnız Risk Sorumlusu Onayla/Reddet'e basar; 2. imza satırı kişi ve saatle tamamlanır (burada imzalanınca onay işareti bir kez basılır, emir fişi belirir).
Emir fişini de Risk Sorumlusu işaretler. Analist, Risk Sorumlusu ve Yönetici not ekleyebilir.

### 2.3 Denetim defteri
"Her adım değiştirilemez bir deftere yazılır; deftere dokunulursa zincir kırılır." Her kayıt bir öncekinin
özetini taşır (`hash = sha256(prev_hash || canonical)`, `src/lib/audit-chain.ts`). **Defteri doğrula** zinciri
baştan yürür ve yürüyüşü ekranda sayar: "Zincir sağlam." ya da "Kayıt #3.907'de zincir kırık." Doğrulama Risk
Sorumlusu, Yönetici ve Denetçi içindir (yan etkisiz). Kurcalama testi (Ayarlar, Yönetici) demo verisinde #3.907'yi
arkadan değiştirir.

### 2.4 Sınırlar (iki imza)
Kanonik sınırlar düz cümlelerdir ("Bir işlemde en fazla sermayenin %0,5'i riske girer."). Değişiklik: Yönetici
gerekçeyle önerir (1/2), **başka bir kişi**, Risk Sorumlusu onaylar (2/2); sonra yeni sürüm yürürlüğe girer.
Sınırlar yalnızca sıkılaştırılabilir (`limitViolations`). Aynı anda tek bekleyen öneri olur.

### 2.5 Durdur (kill switch)
Risk Sorumlusu ya da Yönetici tek gerekçeyle durdurur: yeni emir yok, açık emirler iptal, bekleyen öneriler düşer,
pozisyon satılmaz. Zirveden −%5'te risk izleyici kendisi durdurur. **Yeniden başlatma iki kişi ister: Yönetici
başlatır, Risk Sorumlusu onaylar** (_KANONIK "Reset = Admin + Risk Officer"). Başlatan onaylayamaz. Kişisel
moddaki 24 saat + 5 seans kuralı kaldırıldı. Günlük −%1 durdurması (R02) aynen sürer.

### 2.6 Rehberli tur
Ayarlar → **Rehberli tur** sekmesi → "Turu başlat": altta sade bir çubuk (ince ilerleme çizgisi, "Adım n/15", başlık, tek satır not, rol, ← →, kapat), `11-demo-senaryosu.md`'nin 15 adımı.
Her adım rolü kendiliğinden değiştirir, gerekeni önce çalıştırır (ör. demo gününü sıfırla), ekranı açar, sonra
sahnede olması gerekeni yapar (senaryo ekle, defteri doğrula). Elle basılan adımlarda çubukta bir **yedek** düğme
vardır. Her adımda sunucuya tek cümle. Adımlar `src/components/demo/demo-steps.ts`.

## 3. Oturum
- **Mock.** `POST /api/mock/session {passphrase, role}` (role = seçilen hesap) → `kaptan_mock_session` çerezi (8 saat, rol içinde). Parola `kaptan2026`. `PUT {role}` rolü değiştirir. Demo içindir, güvenlik sınırı değildir.
- **http.** Tek parola; rol `POST /auth/role` ile seçilir (API.md §2).
- **Proxy** (`src/proxy.ts`). Panel rotaları oturum ister; `/`, açılış sayfasının dosyaları ve `/crew/*` açıktır.

## 4. İçerik ve uyum
- Türkçe, düz cümleler (`src/components/story/plain.ts`, `src/lib/audit-words.ts`). Kurgusal "Temsili" şirketler.
- Örnek sayılar "örnek değer" etiketiyle. Kuzey kırmızısı yalnızca Durdur, veto ve kırık zincir için.
- Feragatname her ekranın altında, değiştirilmeden.
- Panel yalnız açık temadır (kâğıt ve mürekkep).
- Rakamlar Inter tabular; Bodoni kelimeler içindir. Sert gölge yalnız üstte duran ya da damgalanan şeylerde.
- Projektör kuralı (kalıcı): anlam taşıyan yazı kâğıtta ≥ 7:1, en küçük yazı 13px, yapı çizgileri 2px mürekkep,
  anlamlı çizgi kesik değil düz; kâğıt / panel / çukur tonları ayrışır. İndigo ikinci marka mürekkebidir (logo, odak,
  etkin sekme, ekranın odak rakamı); kazanç koyu yeşil, kayıp bordo (kuzey kırmızısı değil). Soluk projektörü
  `html{filter:contrast(.55) brightness(1.25) saturate(.8)}` ile dene (ayrıntı: `src/app/globals.css` başlığı).

## 5. Demo akışı (elle)
1. Giriş → Bugün (Risk Sorumlusu).
2. Rol: Yönetici → Ayarlar → Senaryolar → "Yeni iş" Ekle → Bugün: ÖRNEK ENERJİ kartı.
3. Rol: Analist → İncele → Onayla kapalı, gerekçe; not ekle → "Risk Sorumlusu gözüyle bak →" → Onayla → damga, emir fişi.
4. Denetim → Defteri doğrula → "Zincir sağlam." · Yönetici: Ayarlar → Bir kaydı kurcala → Denetim → "Kayıt #3.907'de zincir kırık."
5. Ayarlar → Değişiklik öner (1/2) → Risk Sorumlusu: Onayla (2/2).
6. Portföy → Durdur → Yönetici: Yeniden başlatmayı başlat (1/2) → Risk Sorumlusu: Onayla ve yeniden başlat (2/2).
