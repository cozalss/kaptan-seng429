# KAPtan Paneli — SPEC (tek kişi, canlı)

**Panelin tek doğru kaynağı.** Backend sözleşmesi [API.md](API.md); kod kuralları [PANEL-CONTRACT.md](PANEL-CONTRACT.md);
alan şemaları [FRONTEND-SPEC.md](FRONTEND-SPEC.md). Karar kaynağı:
[`_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md).

## 0. Karar

KAPtan **tek bir kişi** içindir, bu kişinin kendi bilgisayarında ve kendi parasıyla çalışır. Rol, masa, ikinci kişi, görünüm
anahtarı, demo ve örnek veri yoktur. Hedef aynı anda iki şey: jüriyi etkileyecek kadar güzel bir uygulama ve hiç borsa
yapmamış birinin her ekranı anlayabilmesi. İkisi çelişirse anlaşılırlık kazanır; güzel olan yeniden çizilir.

Panel ne olduğunu **söyler**, son kararı **sen** verirsin. KAPtan emri kendi başına vermez: onayladığın öneri girilecek bir
emre dönüşür; emri bankanda ya da aracı kurumunda sen girer, gerçekleşeni sen kaydedersin. Kasa, hisseler ve kâr/zarar
senin kendi defterini okur. Başlangıç paranı girene kadar KAPtan bildirimleri okur ama yorumlamaz.
Yeni kurulumda ekranlar dürüstçe boştur; boşluk uydurma veriyle doldurulmaz.

## 1. Ekranlar

Tek uygulama, tek kabuk, yan menü yok. Üstte marka ve dört bölüm; sağda hesap menüsü (Ayarlar, Çıkış). Telefonda bölümler
alt çubuktadır. Her ekran tek bir büyük cümleyle açılır.

| Yol | Menüdeki ad | Ekranın cevapladığı soru | İçerik |
|---|---|---|---|
| `/benim` | Ana sayfa | Paran ne kadar, nasıl hareket etti, bugün ne karar vermeliyim? | Büyük cümle. Tam genişlikte "Ufuk" çizgisi. Bekleyen öneriler (AL / TUT / SAT). Son işlemler. Başlangıç parası henüz girilmediyse onu isteyen tek adım. |
| `/oneri/[id]` | — | Bu öneri neden var, onaylarsam ne olur? | Fiil, bir cümle, tutar, "Neden?". Belirsizlik açıkça yazılır. Onayla / Reddet; onay girilecek emri çıkarır. |
| `/portfoy` | Param | Neye sahibim, her biri ne kadar değerli? | "Param nerede?" orantılı harita. Elindekiler, daha önce sahip olduklarını ekleme. |
| `/bildirimler` | Okunanlar | KAPtan bugün ne okudu ve ne yaptı? | Sayılar ve liste. "Bugün 3 bildirime sıra gelmedi." ve nedeni; para girilmediyse "Başlangıç paranı girene kadar KAPtan bildirimleri yorumlamaz." ve ana sayfaya bağlantı. |
| `/gecmis` | Geçmiş | Olan her şey, ne zaman ve neden? | Okunabilir zaman çizelgesi. Üstte "Kayıtlar sağlam mı?" kontrolü. |
| `/ayarlar` | Ayarlar (hesap menüsü) | Limitlerim, KAPtan bana nasıl haber verir, çalışıyor mu? | Limitler düz cümle. **Bildirimler**: bu bilgisayar, telefon, e-posta, deneme bildirimi. **Sistem**: KAPtan'ın söylediği her sorun ya da "çalışıyor" ve son bakış saati. Parola, çıkış, "KAPtan nasıl çalışır". |
| `/login` | — | Kimsin? | Tek parola alanı. Başarılı girişte `/benim`. |
| `/` | — | Bu nedir? | Tanıtım sayfası (kaptan-landing). |

**Eski yollar.** `/bugun` → `/benim`; `/login/*` → `/login`; `/denetim`, `/audit` → `/gecmis`; `/portfolio` → `/portfoy`;
`/limits`, `/admin` → `/ayarlar`; diğerleri en yakın ekran. `src/lib/nav.ts` tek kaynaktır; tanımsız yol tasarlanmış bir 404'e gider.

**İlk açılış.** "KAPtan nasıl çalışır": üç kısa adım, geçilebilir, bir kez gösterilir.

**Durdurma yoktur.** Elle durdurma düğmesi, yeniden başlatma beklemesi ve kayba bağlı otomatik frenler (günlük −%1, zirveden −%5)
kaldırıldı. KAPtan paranın düşüşünü yalnızca gösterir; karar senindir. Her hisse kendi çıkış planıyla (zaman, ATR) kapanır.

## 2. Kabuk satırı: KAPtan kendi durumu hakkında dürüsttür

Üst çubuğun altında bir seferde **en çok bir** satır görünür, yalnızca KAPtan'ın kendi sorunu (mürekkep satırı). Sistem satırı `GET /system/status`'tan gelir: sorunun cümlesi
(`message`), senin ne yapabileceğin ya da bir şey yapman gerekmediği ve Ayarlar · Sistem'e giden "Ayrıntı". Suçlayıcı dil yok.
Bölge `role="status"`, odağı çalmaz. Durum dakikada bir, sekme gizliyken hiç, aynı anda tek istekle
sorulur; API cevap vermezse 15 saniyede bir. Sorun yoksa satır yoktur.

## 3. Bildirimler

- **Bu bilgisayar.** Tarayıcının kendi bildirimi; yalnızca Ayarlar'da düğmeye basılınca açılır ve izin o anda istenir (sayfa
  yüklenirken asla). Olaylar panelin zaten aldığı akıştan gelir: yeni öneri. Sekme açıkken
  çalışır; kullanıcı uygulamaya bakıyorsa bildirim çıkmaz. Metin: "Yeni bir önerin var." Hisse adı, tutar, yön yazılmaz.
  Tıklayınca ilgili ekran öne gelir. İzin reddedilmişse ya da tarayıcı desteklemiyorsa bunu düz cümleyle söyler.
- **Telefon / e-posta.** Backend ntfy ya da e-posta ile gönderir; kurulum `kur.cmd` ile bu bilgisayarda yapılır. Ayarlar hangi
  kanalın kurulu olduğunu, "Deneme bildirimi gönder" düğmesini ve son sonucu gösterir; hiçbiri kurulu değilse üç adımı yazar.
  Konu adı ve adres hiçbir yerde gösterilmez.

## 4. Tek kişi kuralları

- Hesapta tek kişi vardır; denetim kayıtlarında aktör "Sen" ya da "KAPtan"dır.
- Rol, masa, ikinci imza, görünüm anahtarı, rehberli tur yoktur. Panel yetki kontrolü yapmaz; oturum açan her düğmeye basar,
  hatalı durumlar API'nin `409`/`422` cevabıyla açıklanır.
- İkinci imza yerine geçilen işlemler denetim defterine `auth.single_user_waiver` olarak yazılır; Geçmiş'te görünür.

## 5. Öneri dürüstlüğü

- Her öneri belirsizliğini ve KAPtan'ın emir vermediğini söyler.
- Getiri vaat edilmez; geçmiş olayların sonucu "geçmiş" etiketiyle sayı olarak gösterilir.
- Her sayı ne olduğunu söyler ("Başladığından beri +18.615 ₺"); sayılar API'den gelir, panel hiçbir sayı uydurmaz.
- Aciliyet dili ("hemen al", "kaçırma") yazılmaz.

## 6. Oturum ve ortam

Tek parola; JWT bellekte, yenileme çerezi `__Host-kaptan_rt` (API.md §2). `src/proxy.ts` uygulama rotalarına oturum ister;
`/` ve statik dosyalar açıktır. Panel gerçek backend'e konuşur. Tarayıcı içi sahte API (test ikizi) yalnızca testler içindir
(`NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1`), kullanıcıya hiçbir yolla gösterilmez. Herkese açık Vercel adresi yalnızca tanıtım
sitesidir; panel yolları orada "KAPtan senin bilgisayarında çalışır" der.

## 7. Dil: "büyükannem testi"

Her görünür metin Türkçedir, doğru karakterlerle, ikinci tekil şahısla ("sen"), kısa cümlelerle. Hiç borsa yapmamış biri her
ekranı yardım almadan anlamalıdır; kaçınılmaz bir finans terimi yanında düz bir açıklamayla gelir.

**Görünür metinde (aria-label dahil) yasak:** analist, risk sorumlusu, risk officer, admin, denetçi/auditor (rol olarak),
yönetici (rol olarak), ekip, takım, masa, üye, rol, ikinci imza, iki imza, dört göz, onay zinciri, kişisel mod, tek kullanıcı
modu, gelişmiş görünüm, Sharpe, RAG, p95, drawdown, kill switch, escalate, emir fişi ("girilecek emir"), seans ("borsa günü"
ya da "bugün"), lot ("adet"), limit fiyat ("en fazla X ₺'den"), portföy (etiket olarak; "Param"), denetim ("Geçmiş"), ajan
adları ana ekranlarda. Demo, örnek, benzetim, simülasyon, kurgusal, temsili gibi "bu gerçek değil" diyen sözcükler de yoktur.

**Yazılmaz:** ders adları, "ders projesi", "yatırım tavsiyesi değildir" ve benzeri uyarılar. **Kendi adresimiz yalnızca**
`https://kaptan-seng429.vercel.app/` ve `https://github.com/cozalss/kaptan-seng429`; üçüncü taraf bağlantıları (gerçek KAP
bildirimleri, kaynaklar) kalır.

## 8. Görsel çizgi

Hedef: jürinin "bu ne, kim yaptı?" diyeceği bir uygulama, standart bir panel değil.

- Bodoni Moda yalnızca ≥ 32 px; bütün gövde metni Inter, rakamlar tabular.
- Palet: indigo-lacivert mürekkep, serin kâğıt, tek işaret kırmızısı ("kuzey": veto, bozuk kayıt), kazanç ve kayıp
  mürekkepleri. Metin kontrastı ≥ 7:1; açık ve koyu tema ikisi de bilerek tasarlanır.
- Hareket: yalnızca transform, opacity, clip-path; her animasyonun amacı var; `prefers-reduced-motion`'a uyar; INP < 200 ms,
  CLS < 0,1. Dokunma hedefi ≥ 44 px, 360 px'te yatay kaydırma yok, axe temiz, tam klavye.
- **Ufuk:** başladığın değer su çizgisidir, üstü artı altı eksi. Her ekran önce tek cümleyle açılır. Kararlar fiziksel
  nesnelerdir (büyük fiil, mühür). Kartsız derinlik: tam genişlikte bantlar, ince çizgiler, tarama dokusu, ölçek kontrastı.
  Veri görselleştirme tasarımın kendisidir ("Param nerede?": alan = para, nakit taranmış blok). Tanıtım sayfasının küçük
  teknesi ve kırmızı bayrağı uygulamada da sürer: aynı dünya, daha sakin.
