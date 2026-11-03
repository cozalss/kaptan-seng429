# KAPtan el kitabı

KAPtan bu Windows bilgisayarda çalışır. Dışarıya açık değildir: yalnız bu bilgisayardan `http://localhost:3100`
adresiyle girilir. Barındırma ücreti yoktur. Bütün komutlar proje klasöründe çalışır.

Komutların yanındaki işaretler:

- **[denendi]** Bu komut ayrı bir deneme kurulumunda çalıştırıldı ve sonucu görüldü.
- **[denenmedi]** Bu komut çalıştırılmadı. Yazıldığı gibi çalışması beklenir, ama görülmedi.

## 1. Kurulum (bir kez)

1. Docker Desktop kurulu olsun ve açık olsun. Sol alttaki simge yeşil olmalı.
2. Proje klasöründe **`kur.cmd`** dosyasına çift tıkla. **[denendi]**
   - Bir parola seç. En az 10 karakter. Yazarken ekranda görünmez. Bu parolayı unutma; kopyası hiçbir yerde
     durmaz, yalnız özeti saklanır.
   - Sağlayıcı anahtarlarını sorar. Kayıtlı olanlar için Enter'a basman yeter. En az bir anahtar gerekir.
   - Yedek klasörünü sorar. Enter'a basarsan kullanıcı klasöründe `KAPtan-Yedek` olur.
   - İlk seferde derleme 5-10 dakika sürer.
3. **`baslat.cmd`** dosyasına çift tıkla. Hazır olunca tarayıcı giriş sayfasını açar. **[denendi]**
4. Seçtiğin parolayla gir.

`kur.ps1`, gizli değerleri proje klasöründeki `.env` dosyasına yazar. Bu dosya git'e girmez ve yalnız senin
Windows kullanıcın okuyabilir. Kimseyle paylaşma.

**Neden `.cmd`?** Windows bazı bilgisayarlarda imzasız betikleri engeller; bu bilgisayarda da öyle (`AllSigned`).
`.\kur.ps1` yazınca engellenirse `.cmd` dosyasına çift tıkla ya da şunu yaz: **[denendi]**

```powershell
powershell -ExecutionPolicy Bypass -File .\kur.ps1
```

**İlk açılışta:** KAPtan son günlerin bildirimlerini ve fiyat geçmişini yükler. 15-25 dakika sürer. Bu sırada
öneri çıkmaz. Yeni kurulum dürüstçe boştur: gerçek bildirimler gelene kadar ekranda gösterilecek az şey vardır.

## 2. Her gün

| Ne | Nasıl | |
|---|---|---|
| Başlat | `baslat.cmd` | [denendi] |
| Durdur | `durdur.cmd` (veriler silinmez) | [denendi] |
| Parolayı değiştir | `kur.cmd`, sorunca `e` yaz. Açık oturumlar kapanır. | [denendi] |
| Ne durumda? | Panelin üstündeki uyarı, ya da `docker compose ps` | [denendi: `docker compose ps`. Paneldeki uyarıyı panel çalışması ekleyecek] |

`durdur.cmd` ile durdurduktan sonra bilgisayar yeniden açılsa da KAPtan kendiliğinden başlamaz. Durduğu sürece
bildirim okunmaz.

### Bilgisayar yeniden başladığında

KAPtan, Docker açılınca kendiliğinden geri gelir. Veritabanı önce hazır olur, diğerleri onu bekler. Bir kez
ayarla:

1. **Docker Desktop Windows ile açılsın:** Docker Desktop → Settings → General → *Start Docker Desktop when you
   sign in to your computer*.
2. **Bilgisayar uyumasın:** Windows Ayarları → Sistem → Güç ve pil → Ekran, uyku ve hazırda bekletme → *Prize takılıyken
   uyku: Hiçbir zaman*. Dizüstü bilgisayarda kapak kapanınca ne olacağını da Denetim Masası → Güç Seçenekleri'nden ayarla.
3. **Oturum aç:** Docker Desktop oturum açılmadan başlamaz. Bilgisayar yeniden başlayınca oturum açman gerekir.

**Bilgisayar kapalıysa ya da uyuyorsa KAPtan bildirim okuyamaz.** O sürede çıkan bildirimleri canlı olarak
kaçırırsın. Bilgisayar açılınca KAPtan kaçırdığı borsa günlerinin fiyatlarını ve bildirimlerini en fazla 30 gün geriye
giderek geçmiş olarak yükler, ama onlar için öneri üretmez. Çalışmıyorsa KAPtan bunu açıkça söyler:
*KAPtan şu an bildirim okumuyor.*

Docker Desktop'ı elle yeniden başlatıp bakmak istersen: Docker Desktop → Troubleshoot → Restart. 1-2 dakika sonra
`http://localhost:3100` açılmalı. **[denenmedi: bu bilgisayardaki Docker yeniden başlatılmadı. Aynı sınama ayrı bir
Docker içinde yapıldı; bütün servisler 45 saniye içinde geri geldi.]**

## 3. Yedek ve geri dönüş

Her gece 03:00'te (İstanbul) bir yedek alınır. Bilgisayar o saatte uyuyorsa uyanınca alınır. Yeni kurulum ilk
yedeğini hemen alır. Yedekler `kur.ps1`'de seçtiğin klasörde durur, son 14 gün saklanır. Aynı klasörde
`audit-anchors.jsonl` da vardır: her gece kayıtların o anki özeti buraya yazılır. Docker silinse bile bu klasör kalır.

Bu klasör yalnız bu bilgisayardadır. Disk bozulursa yedekler de gider. Arada bir başka bir diske kopyalaman iyi olur.

**Şimdi bir yedek al:** [denendi]

```powershell
docker compose exec backup sh /ops/backup-once.sh
```

**Yedeğin işe yaradığını sına (canlı veriye dokunmaz):** [denendi] Ayda bir yap. Şu satırları görmelisin:
`audit verify: ok=True`, `anchors: ... mismatched=[]`, `Deneme başarılı`.

```powershell
powershell -ExecutionPolicy Bypass -File .\geri-yukle.ps1 -Deneme
```

**Yedeğe dön:** [denendi] Önce yedek ayrı bir veritabanına açılır ve kayıtlar doğrulanır. Doğrulanmazsa hiçbir şey
değişmez. Doğrulanırsa KAPtan durur, o yedeğe geçer. Bugünkü veri silinmez, `kaptan_eski_<tarih>` adıyla kenarda kalır.

```powershell
powershell -ExecutionPolicy Bypass -File .\geri-yukle.ps1
powershell -ExecutionPolicy Bypass -File .\baslat.ps1
```

Belirli bir yedek için: `.\geri-yukle.ps1 -Dosya kaptan-20261103T000000Z.dump` [denenmedi]

Her şey yolundaysa kenardaki eski veriyi silebilirsin: [denenmedi]

```powershell
docker compose exec -T postgres psql -U kaptan_owner -d postgres -c "DROP DATABASE kaptan_eski_<tarih>"
```

**Başka bir bilgisayara taşıma:** [denenmedi] Projeyi ve yedek klasörünü yeni bilgisayara kopyala. `kur.cmd` ile
kur, yedek klasörü olarak kopyaladığın klasörü göster, `baslat.cmd` ile başlat, sonra `geri-yukle.ps1` çalıştır.

## 4. Güncelleme

1. Bir yedek al (bölüm 3). [denendi]
2. Yeni kodu al: `git pull` [denenmedi]
3. Yeniden derle ve başlat: [denendi]

```powershell
powershell -ExecutionPolicy Bypass -File .\baslat.ps1 -Guncelle
```

Veritabanı değişiklikleri başlarken kendiliğinden uygulanır.

## 5. Eski deneme verisini temizleme

Docker'da eski deneme gününden iki birim kaldı: `kaptan-stack_pgdata` ve `kaptan-stack_redisdata`. Artık
kullanılmıyorlar. **Gerçek geçmişin `kaptan-stack_pgdata_live` içindedir: onu asla silme.**

1. `kur.cmd` ve `baslat.cmd` ile yeni sisteme geç, girip verilerini gör.
2. Sonra şunu çalıştır: [denenmedi: gerçek birimler silinmedi; `docker volume rm` yalnız deneme birimiyle çalıştırıldı]

```powershell
docker volume rm kaptan-stack_pgdata kaptan-stack_redisdata
```

## 6. Sık sorunlar

| Belirti | Ne yap |
|---|---|
| `kur.ps1` "imzalı değil" ya da "betik çalıştırma kapalı" diyor | `.cmd` dosyasına çift tıkla (bölüm 1) |
| `docker compose` "KAPtan kurulu değil" diyor | Kurulum yapılmamış: `kur.cmd` |
| Docker Desktop çalışmıyor | `baslat.cmd` kendisi açmayı dener. Açılmazsa elle aç, simge yeşil olunca yeniden dene |
| "password authentication failed" | `.env`'deki veritabanı parolası elle değişmiş. `kur.cmd` çalıştır, eşitler |
| API açılmıyor, kayıtta `refuses to start` | Eksikleri listeler. Çoğunlukla sağlayıcı anahtarı yoktur: `kur.cmd` |
| Girişte "Çok fazla deneme" | Dakikada 5 deneme hakkın var. Bir dakika bekle |
| Giriş olur ama yenileyince düşüyor | Adresi `localhost` ile aç. Başka bir adla çerez çalışmaz |
| 3100 portu dolu | `.env` dosyasına `KAPTAN_PANEL_PORT='3300'` ekle, `baslat.cmd` |
| "KAPtan şu an bildirim okumuyor" | `docker compose ps` ile `ingest_worker` satırına bak. Çalışıyorsa KAP o an yanıt vermiyor olabilir: `docker compose logs --tail=20 ingest_worker` |
| "Son yedek ... gün önce alındı" | `docker compose logs --tail=20 backup`. Yedek klasörü silinmiş ya da taşınmış olabilir |

## 7. Teknik notlar

**Tek sistem:** Kökteki `docker-compose.yml` tek doğrudur. `backend/docker-compose.yml` yalnız testler için Postgres
ve Redis açar. Gizli değerler `.env`, gizli olmayan ayarlar `live.env` içindedir.

**Servisler:** `postgres`, `redis` → `db-roles`, `migrate`, `bootstrap` (bir kez çalışıp biter) → `api`, `ingest_worker`,
`agent_worker`, `scheduler`, `warmup`, `backup` → `panel`. Yalnız panel açıktır, o da yalnız `127.0.0.1` üzerinde.

**Durum:** `GET /api/v1/system/status` (oturum gerekir): son KAP yoklaması, son değerlendirme, günlük işler, son yedek.
Yanıttaki `message` kişiye gösterilecek tek cümledir, sorun yoksa `null`.

**Isınma:** `warmup` servisi saatte bir sorar: ilk kurulum mu, kaçırılmış borsa günü var mı? Yoksa hiçbir kaynağa
gitmez. Varsa eksikleri kibarca doldurur (istekler arası ≥ 2 s); başarısız kaynakları 6 saat içinde yeniden denemez.
`agent_worker` ilk ısınma bitene kadar bekler: öncesinde evren boştur, her koşu R03'te durur.

**Harcama sınırı:** Önce LLM'siz ön eleme (gürültü/arşiv rotası, R03 evren, R04 tedbir, R13); modele giden koşu saatte
`AGENT_MAX_RUNS_PER_HOUR`, günde `AGENT_MAX_RUNS_PER_DAY` (`live.env`); sağlayıcı günlük sınırları (`LLM_CAP_*`, DeepSeek
günde en çok $0,50) ayrıca geçerli. Sınıra takılan bildirim `deferred` olur ve giriş penceresi açıkken öncelik sırasıyla
yeniden koşar; pencere kapanırsa `expired_unrun` olur. Sayılar `/disclosures/counters` yanıtındaki `agent_feed` alanında.
Barındırma ücreti yoktur. DeepSeek ücretlidir ve zincirde açıktır; en fazla harcamayı günlük tavanı sınırlar. Diğer
sağlayıcılar ücretsiz katmandadır.

**Geçmiş bildirim hafızası:** `RAG_INDEX_ON_INGEST=true`. Yeni metinler `gemini-embedding-001` ile kaydedilir: kendi
modeli ve kendi günlük tavanları (`RAG_EMBED_CAP_RPD` 500 istek, `RAG_EMBED_CAP_TPD`), ajanların Flash-Lite kotasından
ayrı sayılır. Bir hata bildirim okumayı durdurmaz; tavan dolunca o gün dizine eklenmez.

**Denetim zinciri:** Panel: Geçmiş → "Kayıtlar sağlam mı?". API: `POST /api/v1/audit/verify`. Zincir her gece 23:30'da
doğrulanır ve başı hem `audit.anchors` tablosuna hem yedek klasöründeki `audit-anchors.jsonl` dosyasına yazılır.
Geri dönüş bu dosyayla da karşılaştırır: yedekle birlikte tablosu da yeniden yazılmış bir kayıt defteri dosyayla uyuşmaz.
Zincir kırıksa: o andan sonra karar verme (Durdur), `first_bad_pos` kaydını bul, son sağlam yedeği `-Deneme` ile sına.

**Durdur ve yeniden başlatma:** Durdur: yeni öneri işlenmez, açık işler iptal edilir, sahip olduğun hisse satılmaz.
Zirveden −%5'te kendiliğinden de durur. Yeniden başlatmak iki adımdır: istek ve onay. Arada en az 24 saat ve durdurmadan
bu yana en az 5 borsa günü olmalıdır; yanıttaki `reset.ready_at` en erken onay anını söyler. Her adım kayıt defterine
yazılır.

**Parolalar ve anahtarlar:**

| Ne | Nasıl |
|---|---|
| Giriş parolası | `kur.cmd`, `e` |
| Sağlayıcı anahtarı | `kur.cmd`, yeni anahtarı yapıştır; eskisini sağlayıcının panelinden iptal et |
| `JWT_SECRET`, Redis ve veritabanı parolaları | `.env`'den satırı sil, `kur.cmd` yenisini üretir ve veritabanını eşitler [denendi: veritabanı parolaları için] |

**Giriş sınırı:** İstemci başına dakikada 5 (`LOGIN_RATE_PER_MINUTE`), hepsi birden dakikada 30
(`LOGIN_OVERALL_RATE_PER_MINUTE`). Panel, tarayıcının gönderdiği `X-Forwarded-For` başlığını olduğu gibi iletir ve bu
başlık sahte olabilir; ikinci sınır bu yüzden vardır. Sınırlar Redis'te tutulur.

**Çerez:** `KAPTAN_ENV=prod` ile `__Host-kaptan_rt` çerezi `Secure` işaretlidir. `localhost` güvenli sayıldığı için düz
http üzerinde çalışır: Chromium'da denendi. Edge ve Firefox için bilinen davranış budur, burada denenmedi. Safari doğrulanmadı.
