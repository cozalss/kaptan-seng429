# KAPtan — Terimler Sözlüğü (TR – EN)

> Proje dokümanlarında, sunumda ve kodda kullanılan terimlerin ortak dili. Parametreler `_KANONIK-KARARLAR.md` ile uyumludur. Kodda İngilizce karşılık kullanılır. Kullanıcıya dönük arayüzde Türkçe terim kullanılır.

## A. Piyasa, düzenleme ve veri

| # | Türkçe terim | English term | Kısa açıklama |
|---|---|---|---|
| 1 | KAP (Kamuyu Aydınlatma Platformu) | Public Disclosure Platform | Borsa İstanbul şirketlerinin yasal bildirimlerini yayımladığı resmî platform (MKK işletir). Günde ~350 bildirim yayımlanır. Sistemin ana veri kaynağıdır. |
| 2 | Özel durum açıklaması | Material event disclosure | Yatırım kararını etkileyebilecek bilgilerin kamuya açıklanması (SPK Tebliğ II-15.1). "Özel Durum Açıklaması (Genel)" konulu bildirimler LLM ile sınıflandırılır. |
| 3 | Bildirim konusu (`subject`) | Disclosure subject field | KAP'ın her bildirime verdiği tip etiketi. Bildirimlerin ~%90'ını zaten tipler, bu yüzden LLM'siz ön elemede kullanılır. |
| 4 | Eşzamanlı İngilizce bildirim | Simultaneous English disclosure | 1 Ekim 2026'dan itibaren tüm BIST şirketlerinin özel durum açıklamalarını TR ve EN olarak aynı anda yayımlama zorunluluğu. |
| 5 | Pay geri alım (işlemi) | Share buyback (execution) | Şirketin kendi hissesini piyasadan geri alması. E1 olayı yalnızca gerçekleşen alımı kapsar, duyuruyu değil: 10 seansta ≥ sermayenin %0,25'i. |
| 6 | Yönetici / ana ortak alımı | Insider / controlling-shareholder purchase | Yöneticiler, yönetim kurulu üyeleri veya kontrol eden pay sahiplerinin piyasadan hisse alması. E2 olayıdır. Kümelenmiş alım aranır. Fonların eşik bildirimleri (%5 vb.) E2 değildir. |
| 7 | Yeni iş ilişkisi / ihale | New business relationship / tender | Şirketin önemli bir sözleşme veya ihale kazanması. KAP'ta ayrı `subject` olarak gelir ("Yeni İş İlişkisi", "İhale Süreci / Sonucu"). E3 olayıdır (BIST'e özgü kanıt olmadığı için keşifsel): yıllıklandırılmış tutar ≥ yıllık gelirin %10'u (gelir karar tarihinde yoksa tutar / piyasa değeri), bağlayıcı, ilişkili taraf değil. |
| 8 | Finansal sonuç | Financial results | Dönemsel finansal rapor. E4 olayıdır. Yapılandırılmış finansal veri, enflasyon muhasebesi (TMS 29) ve rapor dili birlikte değerlendirilir; genel PDF ayrıştırma stretch'tir. |
| 9 | Tedbir (SPK / Borsa tedbiri) | Trading restriction / measure | Hisseye uygulanan brüt takas, tek fiyat, kredili işlem ve açığa satış yasağı gibi kısıtlamalar. Tedbirli hisseye **sert veto** uygulanır. |
| 10 | Volatilite bazlı tedbir (VBTS) | Volatility-based measure system | Borsa İstanbul'un aşırı fiyat hareketlerine otomatik olarak uyguladığı tedbirler. Yalnızca kaçınma/çıkış filtresi olarak kullanılır. |
| 11 | Devre kesici | Circuit breaker | Fiyat belirli bir eşiği aşınca işlemleri geçici olarak durduran mekanizma. İlgili KAP bildirimleri toplamın ~%28'idir ve baştan elenir. |
| 12 | Halka açıklık oranı | Free float | Payların piyasada serbestçe işlem gören kısmı. Düşük halka açıklık manipülasyon riskini artırır, bu yüzden evren filtresinde alt sınır var. |
| 13 | Tavan / taban | Upper / lower price limit | Bir seansta izin verilen en yüksek ve en düşük fiyat. Risk kapısı emir fiyatını bu sınırlara göre kontrol eder. |
| 14 | Bedelsiz sermaye artırımı | Bonus issue | Şirketin iç kaynaklarından ücretsiz pay dağıtması. "Heyecan" etkisi nedeniyle yalnızca kaçınma filtresidir. |
| 15 | Bedelli (sulandırıcı) sermaye artırımı | Dilutive rights issue | Yeni pay satışı yoluyla sermaye artırımı. Mevcut ortakların payını sulandırır, kaçınma filtresidir. |
| 16 | Piyasa bozucu eylem | Market abuse / manipulation | Fiyatı yapay olarak etkileyen işlem veya bilgi yayma (SPKn md. 106–107). Uyum ajanının RAG tabanında yer alır. |
| 17 | Yatırım danışmanlığı | Investment advisory | Başkasına al-sat önerisi vermek. Lisans gerektirir. Bu yüzden sinyaller kimseyle paylaşılmaz. |
| 18 | Evren | (Investable) universe | Sistemin işlem yapabileceği hisse listesi. Likidite ve halka açıklık alt sınırıyla belirlenir. |
| 19 | İlk görülme zamanı | First-seen timestamp | Bir bildirimin bizim poller'ımız tarafından ilk görüldüğü an. Gecikme ölçümü ve geleceğe bakmama kontrolü için tutulur. |
| 20 | Kibar polling | Polite polling | KAP uçlarını seans içinde en az 30 sn aralıkla, önbellek ve geri çekilme (backoff) kullanarak sorgulamak. |

## B. Finans ve değerlendirme

| # | Türkçe terim | English term | Kısa açıklama |
|---|---|---|---|
| 21 | Anormal getiri | Abnormal return | Hissenin getirisinden karşılaştırma ölçütünün (BIST-100) getirisinin çıkarılmasıyla bulunan fark. Olay hafızasında 1/5/20/60 günlük değerler saklanır. |
| 22 | Kümülatif anormal getiri (KAG) | Cumulative abnormal return (CAR) | Bir olay penceresi boyunca anormal getirilerin toplamı, ör. CAR[0,+5]. |
| 23 | Olay çalışması | Event study | Bir olay türünün fiyat üzerindeki ortalama etkisini geçmiş örnekler üzerinden ölçen yöntem. Kanıt kartının temelidir. |
| 24 | Bildirim sonrası sürüklenme | Post-announcement drift | Fiyatın bilgiyi tek seferde değil günler/haftalar içinde yansıtması. Basit bilgi BIST'te de saniyeler içinde fiyatlanır (Ersan vd. 2021); strateji yalnızca karmaşık/yavaş fiyatlanan bilgideki sürüklenmeyi hedefler. |
| 25 | Bilgi sızıntısı / önceden fiyatlanma | Information leakage / pre-event run-up | Fiyatın bildirimden önce hareket etmesi. Son 5 seansta >%8 yükseliş varsa işlem atlanır veya yarıya indirilir; E4 için ayrıca son 10 seansta >%12 yükseliş kontrol edilir. |
| 26 | Geliştirme dönemi | In-sample / development period | Kuralların tasarlandığı veri dönemi: 2018–2024. |
| 27 | Dokunulmamış test seti | Holdout | Kurallar sabitlenene kadar hiç bakılmayan veri: 2025-01-01 → 2026-10-31. Yalnızca bir kez çalıştırılır; projenin ana sayısal kanıtı ve aşırı uydurmaya karşı ana korumadır. |
| 28 | Geleceğe bakma yanlılığı | Look-ahead bias | Karar anında bilinmeyen bir bilginin analize sızması. Her RAG aramasında `published_at < karar_anı` filtresi bunu önler. |
| 29 | Aşırı uydurma | Overfitting | Kuralların geçmiş veriye fazla uyması ve yeni veride çalışmaması. |
| 30 | Geriye dönük test | Backtest | Kuralları geçmiş veride simüle etmek (vectorbt + kendi replay harness'ımız). |
| 31 | İleri dönük paper test | Forward paper test | Dondurulmuş sürümlerin canlı veriyle, sanal parayla finale kadar çalıştırılması: `v1.0-fwd` 9 Kasım 2026'dan, `v1.1-fwd` 23 Kasım 2026'dan itibaren. Az işlem kapanacağı için destekleyici kanıttır. |
| 32 | Kâğıt üzerinde işlem | Paper trading | Gerçek para kullanmadan, gerçek fiyatlarla simüle edilen işlem. Ders kapsamındaki tek işlem modudur (SimBIST; AlpacaPaper stretch). |
| 33 | Karşılaştırma ölçütü | Baseline / benchmark | Sonuçların kıyaslandığı basit strateji: BIST-100 al-tut, eşit ağırlıklı evren. |
| 34 | Bileşen çıkarma deneyi | Ablation | Sistemden bir bileşen çıkarılarak veya değiştirilerek etkisinin ölçülmesi: yalnızca `subject` kuralı, serbest LLM (aynı risk kapısından geçer), şüphecisiz/ajansız sürüm (`v1.0-fwd`), backtest'te "onaysız" sürüm. |
| 35 | Sharpe oranı | Sharpe ratio | Risksiz getiri üzerindeki fazla getirinin oynaklığa oranı. Riske göre düzeltilmiş getiri ölçüsüdür. |
| 36 | Maksimum düşüş | Maximum drawdown | Portföy değerinin bir zirveden sonraki en büyük yüzde kaybı. |
| 37 | İsabet oranı | Hit rate | Kârla kapanan işlemlerin toplam işlemlere oranı. |
| 38 | Kayma | Slippage | Beklenen fiyat ile gerçekleşen fiyat arasındaki fark. SimBIST komisyonla birlikte bunu da modeller. |
| 39 | Emir fişi | Order ticket | Kişisel modda sistemin ürettiği ve kullanıcının aracı kurum uygulamasına elle girdiği limitli emir önerisi. |

## C. Yapay zekâ, ajanlar ve RAG

| # | Türkçe terim | English term | Kısa açıklama |
|---|---|---|---|
| 40 | Büyük dil modeli (BDM) | Large language model (LLM) | Metin okuyup üreten model (Gemini Flash-Lite, Groq'ta gpt-oss, Qwen). KAPtan'da okur, sınıflandırır ve kanıt toplar ama **karar vermez**. |
| 41 | Ajan | Agent | Araç çağırabilen ve durumu okuyup yazabilen LLM düğümü. 6 LLM ajanı var: Sınıflandırıcı, Okuyucu, Önemlilik, Kanıt, Şüpheci, Uyum. |
| 42 | Deterministik düğüm | Deterministic node | LLM içermeyen, aynı girdiye her zaman aynı çıktıyı veren Python düğümü: Birleştirme düğümü, Kural motoru ve Risk kapısı. |
| 43 | Kural motoru | Rule engine | E1–E4 kurallarını uygulayıp `TradeProposal` (Pydantic) üreten deterministik kod. Al kararını bu verir. |
| 44 | Risk kapısı | Risk gate | Öneriyi yalnızca küçültebilen veya reddedebilen deterministik kontrol katmanı. %100 test kapsamı vardır. Kuralların (R01–R16) tek kaynağı `06-strateji-ve-kurallar.md`'dir. |
| 45 | Getirme destekli üretim (GDÜ) | Retrieval-augmented generation (RAG) | LLM'e yanıt üretmeden önce ilgili belgeleri getirip bağlam olarak vermek. 3 taban var: bildirim arşivi, olay hafızası, kural ve mevzuat. |
| 46 | Gömme (vektör temsili) | Embedding | Metnin anlamını temsil eden sayısal vektör. bge-m3 (çok dilli, TR+EN) kullanılır. |
| 47 | Vektör veritabanı | Vector database | Gömmeleri saklayıp benzerlik araması yapan veritabanı. Ana seçim pgvector (`PGVectorStore` + `PGEngine`), karşılaştırma için Chroma. |
| 48 | Hibrit arama | Hybrid search | Yoğun vektör aramasının (bge-m3) sözcük tabanlı aramayla (Postgres `turkish` FTS + trigram) birleştirilmesi. Türkçede BM25, dense ve hibrit arasında anlamlı fark bulunmadı (dense'in açık üstünlüğü yok); hibrit, dayanıklılık için tercih edilir. |
| 49 | Kanıt kartı | Evidence card | Benzer geçmiş olayları ve gerçekleşen getirilerini gösteren, her öneriye eklenen özet. Kanıt ajanı olayları getirilerini görmeden seçer; ortalama CAR, isabet oranı ve n'i kod hesaplar. |
| 50 | Paralel dağıtım | Fan-out (`Send`) | LangGraph'ta birden çok düğümü aynı anda başlatma. Okuyucu, Önemlilik ve Kanıt paralel çalışır. |
| 51 | İnsan döngüde | Human-in-the-loop (HITL) | Kritik adımda insan onayı beklenmesi. Otomatik yürütme yoktur: risk kapısından geçen her öneri Risk Officer onayına gider; yanıtlanmayan onay bir sonraki seansın 09:50'sinde düşer. Backtest'te onay simüle edilir. |
| 52 | Kesme | Interrupt (`interrupt()`) | LangGraph'ta grafı duraklatıp dış girdi bekleyen çağrı. Onaydan sonra `Command(resume=...)` ile devam edilir. |
| 53 | Durum kaydedici | Checkpointer | Graf durumunu her adımda kalıcı olarak saklayan bileşen (`AsyncPostgresSaver`). Bu sayede kesintiden sonra kalınan yerden devam edilebilir. |
| 54 | Yapılandırılmış çıktı | Structured output | LLM çıktısının Pydantic şemasına zorlanması. Serbest metin yerine doğrulanabilir alanlar elde edilir. |
| 55 | İstem enjeksiyonu | Prompt injection | Girdi metnine (ör. sahte bildirime) gizlenmiş, modeli yönlendirmeye çalışan talimat. Prompt Guard + Uyum ajanı + yapısal yetki sınırıyla engellenir. |
| 56 | Kırmızı takım seti | Red-team set | Saldırı senaryoları içeren test fikstürleri: ≥ 30 kötü niyetli vaka (içine talimat gizlenmiş bildirimler) + zararsız kontrol vakaları. Kötü niyetli vakadan 0 emir sert kapıdır; engelleme ≥ %95 hedeflenir, yanlış alarm oranı raporlanır. |
| 57 | Altın set | Gold set | Elle etiketlenmiş referans veri: sınıflandırma için 300 bildirim (100 geliştirme + 200 kilitli test; sınıflar E1–E4 + X + O), RAG için 50 soru. |
| 58 | F1 skoru | F1 score | Kesinlik (precision) ve duyarlılığın (recall) harmonik ortalaması. Sınıflandırma kalitesinin ölçüsüdür. |
| 59 | Sadakat (RAGAS) | Faithfulness | Üretilen yanıtın getirilen bağlama ne kadar dayandığı. Ayrıca context precision/recall ölçülür (RAGAS 0.4). |
| 60 | Halüsinasyon | Hallucination | LLM'in kaynakta olmayan bilgi veya sayı üretmesi. Kanıt kartındaki sayılar LLM'den değil veritabanından gelir. |
| 61 | Kota / HOLD modu | Quota / HOLD mode | LLM API limiti bittiğinde sistemin yeni karar üretmeyip beklemesi. Güvenli varsayılan budur. |

## D. Kurumsal (enterprise) ve güvenlik

| # | Türkçe terim | English term | Kısa açıklama |
|---|---|---|---|
| 62 | Rol tabanlı erişim kontrolü | Role-based access control (RBAC) | Yetkilerin rollere bağlanması. Analist (görür, not ekler), Risk Officer (onay/ret, kill switch, limitler), Admin (kullanıcı, evren, config), Auditor (salt okunur denetçi). |
| 63 | İkinci onay (dört göz ilkesi) | Four-eyes / dual approval | Limit değişikliği ve kill switch reset gibi kritik işlemlerde ikinci bir yetkilinin onayı. |
| 64 | Acil durdurma anahtarı | Kill switch | Zirveden %-5 kayıpta (veya Admin / Risk Officer elle tetiklediğinde) tüm yeni emirleri durdurup açık emirleri iptal eden mekanizma. Açık pozisyonları **satmaz**; onlar kendi çıkış kurallarıyla kapanır. Reset için Admin + Risk Officer gerekir; kişisel modda iki onay arasında ≥ 24 saat + 5 seans beklenir. |
| 65 | Günlük zarar limiti | Daily loss limit | Günlük %-1 kayıpta yeni emir verilmesini durduran kural. |
| 66 | Denetim kaydı | Audit log | Bildirimden dolum emrine kadar her adımın kaydı. Yalnızca ekleme yapılabilir (append-only). |
| 67 | Hash zinciri | Hash chain | Her audit kaydının bir önceki kaydın hash'ini içermesi. Bir kayıt değiştirilirse zincir kırılır ve "Zinciri doğrula" bunu yakalar. |
| 68 | İzlenebilirlik / canlı iz | Tracing / observability | Ajan adımlarının, token kullanımının ve sürelerin izlenmesi (LangSmith). |
| 69 | Broker adaptörü | Broker adapter | Aynı arayüzle farklı yürütme hedeflerine bağlanan katman: SimBIST (paper, ana), OrderTicket (kişisel, manuel), AlpacaPaper (ABD karşılaştırma, stretch). |
| 70 | Canlı mod için üç anahtar | Three-key live mode | Canlı moda geçiş için config + ortam değişkeni + arayüz onayının üçünün birden gerekmesi. |
| 71 | Gizli bilgi yönetimi | Secret management | API anahtarlarının koda gömülmeden şifreli olarak saklanması (SOPS/age). Sızıntı taraması gitleaks ile yapılır. |

## E. Revizyon 2 ile eklenen terimler

| # | Türkçe terim | English term | Kısa açıklama |
|---|---|---|---|
| 72 | Birleştirme düğümü | Merge node | Okuyucu, Önemlilik ve Kanıt çıktılarını toplayan deterministik düğüm. Tüm oranları (ör. E3 önemliliği) `Decimal` ile hesaplar, Okuyucu'nun tutarını metinden regex ile çıkarılan tutarlarla karşılaştırır (yoksa ret, R14) ve kanıt istatistiklerini üretir. LLM hiçbir oranı hesaplamaz. |
| 73 | LLM'siz ön eleme | LLM-free pre-screen | LLM çağrılmadan önce kodla yapılan eleme: gürültü (devre kesici vb.), "Düzeltme" bildirimleri, işlem göremeyen hisseler, SPK/VBTS tedbiri (R04), evren (R03), ekip engel listesi (R13). |
| 74 | Ekip içeriden-öğrenen engel listesi | Team restricted list | Ekip üyelerinin bağlantılı olduğu hisselerin listesi (`restricted_securities`). Bu hisselerde öneri üretilmez (R13). |
| 75 | `v1.0-fwd` | Forward version 1.0 | 9 Kasım 2026'da dondurulan ilk ileri dönük sürüm: Sınıflandırıcı + kurallar (Kanıt, Şüpheci, Uyum yok). Aynı zamanda "şüphecisiz/ajansız" ablation koludur. |
| 76 | `v1.1-fwd` | Forward version 1.1 | 23 Kasım 2026'da dondurulan, tüm ajanları içeren ileri dönük sürüm. `v1.0-fwd` ile paralel koşar; sonuçlar sürüm bazında ayrı raporlanır. |
| 77 | Sürüm manifesti | Version manifest | Bir ileri dönük sürümün tam sürüm model kimliklerini (alias değil), prompt hash'lerini ve config'ini kaydeden dosya. |
| 78 | Kilitli test seti | Locked test set | Altın setin prompt geliştirmede hiç kullanılmayan 200 bildirimlik kısmı. Makro-F1 (hedef ≥ 0,85) yalnızca burada raporlanır. |
| 79 | X ve O sınıfları | X (filter/avoid) and O (other) classes | Altın setteki E1–E4 dışı sınıflar: X = çıkış/kaçınma filtresi olayları (tedbir, bedelsiz, sulandırıcı bedelli vb.), O = diğer. |
| 80 | Sert kapı | Hard gate | İhlal edilirse CI'ın kırıldığı, pazarlığı olmayan ölçüt. Ör. retrieval zaman ihlali = 0, red-team kötü niyetli vakasından emir = 0. |
| 81 | Kullanılabilirlik zamanı | `available_at` (point-in-time) | Bir verinin (getiri, finansal) gerçekte ne zaman bilinir hâle geldiği. Getiriler `event_returns` tablosundan bu filtreyle okunur. |
| 82 | Gölge getiri | Shadow return | Reddedilen bir sinyal işleme girilseydi elde edeceği getiri. İleri dönük testte ret gerekçesiyle birlikte izlenir. |
| 83 | Gölge aşaması | Shadow stage | Kişisel planda Aşama 1 (paper) ile Aşama 2 (küçük gerçek para) arasındaki aşama: sistem emir fişi üretir, gerçek para kullanılmaz, fişler ve o anki uygulama fiyatları kaydedilir. |
| 84 | Tamamen durma kuralı | Full-stop rule | Kişisel modda zirveden %-10 kayıp veya 12 ay boyunca BIST-100'ü geçememe durumunda gerçek parayla kullanıma son verilmesi. |
| 85 | Onay süresi sonu | Approval expiry | Yanıtlanmayan onayın bir sonraki seansın 09:50'sinde `expired` olması (R15). |
| 86 | Demo modu | Demo mode | Final demosunda kullanılan kanonik mod: bildirim fixture'ları yalnızca Admin tarafından, yalnızca demo ortamında enjekte edilir ve replay ile oynatılır; ekranda "DEMO FİKSTÜRÜ" etiketi taşır. Canlı sayaç her zaman gerçektir. |
| 87 | Auditor (denetçi rolü) | Auditor role | Kararları, "Neden bu işlem?" ekranını ve audit zincirini salt okunur gören RBAC rolü. |
| 88 | Geri alım dalgası | Buyback wave | SPK'nın 22.09.2026'da (karar 60/1711) geri alımlardaki toplam tutar üst sınırını geçici olarak kaldırmasından sonra artan geri alımlar (sonraki hafta 60 şirket ~1,99 milyar TL). E1 içinde ayrı alt grup olarak analiz edilir. |
| 89 | Kapanış bazlı ATR stop | Close-based ATR stop | Yalnızca seans kapanış fiyatıyla kontrol edilen, 20 seanslık ATR'den türetilen stop. İşlem başına %0,5 risk büyüklüğü bu `stop_pct` ile hesaplanır. |
| 90 | İsim maskeleme (KVKK) | Personal-name masking | Bildirimlerdeki kişi isimlerinin LLM'e ve LangSmith'e gönderilmeden önce yer tutucuyla değiştirilmesi. |

---

**Not:** Liste istenen ~50 terimin üzerinde tutuldu (90). A–B bölümleri finans tarafına, C–D bölümleri ders içeriğine (LLM, ajanlar, LangGraph, RAG, vektör DB) ve enterprise tarafına, E bölümü kanonik Revizyon 2 ile gelen terimlere karşılık gelir. Sunum sırasında jüri sorusu gelirse bu tanımlar tek cümlelik cevap olarak kullanılabilir.
