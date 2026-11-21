# KAPtan'ı Oracle Cloud sunucusuna taşıma rehberi

Amaç: KAPtan bilgisayarın kapalıyken de çalışsın. Sunucu Oracle'ın ücretsiz ARM makinesi olacak. Panele yalnız Tailscale ile (telefondan ve bilgisayardan) girersin; internete açık hiçbir kapı yok.

Her adımda ne tıklayacağın yazıyor. Takılırsan ekranın fotoğrafını at.

## Önce bilmen gerekenler (resmi sayfalardan kontrol edildi, 2026-11-21)

- Oracle'ın ücretsiz ARM makinesi (VM.Standard.A1.Flex) şu an toplam **2 OCPU ve 12 GB RAM** veriyor. Eskiden 4 OCPU / 24 GB idi; yarıya indirildi. KAPtan 2 OCPU / 12 GB ile rahat çalışır. Bu yüzden aşağıda 2 / 12 yazıyor. Kaynak: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Diskler toplam **200 GB** (önyükleme diski dahil). Biz 100 GB alacağız. Kaynak: aynı sayfa.
- Ücretsiz makine yalnız **ana bölgende (home region)** açılır ve ana bölgeyi sonradan **değiştiremezsin**. (Oracle ücretsiz makinelerin yalnız ana bölgede açılabildiğini söylüyor: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm ; "değiştirilemez" kısmı bu sayfada yazmıyor, kayıt ekranındaki uyarıdan biliniyor, kayıt sırasında ekranda okuyacaksın.)
- **Boşta kalan makine geri alınabilir.** Oracle'ın cümlesi: "Idle Always Free compute instances may be reclaimed by Oracle ... if, during a 7-day period: CPU utilization for the 95th percentile is less than 20%, Network utilization is less than 20%, Memory utilization is less than 20% (applies to A1 shapes only)". Üçü birden doğruysa makine boş sayılır. Kaynak: resourceref.htm (yukarıdaki sayfa). KAPtan sürekli iş yaptığı için büyük olasılıkla boş sayılmaz, ama garanti değil. **Önerim: hesabı Pay As You Go'ya yükselt** (aşağıda Adım 2). Ücretsiz sınırların içinde kaldıkça para çekilmez. Oracle sayfası, yükseltince ücretsiz kaynaklardan para alınmadığını söylüyor; Pay As You Go hesaplarının geri almadan muaf olduğu ise resmi sayfada yazmıyor, o yüzden bunu söz olarak değil, riski azaltan bir önlem olarak düşün.

## Adım 1. Tailscale hesabı (ücretsiz)

1. Tarayıcıda https://login.tailscale.com/start aç, Google ya da Microsoft hesabınla giriş yap.
2. Bilgisayara Tailscale'i kur: https://tailscale.com/download/windows indir, kur, "Log in" de, aynı hesapla gir.
3. Telefona App Store / Google Play'den "Tailscale" uygulamasını kur, aynı hesapla giriş yap, anahtar (VPN) iznini ver.
4. Tailscale yönetim sayfasında (https://login.tailscale.com/admin/dns) aşağı kaydır, **"HTTPS Certificates" → Enable HTTPS** düğmesine bas. (Bunu açmazsan panel https adresi çalışmaz. MagicDNS de açık olmalı; genelde açıktır.)

## Adım 2. Oracle hesabı

1. https://www.oracle.com/cloud/free/ aç, **Start for free**'ye bas.
2. Adın, e-postan, ülken (Türkiye). E-postaya gelen kodu gir.
3. **Home region** (ana bölge) sorulur. **Bu seçim kalıcıdır.** Önerim: **Germany Central (Frankfurt)**. Türkiye'ye yakın ve genelde dolu değil. Dürüst not: ARM makineler çok istendiği için Frankfurt'ta bazen "Out of capacity" hatası çıkar (aşağıda ne yapılacağı yazıyor). Bölgeyi bir daha değiştiremezsin; "ya olmazsa" diye başka bir bölge seçersen oradaki kapasite sorunu da seninle kalır.
4. Kart bilgisi ister (kimlik doğrulama için; sanal kart değil gerçek kart gerekir, 1 dolar civarı geçici bir blokaj olabilir). Para çekilmez.
5. Hesap açılınca https://cloud.oracle.com adresinden giriş yap. 30 günlük deneme kredisi ($300) verilir; sonra ücretsiz kaynaklar kalır (https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).
6. **Önerilen:** Sol üstte ya da üst bantta **Upgrade** (Yükselt) bağlantısına bas, **Pay As You Go**'yu seç. Bu bir taahhüt değil. Ücretsiz sınırı aşmazsan ücret çıkmaz (ARM sınırı 2 OCPU / 12 GB; bunu aşma). Ayrıca yükseltilmiş hesaplarda "Out of capacity" daha az görülür. Yükseltme birkaç saat sürebilir.

## Adım 3. Windows'ta SSH anahtarı yap

PowerShell'i aç (Başlat → "PowerShell"). Sırayla:

```
ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_kaptan
```

Parola sorarsa Enter, Enter. Sonra açık anahtarı göster:

```
Get-Content $HOME\.ssh\oracle_kaptan.pub
```

Çıkan tek satırı (`ssh-ed25519 AAAA...` ile başlar) kopyala. Dosyanın `.pub` olmayan hali gizli anahtardır, kimseye verme.

## Adım 4. Sunucuyu (VM) oluştur

1. Oracle konsolunda sol üstte ☰ menü → **Compute → Instances → Create instance**.
2. Name: `kaptan-sunucu`.
3. **Image and shape → Edit**:
   - Image: **Change image → Canonical Ubuntu → 24.04** (Ubuntu 24.04, aarch64/ARM sürümü). 
   - Shape: **Change shape → Ampere → VM.Standard.A1.Flex**. **OCPU: 2, Memory: 12 GB**.
4. **Networking**: varsayılan sanal ağ olsun, **Public IPv4 address: Assign** işaretli kalsın (ilk kurulum için lazım).
5. **Add SSH keys → Paste public keys**: Adım 3'te kopyaladığın satırı yapıştır.
6. **Boot volume → Specify a custom boot volume size**: **100 GB**.
7. **Create**'e bas. Birkaç dakika sonra durum **Running** (yeşil) olur. Sayfada **Public IP address** görünür; yaz.

### "Out of capacity for shape VM.Standard.A1.Flex" hatası çıkarsa

Bu, Oracle'ın o an boş ARM makinesi olmaması demek; senin hatan değil.
1. **Availability domain'i değiştir** (Create ekranında Placement bölümü; Frankfurt'ta 3 tane var, her birini dene).
2. Birkaç saat sonra ya da gece/sabah erken tekrar dene.
3. Adım 2.6'daki **Pay As You Go yükseltmesini** yap; kapasiteyi genelde düzeltir.
4. Hâlâ olmazsa en son çare: OCPU'yu 1, RAM'i 6 GB'a düşürüp dene (KAPtan yavaş ama çalışır), sonra büyütürsün.

## Adım 5. Sunucuya bağlan (ilk kez)

PowerShell'de (IP yerine kendi Public IP'ni yaz):

```
ssh -i $HOME\.ssh\oracle_kaptan ubuntu@123.45.67.89
```

"Are you sure you want to continue connecting" sorarsa `yes` yaz. `ubuntu@kaptan-sunucu:~$` görünce içeridesin.

## Adım 6. Ağ testi (kurulumdan ÖNCE)

Sunucunun KAP, İş Yatırım ve yapay zekâ sağlayıcılarına ulaşıp ulaşamadığını bilmek lazım (bazı siteler yurt dışı adreslerini engelleyebilir; senin PC'nde bunu deneyemeyiz). Sunucuda:

```
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/cozalss/kaptan-seng429
bash kaptan-seng429/deploy/oracle/ag-testi.sh
```

Her satır `OK` ya da `ENGELLİ` yazar. **KAP, İş Yatırım, GitHub, Docker Hub, Tailscale = OK olmalı**, LLM sağlayıcılarından en az biri OK olmalı. Hepsi OK ise devam.

**KAP ya da İş Yatırım ENGELLİ çıkarsa:** devam etme, bana ekran fotoğrafını at. Çözüm seçenekleri: Türkiye çıkışlı bir Tailscale "exit node" (evdeki PC'n) üzerinden çıkmak, ya da KAPtan'ı PC'de bırakmak. (Bu rehberi o zaman güncelleriz.)

## Adım 7. Hazırlık

```
bash kaptan-seng429/deploy/oracle/kur-sunucu.sh --hazirlik
```

Bu: Docker'ı, Tailscale'i kurar, 2 GB swap açar, yedek klasörünü (`/srv/kaptan-yedek`) yapar. Bir yerde **bir bağlantı** çıkar (`https://login.tailscale.com/a/...`). Onu bilgisayarındaki tarayıcıda aç, onayla. Bitince makine Tailscale'de `kaptan-sunucu` adıyla görünür.

Şimdi **çıkıp yeniden bağlan** (docker izni için): `exit` yaz, sonra Adım 5'teki komutu tekrar çalıştır. Bu kez Tailscale adıyla da bağlanabilirsin: `ssh ubuntu@kaptan-sunucu` (bilgisayarında Tailscale açıkken, anahtar bile gerekmez).

## Adım 8. Eski verini PC'den taşı (taşıyacaksan)

**PC'de** PowerShell, KAPtan klasöründe:

```
.\deploy\oracle\tasi-pc.ps1 -Sunucu kaptan-sunucu
```

Taze yedek alır ve yedek + `.env` dosyalarını sunucuya Tailscale ile kopyalar. PC'deki KAPtan'ı kendiliğinden kapatmaz. (Aynı parola ve anahtarlar sunucuda da geçerli olur.)

**Sunucuda** sırayla:

```
bash ~/kaptan-seng429/deploy/oracle/kur-sunucu.sh --env-from ~/kaptan-tasi/.env
bash ~/kaptan-seng429/deploy/oracle/geri-yukle-sunucu.sh
```

Birincisi derleyip başlatır (ARM'da ilk seferde 10-15 dakika). İkincisi yedeği açar ve kontrol eder: veritabanı sürümü, başlangıç paran (50 000 TL satırı vs. PC ile aynı mı), kayıt zinciri. Sonunda **"TAŞIMA BAŞARILI"** yazmalı. O zaman PC'de `.\durdur.ps1` çalıştır. **İki KAPtan aynı anda çalışmasın.**

(Eski veri taşımayacaksan: yalnızca `bash ~/kaptan-seng429/deploy/oracle/kur-sunucu.sh` çalıştır; parolanı ve anahtarlarını sorar.)

## Adım 9. Telefondan aç

1. Telefonda Tailscale'in **açık** olduğundan emin ol.
2. `kur-sunucu.sh` sonunda yazdığı adresi aç: `https://kaptan-sunucu.<senin-ağın>.ts.net`
3. Parolanla gir. Ana ekrana ekle (Safari: Paylaş → Ana Ekrana Ekle).

Tailscale kapalıyken adres açılmaz; bu bilerek böyle (başkası giremez).

## Adım 10. Sunucuyu kilitle (önerilir)

Her şey çalışıp Tailscale üzerinden `ssh ubuntu@kaptan-sunucu` ile bağlanabildiğini gördükten sonra:

1. Sunucuda: `bash ~/kaptan-seng429/deploy/oracle/kur-sunucu.sh --hazirlik --kilitle` (yalnız Tailscale'den gelene izin verir).
2. Oracle konsolunda: Instance sayfası → **Virtual cloud network** → **Security Lists** → varsayılan liste → **Ingress Rules**: 22 numaralı satırı **sil**. Böylece internetten hiçbir kapı açık kalmaz.

Anahtarın ve Tailscale'in ikisi birden bozulursa Oracle konsolunda "Console connection" ile içeri girebilirsin.

## Günlük kullanım

Sunucuya bağlan: `ssh ubuntu@kaptan-sunucu`, klasör: `cd ~/kaptan-seng429`.

- **Güncelle** (yeni kod geldiğinde): `bash deploy/oracle/guncelle.sh`
- **Durdur:** `bash deploy/oracle/durdur.sh`  **Başlat:** `bash deploy/oracle/baslat.sh`
- Sunucu yeniden başlarsa KAPtan kendiliğinden kalkar.
- Sağlık: `cd ~/kaptan-seng429 && docker compose ps`

## Yedekler

- Gece 03:00'te (İstanbul saati) yedek otomatik alınır, `/srv/kaptan-yedek` içine, 14 gün tutulur.
- **Aynı disk yedek değildir.** Haftada bir kopyayı bilgisayarına çek. En kolay yol: PC'de PowerShell'de
  `scp "ubuntu@kaptan-sunucu:/srv/kaptan-yedek/kaptan-*.dump" "$HOME\KAPtan-Yedek\"` (Tailscale açıkken çalışır).
  Bunu Windows **Görev Zamanlayıcı**'ya haftalık bir görev olarak koyabilirsin (Eylem: `powershell.exe -File` ile bir `.ps1` içine bu satırı yaz). Şimdilik elle yapmak yeterli.
- Yedeği test et: sunucuda `cd ~/kaptan-seng429 && docker compose exec -T backup sh /ops/restore-into.sh <dosya.dump>` ardından `docker compose exec -T backup sh /ops/restore-into.sh --drop`. (PC'deki `geri-yukle.ps1 -Kontrol`'ün karşılığı.)

## Oracle makineyi geri alırsa / makine kaybolursa

1. Bilgisayarındaki son yedek kopyasını (yukarıdaki haftalık kopya) sakla.
2. Oracle konsolunda yeni bir makine aç (Adım 4), Adım 5-7'yi tekrarla.
3. Yedek dosyasını yeni sunucuya kopyala: `scp "$HOME\KAPtan-Yedek\kaptan-....dump" ubuntu@kaptan-sunucu:kaptan-tasi/` (önce o klasörü `ssh ubuntu@kaptan-sunucu mkdir -p kaptan-tasi` ile aç), `.env` dosyanı da aynı klasöre koy.
4. `kur-sunucu.sh --env-from ~/kaptan-tasi/.env`, sonra `geri-yukle-sunucu.sh`.
5. Olmazsa KAPtan'ı geçici olarak PC'de `.\baslat.ps1` ile çalıştır.

Bu yüzden: **`.env` dosyanın ve en az bir yedeğin PC'nde de bulunması şart.**
