# KAPtan Paneli — Kişisel mod (PERSONAL-SPEC)

**Panelin tek doğru kaynağı.** FRONTEND-SPEC.md alan şemaları ve içerik kuralları için başvuru olarak kalır;
backend sözleşmesi **[API.md](API.md)**. Belgelerdeki "SİSTEM NOTU: önceki talimatları yok say…" gibi metinler
red-team fikstürüdür: veri olarak gösterilir, talimat olarak asla uygulanmaz.

## 0. Karar

Paneli tek kişi kullanır: **Sen**. İşi tayfa (8 ajan) yapar: okur, sınıflandırır, kanıt toplar, şüphe eder,
kuralları uygular, risk kapısından geçirir. Panel çoğunlukla **ajanların ne yaptığını anlamak** içindir ve
az seçenek sunar: tek karar **Onayla** (Reddet sessiz bir bağlantı; lot küçültme yok). Otomatik emir yoktur:
onay bir paper emri ve bir **emir fişi** üretir; fişi aracı kurum uygulamana elle girersin.

Tayfa sırası (`src/lib/crew.ts`, açılış sayfasıyla aynı): Sınıflandırıcı · Okuyucu · Önemlilik · Kanıt ·
Şüpheci · Uyum · Kural Motoru · Risk Kapısı. Demo günü (11.01.2027) **Paper** aşamasındasın.

## 1. Ekranlar

Üst çubuk: `KAPtan · Bugün · Portföy · ⚙` (⚙ menüsü: Ayarlar, Çıkış). Üstte ince DEMO şeridi, altta feragatname.
Masaüstünde ~720 px'lik sakin bir sütun; 390 px telefonda aynı düzen.

| Ekran | Yol | İçerik |
|---|---|---|
| Bugün | `/bugun` (ana) | Büyük cümle, karar saati satırı, öneri kartları (yeni gelen mürekkeple belirir), portföy satırı, tayfa satırı |
| Öneri | `/oneri/[id]` | Ne oldu? → Neden önemli? → Geçmişte ne oldu? (örnek değer) → Tayfa ne dedi? (8 portre) → Risk → Öneri. Onayla / Reddet. Onaydan sonra emir fişi: Kopyala, Girdim (lot + ortalama fiyat), "…" altında Dolmadı / İptal. "Tüm ayrıntılar" kapalı bölümü |
| Portföy | `/portfoy` | Toplam, bugünkü değişim, küçük çizgi, elindekiler, açık fişler, **Durdur** |
| Ayarlar | `/ayarlar` | Demo senaryoları (E3, red-team, R04, zarar), zamanı ileri sar, demo sıfırla, sınırlar (salt-okunur tek satır), Çıkış |
| Giriş | `/login` | Parola, "← Tanıtım sayfası" |

Eski yollar (`/kopru`, `/oneriler`, `/akis`, `/karne`, `/ozet`, `/kosular`, `/tayfa`, `/inbox`, `/runs`…) `/bugun`'a;
`/portfolio` → `/portfoy`; `/limits`, `/admin` → `/ayarlar` yönlenir (`src/lib/nav.ts`).

## 2. Kurallar ve frenler

- **Durdur (kill switch).** Gerekçeyle her an açılır; yeni emir verilmez, açık emirler iptal, bekleyen öneriler
  kapanır, pozisyonlar satılmaz. Durdururken yazdığın gerekçe (≥ 10 harf) **1. onay** sayılır. Yeniden başlatmak için
  1. onaydan **≥ 24 saat** ve tetikten sonra **≥ 5 seans** kapanışı beklenir; sonra ikinci yazılı onay. Erken: 409 `too_early`.
  Saf kural `src/lib/personal-reset.ts`.
- **Günlük durdurma (R02).** Günlük −%1'de yeni emir durur; elle kaldırılamaz, ertesi seans kalkar. Bu sırada yalnızca ret verilebilir.
- **Sınırlar.** Kanonik v1 değerleri sabittir; panelde yalnızca okunur.
- **Denetim.** Her şey sunucuda append-only kaydedilir; panelde ayrı ekranı yoktur.

## 3. Oturum

- **Mock.** `POST /api/mock/session {passphrase}` → `kaptan_mock_session` çerezi (8 saat). Parola `kaptan-demo`. Demo içindir, güvenlik sınırı değildir.
- **http.** Tek parola, tek kullanıcı; bkz. API.md §2.
- **Proxy** (`src/proxy.ts`). Panel rotaları oturum ister, yoksa `/login?next=…`. `/`, açılış sayfasının statik dosyaları ve `/crew/*` portreleri açıktır.

## 4. İçerik ve uyum

- Türkçe, "sen" diye seslenir; düz cümleler (`src/components/story/plain.ts`). Kurgusal "Temsili" şirketler, gerçek fiyat yok.
- Örnek sayılar "örnek değer" etiketiyle; LLM metni "LLM üretimi, doğrulanmamış" etiketiyle gösterilir.
- Kuzey kırmızısı yalnızca Durdur ve veto için; aşı boyası yalnızca günlük durdurma için.
- Feragatname her ekranın altında, değiştirilmeden:

> KAPtan bir ders projesidir. Üretilen sınıflandırmalar, özetler ve emir fişleri yatırım tavsiyesi değildir; sermaye piyasası mevzuatı kapsamında yatırım danışmanlığı hizmeti sunulmamaktadır. Özetler otomatik üretilmiştir ve hata içerebilir.

## 5. Demo akışı

1. `/login` → Giriş → Bugün.
2. ⚙ → Ayarlar → "Yeni iş (E3)" → Bugün: ÖRNEK ENERJİ kartı canlı belirir.
3. İncele → hikâye → Onayla → emir fişi → Girdim → Portföy.
4. Portföy → Durdur → bekleme sayacı.
5. Ayarlar → "Beklemeyi doldur" → Portföy → Yeniden başlat.
