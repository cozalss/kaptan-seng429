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

Üst çubuk: `KAPtan · Bugün · Portföy · Denetim · [rol] · ⚙` (⚙: Ayarlar, Çıkış). Telefonda rol seçici ikinci
ince satıra iner. Üstte DEMO şeridi, altta feragatname. ~720 px'lik sakin sütun.

| Ekran | Yol | İçerik |
|---|---|---|
| Bugün | `/bugun` | Büyük cümle, karar saati, öneri kartları, portföy satırı, tayfa satırı |
| Öneri | `/oneri/[id]` | Hikâye (Ne oldu? → … → Risk) · **İki imza** (Tayfa önerdi → Kurallar onayladı → Risk Sorumlusu imzalar) · Onayla / Reddet · emir fişi · **Notlar** · Tüm ayrıntılar |
| Portföy | `/portfoy` | Toplam, çizgi, elindekiler, girilecek fişler, **Durdur** (iki damgalı yeniden başlatma) |
| Denetim | `/denetim` | Düz zaman çizelgesi (kim · ne · ne zaman · hash çipi), **Defteri doğrula**, Bugün / Tümü, arama |
| Ayarlar | `/ayarlar` | **Sınırlar** (cümleler, iki imzalı değişiklik, sürümler) · **Ekip ve roller** (kullanıcılar, "Kim ne yapabilir?") · **Demo** (Rehberli demo, senaryolar, kurcalama testi, sıfırla) · Çıkış |
| Giriş | `/login` | Tek parola, "← Tanıtım sayfası" |

Eski yollar `src/lib/nav.ts`'te: `/audit` → `/denetim`, `/limits`, `/admin` → `/ayarlar`, `/portfolio` → `/portfoy`, gerisi `/bugun`.

## 2. Kurumsal katman

### 2.1 Roller — "Kimin gözüyle bakıyorsun?"
Tek giriş (tek parola), dört rol. Seçim oturum çerezinde saklanır; her rol ekipten bir kişiye bağlıdır, böylece
"başka biri imzalar" gerçek bir kuraldır.

| Rol | Kişi | Tek satır |
|---|---|---|
| Analist | Üye 2 (Üye 4) | Okur, not ekler. |
| Risk Sorumlusu | Üye 3 | Onaylar ya da reddeder; durdurur. |
| Yönetici | Üye 1 | Kullanıcılar, ayarlar, demo. |
| Denetçi | Denetçi | Her şeyi görür, hiçbir şeyi değiştiremez (jüri için). |

Girişten sonra **Risk Sorumlusu** (kanonik demo böyle başlar). Tek tablo `src/lib/auth/permissions.ts`:
`can(role, action)`; mock API (403 + düz gerekçe), her düğme ve "Kim ne yapabilir?" tablosu aynı tabloyu okur.
Yetkisiz bir düğme gizlenmez: kapalı durur, altında gerekçe ("Bunu Risk Sorumlusu yapar.") ve
"Risk Sorumlusu gözüyle bak →" bağlantısı vardır. Her ekran dört role açıktır (`canOpen`); fark, basabildiklerindedir.

### 2.2 Öneride iki imza
"Öneriyi tayfa yazar, kurallar denetler; son imzayı bir insan atar. Bir kişi hem önerip hem onaylayamaz — bu
yüzden iki imza var." Yalnız Risk Sorumlusu Onayla/Reddet'e basar; damga rol adı, kişi ve saatle düşer.
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

### 2.6 Rehberli demo
Ayarlar → "Rehberli demoyu başlat": altta küçük bir çubuk, `11-demo-senaryosu.md`'nin 6 perdesi, 15 adım, → / ←.
Her adım rolü kendiliğinden değiştirir, gerekeni önce çalıştırır (ör. demo gününü sıfırla), ekranı açar, sonra
sahnede olması gerekeni yapar (senaryo ekle, defteri doğrula). Elle basılan adımlarda çubukta bir **yedek** düğme
vardır. Her adımda sunucuya tek cümle. Adımlar `src/components/demo/demo-steps.ts`.

## 3. Oturum
- **Mock.** `POST /api/mock/session {passphrase}` → `kaptan_mock_session` çerezi (8 saat, rol içinde). Parola `kaptan2026`. `PUT {role}` rolü değiştirir. Demo içindir, güvenlik sınırı değildir.
- **http.** Tek parola; rol `POST /auth/role` ile seçilir (API.md §2).
- **Proxy** (`src/proxy.ts`). Panel rotaları oturum ister; `/`, açılış sayfasının dosyaları ve `/crew/*` açıktır.

## 4. İçerik ve uyum
- Türkçe, düz cümleler (`src/components/story/plain.ts`, `src/lib/audit-words.ts`). Kurgusal "Temsili" şirketler.
- Örnek sayılar "örnek değer" etiketiyle. Kuzey kırmızısı yalnızca Durdur, veto ve kırık zincir için.
- Feragatname her ekranın altında, değiştirilmeden.

## 5. Demo akışı (elle)
1. Giriş → Bugün (Risk Sorumlusu).
2. Rol: Yönetici → Ayarlar → "Yeni iş (E3)" Ekle → Bugün: ÖRNEK ENERJİ kartı.
3. Rol: Analist → İncele → Onayla kapalı, gerekçe; not ekle → "Risk Sorumlusu gözüyle bak →" → Onayla → damga, emir fişi.
4. Denetim → Defteri doğrula → "Zincir sağlam." · Yönetici: Ayarlar → Bir kaydı kurcala → Denetim → "Kayıt #3.907'de zincir kırık."
5. Ayarlar → Değişiklik öner (1/2) → Risk Sorumlusu: Onayla (2/2).
6. Portföy → Durdur → Yönetici: Yeniden başlatmayı başlat (1/2) → Risk Sorumlusu: Onayla ve yeniden başlat (2/2).
