# KAPtan bulut takibi

Bilgisayarın kapalıyken de KAP duyuruları ve sabah özeti Telegram'a gelsin diye küçük bir Cloudflare Worker'ı.
Ücretsiz plan, kart yok. Yalnız **Telegram takibi** buluta taşınır; web sitesi ve alım/satım önerileri hâlâ bilgisayarın
açık olmasını ister.

## Senin yapacağın üç şey

1. **Cloudflare hesabı aç.** <https://dash.cloudflare.com/sign-up> adresinde yalnız e-posta ve parola yeter.
2. **Betiği çalıştır.** KAPtan klasöründe PowerShell'de: `.\cloud-watcher\kur-bulut.ps1`
3. **Tarayıcıda "Allow"a bas.** Betik tarayıcıyı kendisi açar.

Gerisini betik yapar: veritabanını kurar, gizli anahtarı üretir, bot kodunu bu bilgisayardan alır, yayına alır,
Telegram'ı bağlar, KAPtan'a yazar ve yeniden başlatır. Tekrar çalıştırmak zararsızdır. Ekrana hiçbir gizli değer yazılmaz.
İlk yayında Cloudflare senden kısa bir `workers.dev` adı isteyebilir: bir ad yaz, Enter'a bas.

Telegram daha önce bağlı değilse: KAPtan > Ayarlar > Telegram > **Bağla**, çıkan bağlantıya telefonundan dokun.
Zaten bağlıysan hiçbir şey yapma, bağlantı bulut tarafına kendiliğinden geçer.

## Bilgisayar kapalıyken ve açıkken

| | Bilgisayar kapalı | Bilgisayar açık |
|---|---|---|
| Elindeki ve izlediğin hisselerin önemli duyuruları (anında) | gelir | gelir |
| Sabah 08:45 özeti, Cuma akşamı hafta sonu özeti, "Senin hisselerinde önemli bir şey yok" | gelir | gelir |
| Okudum / Sonra oku / Aç / Bu şirketi sustur düğmeleri | çalışır, KAPtan açılınca okundu işaretleri uygulanır | hemen uygulanır |
| /ayar, /sessiz, /durum | çalışır | çalışır |
| Alım/satım önerisi ("KAPtan: THYAO için al önerisi hazır") | gelmez | gelir |
| Web sitesi (panel) | açılmaz | açılır |

Mesajlarda para, tutar ya da adet hiç yazmaz. Onay düğmesi yoktur: onay yalnız uygulamadadır.
Bilgisayar 12 saatten uzun süre kapalı kalırsa sabah mesajına tek satır eklenir (günde en fazla bir kez):
"Bilgisayardaki KAPtan dünden beri kapalı; öneriler için açman gerek."

## Nasıl çalışır

- **Her 2 dakikada bir** (cron) Worker, KAP'ın herkese açık `list/main` adresine bakar: aynı adres, aynı tarayıcı
  başlıkları, aynı ayrıştırma kuralları (`backend/src/kaptan/ingest`). Borsa saatlerinde (hafta içi 08:00-19:00) her
  çalışmada, dışında 10 dakikada bir sorar. Bir hata ya da engel olursa 4, 8, 16, 30 dakika bekler.
- **Önemli mi?** Arka uçtaki kuralın aynısı: KAP'ın özgün (düzeltme olmayan) bildirimi, gürültü değil, bilinen bir
  türde (geri alım, yönetici işlemi, yeni iş/ihale, finansal rapor, kâr payı, sermaye, birleşme, SPK tedbiri).
  Konu tablosu, satırlar ve BIST takvimi `backend/scripts/export_cloud_data.py` ile üretilip `src/generated/` içine
  yazılır; arka uçtaki bir test dosyalar eskirse CI'ı kırar. Tek doğru kaynak arka uçtur.
- **"Benim" olanlar:** KAPtan çalışırken (açılışta ve 10 dakikada bir) Worker'a yalnız **ticker listelerini** gönderir:
  elindekiler ve izlediklerin. Tutar, adet, fiyat ya da kâr/zarar hiç gönderilmez. Bilgisayar kapanınca listeler
  Worker'da kalır.
- **Telegram:** Worker, botun gelen mesajlarının tek sahibidir (webhook). Aynı anda bir bot için hem webhook hem
  `getUpdates` olamayacağı için bulut açıkken bilgisayardaki dinleyici kapanır; bilgisayar yalnız öneri mesajlarını
  yollar.
- **Düğmeler:** Worker basılanları sıraya yazar; KAPtan açılınca `GET /actions` ile alıp kendi okundu/sonra
  oku/susturma kayıtlarına uygular. Susturma Worker'da hemen geçerlidir.
- **İsteğe bağlı Gemini:** `GEMINI_API_KEY` varsa (betik `.env`'den alır), yalnız kendi hisselerinin önemli
  duyurularındaki "ince" satırlar için bir cümlelik açıklama istenir. Cevap kontrol edilir (uzunluk, ton listesi,
  duyuruda olmayan sayı yok, tavsiye sözcüğü yok), duyuru başına bir kez sorulur, günde en çok 40 çağrı. Olmazsa kuralın
  yazdığı satır kalır.

## Ücretsiz plan sayıları ve kaynakları (24 Kasım 2026'da resmi belgelerden okundu)

| Sınır | Değer | Bizim kullanımımız | Kaynak |
|---|---|---|---|
| Worker istek/gün | 100.000 | cron 720 + birkaç yüz Telegram/senkron isteği | <https://developers.cloudflare.com/workers/platform/limits/> |
| CPU süresi/çalışma | 10 ms (HTTP ve Cron) | KAP yanıtını ayrıştırma + sınıflama; **ölçülmedi, aşağıya bak** | aynı sayfa |
| Alt istek/çalışma | 50 | 1 KAP (gece yarısı 2) + en çok 15 Telegram + birkaç Gemini | aynı sayfa |
| Cron tetikleyici/hesap | 5 | 1 | aynı sayfa |
| En kısa cron aralığı | belgede sınır yazmıyor; `* * * * *` (dakikada bir) örnek olarak var. Biz `*/2 * * * *` kullanıyoruz | 2 dakika | <https://developers.cloudflare.com/workers/configuration/cron-triggers/> |
| D1 okunan satır/gün | 5.000.000 | birkaç bin | <https://developers.cloudflare.com/d1/platform/pricing/> |
| D1 yazılan satır/gün | 100.000 | birkaç yüz (değişmeyen değer yazılmaz) | aynı sayfa |
| D1 depolama | 5 GB (veritabanı başına 500 MB) | birkaç yüz KB | <https://developers.cloudflare.com/d1/platform/limits/> |
| KV (kullanmıyoruz) | 1.000 yazma/gün, 100.000 okuma/gün | **D1 seçildi**: KV'nin yazma sınırı çok dar | <https://developers.cloudflare.com/kv/platform/limits/> |

Kart: Workers belgesi "Kullanıcılar varsayılan olarak Workers Free planına sahip olur" diyor
(<https://developers.cloudflare.com/workers/platform/pricing/>). Kart gerekmediği o sayfada açıkça yazmıyor;
kayıt ve kurulum sırasında kart istenirse dur ve bize haber ver.

Telegram webhook kuralları (<https://core.telegram.org/bots/api#setwebhook>): adres `https` olmalı; portlar 443, 80, 88,
8443; `secret_token` 1-256 karakter, yalnız `A-Z a-z 0-9 _ -`, Telegram her istekte `X-Telegram-Bot-Api-Secret-Token`
başlığında gönderir (Worker bunu sabit zamanlı karşılaştırır, tutmazsa 401 döner); webhook varken `getUpdates` çalışmaz;
2xx dışı yanıtta Telegram sınırlı sayıda yeniden dener, bu yüzden Worker geçerli bir istekte hep 200 döner.

## Henüz doğrulanamayanlar (gerçek hesapla ilk kurulumda bakılacak)

Bu çalışma bir Cloudflare hesabı olmadan yapıldı; hiçbir şey yayına alınmadı.

- **KAP, Cloudflare adreslerini engelliyor olabilir.** Betik sonunda `/health` ile bir KAP isteği yapar ve engel varsa
  Türkçe olarak açıkça yazar. Engelliyse bilgisayar kapalıyken duyuru takibi çalışmaz (sabah özeti yine gelir ama boş
  kalır). Ayarlar > Telegram bölümü de bunu gösterir.
- **10 ms CPU sınırı.** Bir günün KAP listesi yüzlerce satırdır; ayrıştırması sınırın altında olmalı ama gerçek
  yanıtla ölçülmedi. Aşılırsa Cloudflare o çalışmayı keser ve bir sonrakinde yeniden dener; belirti: `/durum`'da
  "son kontrol" güncellenmez. Çare: gün başına değil saat başına dilimlemek ya da ücretli plan.
- `wrangler d1 create` ve `workers.dev` ad sorusunun terminaldeki tam davranışı, betiğin kendisi.
- Telegram'ın webhook'u gerçekten çağırdığı ve düğmelerin telefonda çalıştığı.

## Geliştirme

```
cd cloud-watcher
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest, Workers çalışma zamanı (Miniflare); ağa hiç çıkmaz
```

Arka uç tarafı: `backend/src/kaptan/cloud/` (senkron ve düğme sırası), ayarlar `CLOUD_WATCHER_URL` +
`CLOUD_SYNC_SECRET` (ikisi de doluysa bulut açıktır). Üretilen dosyaları yenilemek için `backend` klasöründe
`uv run python scripts/export_cloud_data.py`.

Uç noktalar: `POST /telegram` (webhook, gizli başlıkla), `POST /sync`, `GET /actions`, `POST /actions/ack`,
`GET /health` (üçü de `Authorization: Bearer <CLOUD_SYNC_SECRET>` ister).
Bot kodunu KAPtan'da değiştirirsen betiği yeniden çalıştır: Worker kendi kopyasını tutar.
