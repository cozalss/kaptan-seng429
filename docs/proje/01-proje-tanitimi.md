# KAPtan — Proje Tanıtımı

> Ekibe, hocaya veya projeyi ilk kez duyan birine 5 dakikada anlatmak için.

## Problem

Borsa İstanbul'daki şirketler önemli bir gelişme olduğunda bunu **KAP**'ta (Kamuyu Aydınlatma Platformu) duyurmak zorunda: yeni bir sözleşme, kendi hissesini geri alma, yöneticinin hisse alması, bilanço… Günde yaklaşık **350 bildirim** geliyor ve 1 Ekim 2026'dan itibaren Türkçe ve İngilizce olarak eşzamanlı yayınlanıyor.

Bir fon yöneticisi ya da bireysel yatırımcı bunların hepsini okuyamaz. Okusa bile iki soruya cevap vermesi zor:
- Bu bildirim **gerçekten önemli mi?**
- **Geçmişte** bu tür bildirimlerden sonra hisse ne yaptı?

Üstelik portföy yönetim şirketleri her kararın gerekçesini SPK denetçisine gösterebilmek zorunda.

## KAPtan ne yapıyor?

KAP'ı sürekli izleyen, önemli bildirimleri yakalayan, **kanıtla** değerlendiren ve işlem öneren bir yapay zeka ekibi. Kararı yapay zeka değil **kurallar**, son onayı **insan** verir. Otomatik yürütme yoktur: risk kapısından geçen her öneri insan onayına gider.

## Bir örnekle adım adım

Saat 14:05'te bir şirket KAP'a şunu yazıyor: *"Yıllık gelirimizin %15'i büyüklüğünde yeni bir ihale kazandık."*

| # | Adım | Ne oluyor |
|---|---|---|
| 1 | **Yakalama** | Sistem KAP'ı seans içinde en sık 30 saniyede bir kontrol ediyor ve bildirimi görüyor |
| 2a | **LLM'siz ön eleme** (düz kod) | Gereksizleri yapay zekaya hiç göndermeden eliyor: günde ~100 devre kesici bildirimi, işlem göremeyen veya SPK tedbirli hisseler, evren dışı hisseler |
| 2b | **Sınıflandırıcı ajan** | KAP'ın `subject` alanı çoğu bildirimi zaten tipliyor; tip belirsizse ajan devreye giriyor: "Bu bir *önemli sözleşme* bildirimi (E3)." |
| 3a | **Okuyucu ajan** | Bildirim metnini okuyor; tutar, karşı taraf, süre çıkarıyor |
| 3b | **Önemlilik ajanı** | Yalnızca sayıları getiriyor: şirketin yıllık geliri, piyasa değeri, döviz kuru. Hesap yapmıyor |
| 3c | **Kanıt ajanı** (RAG) | Geçmişteki benzer 23 olayı, sonrasında ne olduğunu **görmeden** seçiyor |
| 3d | **Birleştirme düğümü** (düz kod) | Oranları kod hesaplıyor: "Tutar yıllık gelirin %15'i, gerçekten büyük." Okuyucu'nun tutarı metinde gerçekten geçiyor mu, onu da kontrol ediyor. Kanıt istatistiği de burada çıkıyor: "Benzer olaylardan sonraki 5 günde ortalama +%1,4" |
| 4 | **Şüpheci ajan** | Açık arıyor: "Hisse son 5 günde zaten %9 yükselmiş, haber sızmış olabilir → pozisyonu yarıya indir" |
| 5 | **Kural motoru** (düz kod) | "E3 kuralları sağlanıyor → 5 gün tutulacak alım önerisi" |
| 6 | **Uyum ajanı** | "Hissede SPK tedbiri yok, bildirimde sistemi kandırmaya çalışan gizli talimat yok" |
| 7 | **Risk kapısı** (düz kod) | Pozisyon büyüklüğü, günlük zarar limiti, likidite kontrolü. Sadece küçültür veya reddeder |
| 8 | **İnsan onayı** | Ekrana kart düşüyor: bildirim + kanıtlar + şüphecinin notu + önerilen emir. Risk yöneticisi onaylıyor; yanıtlanmayan öneri bir sonraki seansın 09:50'sinde düşüyor |
| 9 | **İşlem** | Derste: sanal parayla. Kişisel kullanımda: **emir fişi** ("X'ten 40 adet al, 5 gün sonra sat") → aracı kurum uygulamasından elle girilir |
| 10 | **Kayıt** | Her adım değiştirilemez denetim kaydına yazılıyor: "Bu hisseyi neden aldık?" sorusunun cevabı orada |

## Neden kararı yapay zeka vermiyor?

Araştırmalar net: yapay zekaya "sen karar ver" dendiğinde çoğu zaman para kaybediyor. FINSABER (KDD 2026) bildirilen yapay zeka avantajlarının uzun dönemde eridiğini gösterdi; StockBench'te çoğu model al-tut stratejisini geçemedi (bazıları geçti). Gerçek parayla yapılan iki haftalık Alpha Arena 1.5 yarışmasında 32 hesaptan yalnızca 6'sı kârda kaldı; bu kısa dönemli ve rakamı ikincil kaynaktan gelen, destekleyici ama zayıf bir kanıt. Ama yapay zeka **okumada ve sınıflandırmada** çok iyi.

Bu yüzden: **yapay zeka okur ve anlar, kurallar karar verir, insan onaylar.**

## Hangi bildirimlere göre işlem yapılıyor?

4 tür (sadece alım, açığa satış ve kaldıraç yok). E1 ve E2 için BIST'te fiyat etkisi raporlanmış (Ünal 2022: geri alımdan sonra endekse göre 1 ayda +%2,0, 3 ayda +%3,4; işlem tarihinden ve maliyetsiz ölçülmüş, bu yüzden üst sınır sayılır). E3 için BIST'e özgü çalışma yok; **keşifsel** tür, kanıtı kendi olay çalışmamızdan gelecek:

| Tür | Örnek | Tutma süresi |
|---|---|---|
| **E1** | Şirket kendi hissesini **fiilen** geri alıyor | 20–40 gün |
| **E2** | Yönetici, yönetim kurulu üyesi veya kontrol eden pay sahibi piyasadan hisse alıyor (fonların %5 eşik bildirimleri sayılmaz) | 20–60 gün |
| **E3** | Büyük ve bağlayıcı sözleşme / ihale (yıllıklandırılmış tutar ≥ yıllık gelirin %10'u) | 5 gün |
| **E4** | Bilanço (yapılandırılmış finansal veri + enflasyon muhasebesi + rapor dili) | 5–10 gün |

## Neden "enterprise"?

Gerçek bir portföy yönetim şirketinde olması gereken her şey var:
- **Roller:** Analist görür · Risk yöneticisi onaylar · Admin yönetir · Auditor (denetçi) yalnızca okur
- **Acil durdurma (kill switch):** Zirveden %5 zararda yeni emir çıkmaz ve açık emirler iptal edilir; açık pozisyonlar panikle satılmaz, kendi çıkış kurallarıyla kapanır. Yeniden açmak için iki kişinin (Admin + Risk yöneticisi) onayı gerekir
- **Denetim kaydı:** Hash zincirli; SPK denetçisine her kararın gerekçesi gösterilebilir
- **"Neden bu işlem?" ekranı:** Kanıtlar, şüphecinin notu, kurallar
- **Sabah raporu:** Yöneticiye günün önemli bildirimleri

## Dersle bağlantısı

| Dersteki konu | Projede nerede |
|---|---|
| Large Language Models | Bildirimi okuma, sınıflandırma, bilgi çıkarma |
| Agentic AI + LangGraph | 6 ajan, paralel çalışma, insan onayı (`interrupt`) |
| LangChain | Yapılandırılmış çıktı, araç çağırma, retriever'lar |
| RAG | 3 bilgi tabanı: bildirim arşivi, geçmiş olay getirileri, SPK kuralları |
| Vector Databases | pgvector (asıl), Chroma (karşılaştırma) |

## Neyi ölçeceğiz?

1. **Sınıflandırma doğruluğu:** 300 bildirim elle etiketlenir (100 geliştirme + 200 kilitli test); hedef kilitli test setinde makro-F1 ≥ 0,85
2. **RAG kalitesi:** RAGAS skorları (faithfulness ≥ 0,85, context precision ≥ 0,70); geleceğe ait belge getirme ihlali 0
3. **Geçmiş test (ana sayısal kanıt):** 2018–2024 ile kurallar kurulur; 2025-01-01 → 2026-10-31 dönemine test anına kadar dokunulmaz ve bu test **yalnızca bir kez** çalıştırılır
4. **Canlı sanal para testi (destekleyici kanıt):** `v1.0-fwd` (9 Kasım; sınıflandırıcı + kurallar) ve `v1.1-fwd` (23 Kasım; tüm ajanlar) finale kadar, BIST-100 ile karşılaştırmalı. 20–60 günlük tutmalarla az işlem kapanacağı için bu test tek başına kanıt sayılmaz
5. **Güvenlik:** ≥30 kötü niyetli sahte bildirimden **hiç emir çıkmaması** (sert kapı)
6. **Asıl araştırma sorusu:** "Serbest karar veren yapay zeka" mı, "sınıflandıran yapay zeka + kurallar" mı daha iyi?

## Final sunumu (5 dakikalık demo)

Demo, **demo modunda** çalışır: canlı sayaç gerçektir; senaryolar önceden hazırlanmış bildirim fixture'larının enjekte edilmesi ve replay ile oynatılır, ekranda "DEMO FİKSTÜRÜ" olarak gösterilir.

1. Ekranda bugünkü canlı KAP bildirim sayısı: *"Hangisini okumalısınız?"*
2. Gerçek bir sözleşme bildirimi → ajanlar çalışır → kanıt kartı → onay → işlem
3. Sahte, kötü niyetli bildirim → sistem yakalar, engeller
4. Zarar simülasyonu → acil durdurma → denetim kaydı doğrulanır
5. Holdout sonuçları + ileri dönük sanal para sonuçları vs BIST-100
6. Kapanış: *"Aynı kod benim hesabımda çalışıyor, son butona ben basıyorum."*

## Ekip (4 kişi)

| Rol | Sorumluluk |
|---|---|
| 1. Veri & RAG | KAP'tan veri çekme, fiyatlar, bilgi tabanları |
| 2. Ajanlar | LangGraph ve 6 ajan |
| 3. Strateji, Risk & Yürütme | Kural motoru, risk kapısı, sanal broker |
| 4. Frontend & Değerlendirme | Web paneli, roller, sonuç raporları |

## Gerçekçi beklenti

Bu bir "zengin eden bot" değil. Beklenti BIST-100'e göre yılda **0 ile +%5** arası fazladan getiri; sıfır da çıkabilir. Maliyetler düşüldükten sonra kalıcı pozitif getiri bulma olasılığımız kabaca **%20–35**. Sıfır veya negatif sonuç da geçerli bir bulgu; araştırma sorusu her durumda cevaplanır. Projenin değeri: **riski yönetilen, denetlenebilir, ölçülen** bir yapay zeka karar destek sistemi.
