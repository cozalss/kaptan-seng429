# KAPtan Paneli — SPEC (tek kullanıcı)

**Panelin tek doğru kaynağı.** Backend sözleşmesi [API.md](API.md); kod kuralları [PANEL-CONTRACT.md](PANEL-CONTRACT.md);
alan şemaları ve fikstürler [FRONTEND-SPEC.md](FRONTEND-SPEC.md) başvuru olarak kalır. Bu belge
[`_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md) **Revizyon 4**'e (02.11.2026) göre yazıldı.

## 0. Karar

KAPtan **tek bir kişi** içindir ve yalnızca tek kullanıcı modunda çalışır. Anahtar, "gelişmiş görünüm", rol, masa ve
ikinci kişi yoktur. Hedef iki şeyi aynı anda: jüriyi etkileyecek kadar güzel bir uygulama, ve hiç borsa yapmamış birinin
her ekranı anlayabilmesi. İkisi çelişirse anlaşılırlık kazanır; güzel olan yeniden çizilir.

Panel ne olduğunu **söyler** ve son kararı **sen** verirsin. KAPtan bir emri kendi başına vermez: onayladığın öneri
girilecek bir emre dönüşür, emri aracı kurum uygulamasına sen girersin (demo hesabında simüle borsa doldurur).

## 1. Ekranlar

Tek uygulama, tek kabuk, yan menü yok. Üstte marka ve dört bölüm; sağda hesap menüsü (Ayarlar, Çıkış). Telefonda bölümler
alt çubuktadır. Her ekran tek bir büyük cümleyle açılır.

| Yol | Menüdeki ad | Ekranın cevapladığı soru | İçerik |
|---|---|---|---|
| `/benim` | Ana sayfa | Paran ne kadar, nasıl hareket etti, bugün ne karar vermeliyim? | Büyük cümle ("Paran bugün 2.135 ₺ arttı." / "Bugün 3 kararın var."). Tam genişlikte "Ufuk" çizgisi (aşağıda). Bekleyen öneriler, her biri AL / TUT / SAT fiilli büyük bir nesne. "Son işlemler". |
| `/oneri/[id]` | — (bir öneriden açılır) | Bu öneri neden var, onaylarsam ne olur? | Fiil, bir cümle, tutar, "Neden?" açılır. Ne olduğu · neden önemli · geçmişte ne oldu. Belirsizlik açıkça yazılır. Onayla / Reddet. Onay bir mühür basar ve öneri "Son işlemler"e uçar. |
| `/portfoy` | Param | Neye sahibim, her biri ne kadar değerli, artıda mıyım? | "Param nerede?" orantılı harita (alan = para; nakit taranmış blok). Elindekiler. Girilecek emirler. Durdurma. |
| `/bildirimler` | Okunanlar | KAPtan bugün ne okudu ve onunla ne yaptı? | Sayılar (ne kadar okundu, kaçı elendi, kaçı öneri oldu) ve listesi. |
| `/gecmis` | Geçmiş | Olan her şey, ne zaman ve neden? | Okunabilir zaman çizelgesi, tek satır cümleler. Üstte "Kayıtlar sağlam mı?" kontrolü. |
| `/ayarlar` | Ayarlar (hesap menüsü) | Limitlerim ne, parolam, nasıl çalışır? | Limitler düz cümle olarak; değişiklik önerisi ve onayı. Parola, çıkış. "KAPtan nasıl çalışır". |
| `/login` | — | Kimsin? | Tek parola alanı. Başarılı girişte `/benim`. |
| `/` | — | Bu nedir? | Tanıtım sayfası (kaptan-landing). Panele giriş bağlantısı `/login`'e gider. |

**Eski yollar.** `/bugun` → `/benim`; `/login/*` → `/login`; `/denetim` ve `/audit` → `/gecmis`; `/portfolio` → `/portfoy`;
`/limits` ve `/admin` → `/ayarlar`; `/inbox`, `/approvals`, `/brief`, `/eval`, `/runs/*` → en yakın ekran. `src/lib/nav.ts`
tek kaynaktır. Tanımsız yol tasarlanmış bir 404'e gider.

**İlk açılış.** "KAPtan nasıl çalışır" üç kısa adımdır: geçilebilir, bir kez gösterilir ve hatırlanır.

**Durdurma.** Durdurma düğmesi Param'dadır. Durdurmak yeni emri keser, bekleyen öneriler düşer, açık emirler iptal edilir.
Elindeki hisseler **satılmaz**; her biri kendi çıkış kuralıyla kapanır. Durdurulmuş sistemde başlığın altında bir durum
satırı vardır. Yeniden başlatma iki adımdır (API.md §3.1): gerçek veride en erken tarihi söylenir ve beklenir;
demo hesabında bekleme yoktur.

## 2. Tek kişi kuralları

- Hesapta tek kişi vardır ve adı **"Sen"**dir. Denetim kayıtlarında aktör "Sen" ya da "KAPtan" olarak görünür.
- Rol seçici, kapılar, rol rozetleri, "Kim ne yapabilir?" tablosu, takım bölümü, iki imza satırları, "ikinci imza" ifadesi,
  "dört göz", "Kişisel moda geç", "Gelişmiş görünüm" ve rehberli tur **yoktur**.
- İkinci imza yerine geçilen her işlem denetim defterine `auth.single_user_waiver` olarak yazılır. Arayüz bunu sessizce
  yapmaz: Geçmiş'te görünür bir satırdır.
- Panel yetki kontrolü yapmaz. Oturum açmış kullanıcı her düğmeye basabilir; hatalı durumlar API'nin `409`'u ve `422`'si ile
  açıklanır.

## 3. Öneri dürüstlüğü

- Her öneri **belirsizliğini** söyler: "KAPtan bu konuda emin değil" ya da "Benzer olaylar karışık sonuç verdi" gibi düz bir cümle.
- Her öneri **KAPtan'ın emir vermediğini** söyler: onaylarsan girilecek bir emir çıkar, emri kendi aracı kurumunda sen girersin.
- Getiri **vaat edilmez**. Geçmiş olayların ne getirdiği bir sayı olarak gösterilir, "örnek değer" ya da "geçmiş" etiketiyle.
- Her sayı ne olduğunu söyler: "Başladığından beri +18.615 ₺". Sayılar API'den ya da mock'tan gelir; panel hiçbir sayı uydurmaz.
- Aciliyet dili ("hemen al", "kaçırma") yazılmaz.

## 4. Oturum

- **Mock.** Parola `kaptan2026`, giriş sayfasında yazılıdır. `POST /api/mock/session {passphrase}` → `kaptan_mock_session`
  çerezi (8 saat). Demo içindir, güvenlik sınırı değildir.
- **http.** Tek parola; JWT bellekte, yenileme çerezi `__Host-kaptan_rt`. Ayrıntı: API.md §2.
- **Proxy** (`src/proxy.ts`). Uygulama rotaları oturum ister; `/`, tanıtım sayfasının dosyaları ve statik varlıklar açıktır.
- Mock ve http modu birlikte kalır. Mock saat **11.01.2027 Pazartesi 13:40 (İstanbul)** ile başlar ve gerçek zamanla ilerler.

## 5. Dil: "büyükannem testi"

Her görünür metin Türkçedir, doğru Türkçe karakterlerle, ikinci tekil şahısla ("sen") ve kısa cümlelerle yazılır. Hiç
borsa yapmamış biri her ekranı yardım almadan anlayabilmelidir. Bir finans terimi kaçınılmazsa yanında düz bir açıklama
durur.

**Görünür metinde (panel ve tanıtım sayfası, aria-label dahil) yasak sözcükler:** analist, risk sorumlusu, risk officer,
admin, denetçi/auditor (rol olarak), yönetici (rol olarak; bir şirketin yöneticisinin hisse alımı bildirimde geçebilir),
ekip, takım, masa, üye, rol, ikinci imza, iki imza, dört göz, onay zinciri, kişisel mod, tek kullanıcı modu, gelişmiş görünüm,
Sharpe, RAG, p95, drawdown, kill switch, escalate, emir fişi (yerine "girilecek emir"), seans (yerine "borsa günü" ya da
"bugün"), lot (yerine "adet"), limit fiyat (yerine "en fazla X ₺'den"), portföy (etiket olarak; "Param"), denetim (yerine
"Geçmiş"), ajan adları ana ekranlarda jargon olarak.

**Yazılmaz.** Ders adları, "ders projesi", "yatırım tavsiyesi değildir" ve benzeri yasal uyarılar. Hukuki bilgiler
dokümanlarda kalır; uygulama içinde yoktur.

**Yalnızca iki adres.** Uygulama ve belgelerde yalnızca `https://kaptan-seng429.vercel.app/` ve
`https://github.com/cozalss/kaptan-seng429` görünür.

## 6. Görsel çizgi

Hedef: bir tasarım yarışmasının jürisinin "bu ne, kim yaptı?" diyeceği bir uygulama. Standart bir panel gibi görünmemeli.

**Marka kuralları**
- Bodoni Moda yalnızca ≥ 32 px'de; bütün gövde metni Inter. Rakamlar Inter, tabular; çok büyük gösterimlerde ayrıksı.
- Palet: indigo-lacivert mürekkep, serin kâğıt, tek bir işaret kırmızısı ("kuzey"), kazanç ve kayıp mürekkepleri. Kuzey
  kırmızısı yalnızca durdurma, veto ve bozuk kayıt için.
- Metin kontrastı ≥ 7:1 (sınıf projektöründe gösterilir). Hem açık hem koyu tema (`prefers-color-scheme`) bilerek tasarlanır.
- Hareket: yalnızca transform, opacity ve clip-path. Her animasyonun bir amacı vardır. `prefers-reduced-motion`'a uyulur;
  animasyon kesilebilir; hiçbir şey 300 ms'den uzun girdiyi engellemez. INP < 200 ms, CLS < 0,1.
- Dokunma hedefleri ≥ 44 px. 360 px genişlikte yatay kaydırma yok. axe temiz; tam klavye kullanımı.
- Dünya: tanıtım sayfası mürekkep çizgi romanıdır (küçük bir tekne, kırmızı bayrak, pusula, fırtına). Uygulama aynı dünyanın
  daha sakin, büyümüş hâlidir: aynı tekne, aynı mürekkep.

**Ufuk (kavram).** Ekranların ortak dili:
1. **Ufuk para çizgisidir.** Başladığın değer su çizgisidir. Üstü artı, altı eksi; tek bakışta anlaşılır. Ana sayfada grafik bir
   kart değil, tam genişlikte bir sahnedir: alan mürekkep taramasıyla doldurulmuş, küçük tekne bugünün noktasında durur. Para hareketleri
   çizgi üzerinde işaretlerle görünür ("KRGSG aldın"), "paramın nereye gittiği" grafikte cevaplanır.
2. **Önce tek cümle.** Her ekran büyük bir Bodoni cümlesiyle açılır: "Paran bugün 2.135 ₺ arttı." Rakamlar ve ayrıntılar sonra gelir.
3. **Kararlar fiziksel.** Bir öneri büyük bir nesnedir: büyük fiil (AL / TUT / SAT), tek cümle, tutar, "Neden?". Onaylamak
   bir mühür basar (kısa, ağır bir yaylanma), sonra öneri "Son işlemler"e uçar. Bu uygulamanın imza anıdır; 600 ms'de biter
   ve azaltılmış hareketle anında olur.
4. **Kartsız derinlik.** Tam genişlikte bantlar, üst üste binmeler, ince çizgiler, tabular ritim, kâğıt dokusu. Aynı köşe
   yarıçaplı beyaz kartlar, eşit dolgular, gradyan lekeler ve varsayılan kütüphane görünümleri yoktur. Ölçek kontrastı ana araçtır.
5. **Veri görselleştirme tasarımın kendisidir.** "Param nerede?" orantılı bir haritadır: alan = para, nakit taranmış bir blok,
   her etiket okunur. Renk, sıralamaya değil varlığa göre verilir.
6. **Ayrıntılar.** Akan rakamlar, öneri ile `/oneri/[id]` arasında ortak öğe geçişi (View Transitions desteklenen yerde),
   tasarlanmış üzerine gelme / odak / etkin / boş / yükleniyor / hata / durdurulmuş durumları, tasarlanmış 404, ilk açılışta
   "KAPtan nasıl çalışır".

## 7. Demo ve örnek veri

- Mock verisi tek bir kişiyi anlatır: "Üye 3", ekip üyesi, takım kaydı ya da rol yoktur. Denetim ve etkinlik kayıtlarında
  aktör "Sen" ya da "KAPtan"dır.
- Kurgusal şirketler açıkça kurgusaldır (ÖRNEK ENERJİ A.Ş., DEMO GIDA A.Ş., TEMSİLİ LOJİSTİK A.Ş.). Gerçek şirket, gerçek fiyat ya da
  gerçek sinyal yoktur.
- Örnek sayılar "örnek değer" etiketiyle gösterilir. Uydurma sonuç gerçek gibi sunulmaz.
- Demo enjeksiyonları "DEMO FİKSTÜRÜ" etiketi taşır; canlı ile fikstür ayrımı gizlenmez.
- Demo hesabında yeniden başlatmanın beklemesi yoktur (API.md §3.1).
