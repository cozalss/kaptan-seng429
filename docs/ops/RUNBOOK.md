# KAPtan el kitabı

Bu kitap, daha önce hiç terminal kullanmamış biri için yazıldı. Her adımı sırayla yap.

KAPtan senin bilgisayarında çalışır. İnternete açık değildir: yalnız bu bilgisayardan, `http://localhost:3100`
adresiyle girilir. Barındırma ücreti yoktur.

Komutların yanındaki işaretler:

- **[denendi]** Bu adım, 20 Kasım 2026'da ayrı bir deneme kurulumunda çalıştırıldı ve sonucu görüldü.
- **[denenmedi]** Bu adım çalıştırılmadı. Yazıldığı gibi çalışması beklenir, ama görülmedi.

Bir işaret yoksa o satır bir komut değil, bir açıklamadır.

## 1. Kurulum (bir kez)

1. Docker Desktop kurulu olsun ve açık olsun. Ekranın sağ altındaki balina simgesi yeşil olmalı.
2. Proje klasöründe **`kur.cmd`** dosyasına çift tıkla. Siyah bir pencere açılır ve sana sorular sorar.
   Soruları yanıtlarken yazdığın parolalar ve anahtarlar ekranda görünmez; bu normaldir.
   - **Parola seç.** En az 10 karakter. KAPtan'a bu parolayla gireceksin. Unutursan kurtaramazsın, yeniden
     kurmak gerekir: kopyası hiçbir yerde durmaz, yalnız özeti saklanır.
   - **Yapay zekâ anahtarı.** KAPtan bildirimleri okumak için bir yapay zekâ hizmetinin anahtarını ister.
     En az biri gerekir. Hangisini yapıştıracağını bilmiyorsan Gemini'nin ücretsiz anahtarı yeter.
   - **Yedek klasörü.** Enter'a basarsan kullanıcı klasöründe `KAPtan-Yedek` olur.
   - **Telefona bildirim ister misin?** Bölüm 5'e bak.
   - İlk seferde derleme 5-10 dakika sürer. Bekle.
3. "Kurulum tamam" yazınca bir tuşa bas, pencere kapanır.
4. **`baslat.cmd`** dosyasına çift tıkla. Hazır olunca tarayıcı giriş sayfasını açar. Seçtiğin parolayla gir.

`kur.cmd`, gizli değerleri proje klasöründeki `.env` dosyasına yazar. Bu dosyayı kimseyle paylaşma, kimseye
gönderme.

Kurulum betiği şu hâliyle, ayrı bir deneme kurulumunda uçtan uca çalıştırıldı **[denendi]**. Ama bu denemede
soruları bir insan yanıtlamadı (parola ve anahtarsız mod otomatik verildi); bildirim soruları da yalnız
sahte yanıtlarla sınandı **[denenmedi: gerçek bir insanla, gerçek ekranda]**.

**Neden `.cmd`?** Windows bazı bilgisayarlarda imzasız betikleri engeller. `.cmd` dosyaları bunu aşar.

## 2. İlk açılış

Yeni kurulum dürüstçe boştur. KAPtan önce son günlerin bildirimlerini ve fiyat geçmişini yükler. Bu **15-25
dakika** sürer ve internet gerekir. Bu sırada öneri çıkmaz; bu normaldir. Panelin üstünde "KAPtan ilk hazırlığını
yapıyor" yazar.

Ne kadar sürdüğünü bu bilgisayarda gerçek anahtarlarla görmedim **[denenmedi]**. Deneme kurulumunda yapay zekâ
anahtarı yoktu ve ilk hazırlığın bittiğini görmedim.

Sonra uygulama sana ilk soruyu sorar: **"Ne kadar parayla başlıyorsun?"** Kendi paranı yaz. O ana kadar KAPtan
hiçbir şeyi yorumlamaz: paranı bilmeden bir önerinin ne kadar büyük olacağını söyleyemez. Elinde zaten hisse
varsa ikinci soruda onları da girersin. Bu ekranı bu turda ben açıp denemedim **[denenmedi]**; giriş yapınca
`/api/v1/me/overview` yanıtı `needs_setup: true` dedi, yani uygulama bu soruyu soracak durumdaydı **[denendi]**.

## 3. Her gün

| Ne | Nasıl | |
|---|---|---|
| Başlat | `baslat.cmd` | [denendi] |
| Durdur | `durdur.cmd` (veriler silinmez) | [denendi] |
| Parolayı değiştir | `kur.cmd`, sorunca `e` yaz. Açık oturumlar kapanır. | [denendi: otomatik, parola verilerek] |
| Ne durumda? | Panelin üstündeki uyarı satırı | [denendi: durum cümlesi geliyor] |

**KAPtan'ın günlük işi şudur:**

1. KAPtan şirketlerin KAP bildirimlerini okur. Çoğunu eler.
2. Paranı ilgilendiren bir şey bulursa sana bir **öneri** gösterir: ne yapmalı, neden, ne kadar emin değil.
3. **Karar sende.** Onaylayabilirsin, reddedebilirsin, hiç bakmayabilirsin. Yanıtlamadığın öneri düşer.
4. Onaylarsan KAPtan sana bir emir fişi hazırlar. **Emri sen, kendi bankanın ya da aracı kurumunun uygulamasından
   girersin.** KAPtan hiçbir zaman kendi başına bir emir vermez. Hesabına bağlanamaz.
5. Emir gerçekleşince, **gerçekleşen fiyatı, adedi ve komisyonu** KAPtan'a yazarsın. KAPtan paranı, elindeki
   hisseleri ve kazancını bu kayıtlardan hesaplar. Yazmazsan KAPtan gerçeği bilemez ve hesaplar yanlış kalır.

Bütün bunların her adımı Geçmiş ekranına yazılır.

### Bilgisayar kapalıyken

Bilgisayar kapalıysa ya da uyuyorsa KAPtan bildirim okuyamaz ve o sürede çıkan haberleri canlı olarak kaçırırsın.
Açılınca KAPtan kaçırdığı borsa günlerinin fiyatlarını ve bildirimlerini en fazla 30 gün geriye giderek geçmiş
olarak yükler, ama onlar için öneri üretmez. Çalışmıyorsa panelin üstünde "KAPtan şu an bildirim okumuyor." yazar.

`durdur.cmd` ile durdurduktan sonra bilgisayar yeniden açılsa da KAPtan kendiliğinden başlamaz: `baslat.cmd`
ile sen başlatırsın.

Bilgisayar açılınca KAPtan'ın kendiliğinden gelmesi için bir kez:

1. **Docker Desktop Windows ile açılsın:** Docker Desktop → Settings → General → *Start Docker Desktop when you
   sign in to your computer*.
2. **Bilgisayar uyumasın:** Windows Ayarları → Sistem → Güç ve pil → *Prize takılıyken uyku: Hiçbir zaman*.
   Dizüstüyse kapak kapanınca ne olacağını da Denetim Masası → Güç Seçenekleri'nden ayarla.
3. Docker Desktop oturum açmadan başlamaz. Bilgisayar yeniden başlayınca oturum açman gerekir.

Bu üçü, ayrı bir Docker üzerinde yapılan bir yeniden başlatma denemesinde işledi (servislerin hepsi 45 saniyede
geri geldi), ama bu bilgisayarın kendi Docker'ı yeniden başlatılmadı **[denenmedi]**.

## 4. Üstteki uyarılar ne demek?

Panelin üstünde bir cümle çıkarsa KAPtan sana bir şeyi söylüyordur. Sorun yoksa hiçbir şey yazmaz.

| Yazan | Anlamı | Ne yap |
|---|---|---|
| KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir. | İlk yükleme sürüyor. | Bekle. Bilgisayarı kapatma. |
| KAPtan'ın ilk hazırlığı henüz bitmedi. Bitince bildirimleri değerlendirmeye başlar. | Aynı şey. | Bekle. |
| KAPtan şu an bildirim okumuyor. | Okuyan parça çalışmıyor. | `baslat.cmd` çalıştır. Düzelmezse bölüm 9. |
| KAPtan çalışıyor ama KAP'tan yeni bildirim alamıyor; kendiliğinden yeniden deniyor. | KAP o an yanıt vermiyor. | Genelde bir şey yapma; biraz sonra düzelir. |
| Bilgisayar uykudan yeni uyandı; KAPtan birkaç dakika içinde okumaya devam eder. | Uykudan sonra toparlanıyor. | Bekle. |
| KAPtan bildirimleri okuyor ama şu an değerlendirmiyor. | Değerlendiren parça durmuş ya da kota dolmuş. | Bir süre bekle; sürerse `durdur.cmd`, sonra `baslat.cmd`. |
| Yapay zekâ anahtarı girilmemiş... | Kurulumda anahtar verilmemiş. | `kur.cmd` çalıştır, anahtarı yapıştır. **[denendi]**: anahtarsız denemede bu cümle çıktı. |
| KAPtan eksik piyasa verisini tamamlıyor; bu sırada öneriler gecikebilir. | Kaçırılan günler yükleniyor. | Bekle. |
| Günlük işler (gün sonu fiyatları, hesaplar) şu an çalışmıyor. | Günlük hesap işi durmuş. | `durdur.cmd`, sonra `baslat.cmd`. |
| KAPtan'ın kayıtlarına şu an ulaşılamıyor... | Veritabanı yanıt vermiyor. | `durdur.cmd`, sonra `baslat.cmd`. |
| Son yedek alınamadı. / Henüz yedek alınmadı. / Son yedek ... gün önce alındı. | Gece yedeği çalışmıyor. | Yedek klasörünün yerinde olduğuna bak (bölüm 6). |

Bu cümlelerin hepsi kodda yazılı; yalnız "anahtar girilmemiş" olanını gerçekten ekranda gördüm.
Diğerlerini tek tek tetiklemedim **[denenmedi]**.

## 5. Telefona bildirim

KAPtan yeni bir önerin olunca ya da bir şey takılınca telefonuna haber verebilir. Ücretsiz bir hizmet olan
**ntfy** üzerinden gider. Haberin içinde hisse adı ya da tutar **olmaz**: yalnız "Yeni bir önerin var" gibi sabit bir
cümle gelir. Çünkü haber, başkasının sunucusundan geçer.

Kurulum (`kur.cmd` sorunca):

1. "Telefona bildirim ister misin?" sorusuna Enter (evet).
2. Telefonuna ücretsiz **ntfy** uygulamasını kur.
3. Ekranda bir **konu adı** görürsün (`kaptan-...` diye başlar). Telefondaki ntfy uygulamasında "konuya abone
   ol"a dokun ve o konu adını yaz.
4. **Konu adını kimseyle paylaşma.** Bilen herkes bildirimlerini okuyabilir. Konu adı ekranda yalnız bir kez
   gösterilir; sonra `.env` dosyasında durur.

`kur.cmd`'yi yeniden çalıştırırsan konu adın korunur. Yeni bir tane istersen sorunca `e` yaz; eskisi çalışmaz olur.

**E-posta** (isteğe bağlı): `kur.cmd` "E-posta ile de bildirim ister misin?" diye sorar. Gönderecek hesabın sunucu
adını, portunu (587 ya da 465), kullanıcı adını, parolasını ve bildirimin gideceği adresi ister. Enter ile geçilir.
Gmail gibi hesaplarda normal parola değil, "uygulama parolası" gerekir.

Bu iki yolun hiçbiri bu turda gerçek bir telefona ya da posta kutusuna ulaşana dek denenmedi **[denenmedi]**.
Yalnız şunu gördüm: konu adı üretiliyor, doğru biçimde (31 karakter), var olan korunuyor, istenirse yenisi
üretiliyor **[denendi: sahte yanıtlarla, betiğin kendisiyle]**. Anahtarsız denemede bildirim kapalıydı ve durum
yanıtı bunu doğru söyledi (`ntfy: false`, `email: false`) **[denendi]**.

## 6. Yedek ve geri dönüş

Her gece 03:00'te (İstanbul) bir yedek alınır. Bilgisayar o saatte kapalıysa açılınca alınır. Yeni kurulum ilk
yedeğini hemen alır. Yedekler kurulumda seçtiğin klasörde durur, son 14 gün saklanır. Aynı klasörde
`audit-anchors.jsonl` da vardır: her gece kayıtların o anki özeti buraya yazılır. Docker'ı silsen bile klasör kalır.

Bu klasör yalnız bu bilgisayardadır. Disk bozulursa yedekler de gider. Arada bir klasörü bir USB belleğe ya da
başka bir diske kopyala.

**Şimdi bir yedek al:** [denendi]

```powershell
docker compose exec backup sh /ops/backup-once.sh
```

**Yedeğin işe yaradığını sına (canlı veriye dokunmaz).** Ayda bir yap. [denendi] Şu satırları görmelisin:
`audit verify: ok=True`, `anchors: ... mismatched=[]`, `Deneme başarılı`.

```powershell
powershell -ExecutionPolicy Bypass -File .\geri-yukle.ps1 -Deneme
```

**Yedeğe dön.** Önce yedek ayrı bir veritabanına açılır ve kayıtlar doğrulanır. Doğrulanmazsa hiçbir şey değişmez.
Doğrulanırsa KAPtan durur, o yedeğe geçer. Bugünkü veri silinmez, `kaptan_eski_<tarih>` adıyla kenarda kalır.
[denendi: önceki turda; bu turda yalnız `-Deneme` kısmı yeniden çalıştırıldı, geçiş kısmı çalıştırılmadı]

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

## 7. Durdurma ve güncelleme

**Durdurmak:** `durdur.cmd`. Veriler silinmez. [denendi: durdurunca `localhost:3190` yanıt vermedi, `baslat.cmd`
ile geri geldi ve aynı parolayla girildi.]

**KAPtan'ı bir süre kullanmayacaksan** bile durdurmak şart değildir, ama durdurursan o sürede hiçbir bildirim
okunmaz.

**Güncelleme:**

1. Bir yedek al (bölüm 6). [denendi]
2. Yeni kodu al: `git pull` [denenmedi]
3. Yeniden derle ve başlat: `baslat.cmd -Guncelle` ya da komut satırında:

```powershell
powershell -ExecutionPolicy Bypass -File .\baslat.ps1 -Guncelle
```

`-Guncelle`, `docker compose up -d --build` çalıştırır. Bu turda çalıştırılmadı **[denenmedi]**; kurulum sırasındaki
derleme ve imajların `docker compose` ile başlatılması ise denendi **[denendi]**. Veritabanı değişiklikleri
başlarken kendiliğinden uygulanır.

## 8. Ne paraya mal olur?

- **Barındırma, sunucu, uygulama: bedava.** Her şey senin bilgisayarında çalışır.
- **ntfy bildirimi: bedava.**
- **Yapay zekâ:** Gemini ve Groq'un ücretsiz katmanı kullanılır; kota dolunca KAPtan o gün bekler.
  **DeepSeek ücretlidir** ve yedek olarak zincirdedir. Harcaması günlük bir tavanla sınırlıdır (günde en çok 0,50
  dolar, `LLM_CAP_DEEPSEEK_USD`). Tavan dolunca KAPtan durur, tavanı aşmaz. DeepSeek anahtarı girmezsen hiçbir
  şey ödemezsin.
- Bunun dışında KAPtan hiçbir şey için para istemez. Komisyonu ve vergiyi yine de aracı kurumuna sen ödersin.

Harcama sınırı ayrıca modele giden öneri sayısını da kısar: saatte en çok 25, günde en çok 70 koşu
(`live.env`). Sınır `docker-compose.yml` ve `live.env` içinde okunabilir; çalışan bir deneme bunu uçtan uca
ölçmedi **[denenmedi: tavanın gerçekten tutup tutmadığı gerçek anahtarla ölçülmedi]**.

## 9. Sık sorunlar

| Belirti | Ne yap |
|---|---|
| "betik çalıştırma kapalı" benzeri bir hata | `.cmd` dosyasına çift tıkla |
| "KAPtan kurulu değil" | `kur.cmd` çalıştır |
| Docker Desktop çalışmıyor | `baslat.cmd` kendisi açmayı dener (1-2 dakika). Açılmazsa elle aç, simge yeşil olunca yeniden dene |
| "password authentication failed" | `.env` içindeki veritabanı parolası elle değişmiş. `kur.cmd` çalıştır, eşitler |
| API açılmıyor | Genelde anahtar yoktur: `kur.cmd` |
| Girişte "Çok fazla deneme" | Dakikada 5 deneme hakkın var. Bir dakika bekle |
| Giriş olur ama yenileyince düşüyor | Adresi `localhost` ile aç. Başka bir adla çerez çalışmaz |
| 3100 portu dolu | `.env` dosyasına `KAPTAN_PANEL_PORT='3300'` satırı ekle, `baslat.cmd` |
| "KAPtan şu an bildirim okumuyor" | `docker compose ps` ile `ingest_worker` satırına bak. Çalışıyorsa KAP o an yanıt vermiyor olabilir: `docker compose logs --tail=20 ingest_worker` |
| Parolamı unuttum | `kur.cmd` çalıştır, sorunca `e` yaz, yeni parola seç. Veriler silinmez |

Eski deneme verisi: Docker'da `kaptan-stack_pgdata` ve `kaptan-stack_redisdata` adlı iki eski deneme birimi
kalmış olabilir; artık kullanılmıyorlar. **Gerçek geçmişin `kaptan-stack_pgdata_live` içindedir: onu asla
silme.** Eskileri silmek istersen: `docker volume rm kaptan-stack_pgdata kaptan-stack_redisdata` **[denenmedi]**.

## 10. Gerçek para

Bunu kullanmadan önce oku.

- **Strateji gerçek veride henüz kanıtlanmadı.** Proje belgelerindeki sınama merdiveni (geçmiş veriyle kanıt
  testi, en az 3 ay ve 50 kâğıt işlem, gölge dönem) **çalıştırılmadı**. KAPtan şu an gerçek kayıtlarla 0 öneri
  üretmiş bir sistemdir; öneri hattının sonrası yalnız test verisiyle denendi.
- **Beklenti düşüktür.** Belgeler, BIST-100'e göre yılda kabaca **0 ile +%5** fazladan getiri bekliyor. Sıfır da
  çıkabilir, **zarar da edebilirsin.** Bu bir söz değil, bir beklentidir.
- **Zarara karşı iki sigorta vardır:** gün içinde **−%1**'e inersen yeni öneri durur; zirveden **−%5**'e inersen
  KAPtan kendiliğinden durur. Durdurmak, elindeki hisseleri satmaz; her biri kendi çıkış kuralıyla kapanır.
  Yeniden başlatmak için durdurmadan bu yana en az 24 saat ve en az 5 borsa günü geçmeli. Bu durdurucular senin
  girdiğin paraya ve işlemlere bakar, bu yüzden gerçek işlemleri doğru girmen önemlidir.
- Bu durdurucuları ve sınırları ben bu turda gerçek paraya karşı denemedim **[denenmedi]**.
- **KAPtan hiçbir zaman senin yerine emir vermez.** Her işlemi sen yaparsın.
- **Ne kadar paranın girileceği senin kendi kararındır.** KAPtan bir üst sınır koymaz. Kaybetmeyi göze
  alabileceğin bir tutarla başla, ya da önce hiç gerçek para koymadan, yalnız izleyerek bir süre kullan.

## 11. Teknik notlar

**Tek sistem:** Kökteki `docker-compose.yml` tek doğrudur. Gizli değerler `.env`, gizli olmayan ayarlar `live.env`
içindedir.

**Servisler:** `postgres`, `redis` → `db-roles`, `migrate`, `bootstrap` (bir kez çalışıp biter) → `api`,
`ingest_worker`, `agent_worker`, `scheduler`, `warmup`, `backup` → `panel`. Yalnız panel açıktır ve yalnız
`127.0.0.1` üzerinde.

**Durum:** `GET /api/v1/system/status` (oturum gerekir): son KAP yoklaması, son değerlendirme, günlük işler, son
yedek, bildirim kanalları, sorun listesi. `message` kişiye gösterilecek tek cümledir, sorun yoksa `null`.

**Isınma:** `warmup` servisi saatte bir sorar: ilk kurulum mu, kaçırılmış borsa günü var mı? Yoksa hiçbir kaynağa
gitmez. `agent_worker` ilk ısınma bitene kadar bekler (öncesinde evren boştur). Bekleyen bir servis `durdur`'a
hemen yanıt verir **[denendi]**.

**Harcama sınırı ve kayıt zinciri:** ayrıntı için `live.env` ve `backend/README.md`. Panelde Geçmiş →
"Kayıtlar sağlam mı?" zinciri doğrular; zincir her gece 23:30'da da doğrulanır. Zincir kırıksa o andan sonra karar
verme, son sağlam yedeği `-Deneme` ile sına.

**Parolalar ve anahtarlar:**

| Ne | Nasıl |
|---|---|
| Giriş parolası | `kur.cmd`, `e` |
| Sağlayıcı anahtarı | `kur.cmd`, yeni anahtarı yapıştır; eskisini sağlayıcının sitesinden iptal et |
| Telefon konu adı | `kur.cmd`, "yeni konu adı"na `e` |
| `JWT_SECRET`, Redis ve veritabanı parolaları | `.env`'den satırı sil, `kur.cmd` yenisini üretir ve veritabanını eşitler |

**Giriş sınırı:** istemci başına dakikada 5, hepsi birden dakikada 30. **Çerez:** `localhost` güvenli sayıldığı için
çerez düz http üzerinde çalışır; Chromium'da denendi, Edge ve Firefox için bilinen davranış budur, Safari
doğrulanmadı.

**Otomatik deneme:** `kur.ps1`, `COMPOSE_ENV_FILES` ile başka bir `.env` dosyasını ve `-PasswordFromStdin` ile
parolayı standart girdiden alır; bildirim sormaz. `COMPOSE_PROJECT_NAME` ile ayrı bir proje adı verilirse gerçek
sisteme dokunulmaz. Deneme bittikten sonra `docker compose -p <ad> down -v`.
