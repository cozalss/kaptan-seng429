# Fikir B — Kurul: haberle tetiklenen çok ajanlı yatırım masası

> **Not (30.09.2026, Revizyon 3):** Bu dosya tarihsel bir araştırma raporudur ve güncellenmez. Bazı bilgileri sonradan düzeltildi (ör. `kap-client` BIST hisselerinde çalışmıyor; Gemini Flash ücretsiz kotası ~20 istek/gün; Ersan vd. 2021 saniye ölçekli bir bulgu; SPK 22.09.2026 kararı toplam tutar sınırıyla ilgili). Geçerli bilgiler için `../../proje/_KANONIK-KARARLAR.md` → **Revizyon 3**.


> Durum: **Seçilen yön.** Yapay zeka ajanları gelen haberlere göre (sanal parayla) sürekli alım satım yapar.

## 1. Para kazanır mı? Kanıtlar "hayır" diyor
- **Alpha Arena 1.5 (2025, gerçek para):** 32 hesaptan yalnızca 6'sı kârda, toplam **%-35**. Önceki sezonun kazananı Qwen bu sezon 4 denemenin 4'ünde de kaybetti.
- **StockBench ve FINSABER (kontrollü akademik testler):** modellerin çoğu "al ve tut"u geçemiyor; makalelerdeki başarılar düzgün test edilince kayboluyor.
- **Neden:** LLM eğitim verisindeki geçmiş fiyatları hatırlıyor (backtest şişer); aşırı işlem ve kaldıraç; aynı model bir denemede birinci, diğerinde sonuncu.

**Sonuç:** Projeyi "para kazanan bot" diye değil, **"riski yönetilen, denetlenebilir, ölçülen AI işlem masası"** diye sunun.

## 2. Para konusu — GÜNCELLENDİ (29.09.2026)
**Karar: Kendi param, kendi hesabım, kendim için.** Kendi hesabında algoritmik işlem yasal; yasal risk yalnızca başkalarının parasını toplayıp yönetmekte (SPKn 6362 md. 109). Grup arkadaşları para koymayacak; onlar kodu paylaşır, isteyen kendi hesabında ayrı çalıştırır.

### Aşamalı plan
| Aşama | Süre | Ne | Geçiş şartı |
|---|---|---|---|
| 1. Paper / testnet | 4–6 hafta | Alpaca paper, Binance Spot Testnet | Sistem hatasız çalışıyor, risk kuralları testli |
| 2. Küçük gerçek para | 4+ hafta | Kaybetmeyi göze aldığın küçük tutar | Paper'da baseline'a (al-tut) yakın/üstü sonuç |
| 3. Büyütme | — | Tutarı kademeli artır | Gerçek parada da baseline'ı geçiyor, drawdown kabul edilebilir |

### Gerçek parada kullanılabilecek yerler (Türkiye'den)
| Piyasa | Nereden | Not |
|---|---|---|
| **BIST** | Deniz Yatırım **Algolab** API (hisse + VİOP) | Kendi hesabınla; ücret/limitler ve API üzerinden anlık veri olup olmadığı **doğrulanmadı** — sor |
| **Kripto** | SPK listesindeki borsa (BtcTurk, Binance TR, OKX TR) | API anahtarında **para çekme yetkisi KAPALI**, IP kısıtlaması açık |
| **ABD hisse** | Alpaca live / Interactive Brokers | Türkiye'den **canlı** hesap kabulü doğrulanmadı |

### Gerçek parada zorunlu ek korumalar
- Hesaptaki para = botun kullanabileceği maksimum (ana birikim ayrı hesapta).
- Günlük zarar limiti ve kill switch **gerçek parada daha sıkı** (ör. günlük %-1, zirveden %-5).
- Kaldıraç yok (Alpha Arena'da kaybedenlerin ortak noktası yüksek kaldıraçtı), vadeli/VİOP başlangıçta kapalı.
- Belirli bir tutarın üstündeki her işlem telefonuna onay bildirimi (HITL).
- Vergi: BIST hisse kazancı %0 stopaj (GYO/bazı fonlar hariç); kripto için özel yasa yok, genel hükümler belirsiz → mali müşavire sor.

### Ders projesi ile kişisel kullanım ayrımı
- **Derste/demoda:** paper/testnet (canlı demoda gerçek para riske atılmaz, hoca da sonuçları karşılaştırmalı görmek ister).
- **Kişisel:** aynı kod, `mode=live` ayarıyla kendi hesabında.

## 3. Piyasa seçimi
| Piyasa | Kullanım | Neden |
|---|---|---|
| **ABD hisseleri — Alpaca paper** | Ana piyasa | Ücretsiz anlık haber (Benzinga WS), anlık IEX fiyat, paper trading tek yerde |
| **Kripto — Binance Spot Testnet** | Canlı demo | 7/24 açık. **Ders Pazartesi 13:20–16:10; ABD borsası TR saatiyle 16:30'da açılıyor** → ders saatinde ABD kapalı |
| **BIST — KAP bildirimleriyle** | Türkiye modülü, günlük karar | Ücretsiz veri 15 dk gecikmeli; KAP + günlük karar + simüle işlem için yeterli |

## 4. Ajan mimarisi (LangGraph, TradingAgents örnek alınarak)
```
Haber akışı (Alpaca WS, KAP, RSS, SEC EDGAR)
  → Tekrar eleme (SHA256 + SimHash + pgvector cos>0.92) → Redis Stream "news.raw"
  → Ucuz ön filtre (sembol listesi + FinBERT, LLM yok; ~%5–10 geçer)
  → Paralel analistler: Haber | Temel analiz (RAG) | Teknik analiz (pandas, LLM yok)
  → Boğa ↔ Ayı tartışması (1 tur, yapılandırılmış raporlar)
  → Trader → TradeProposal (Pydantic)
  → RİSK KAPISI (düz Python; sadece küçültebilir/reddedebilir)
  → Eşik üstü veya düşük güven → interrupt() → Risk Officer onayı
  → Emir (paper, idempotent client_order_id)
  → Portföy + yansıtma hafızası (pgvector) + audit kaydı
PostgresSaver | Postgres (audit, RBAC) | Langfuse | FastAPI + dashboard | APScheduler (EOD, mutabakat)
```
Tam graf çalışması ücretsiz katmanda ~15–60 sn — HFT değil, haber tabanlı; demoda açıkça söyleyin.

## 5. RAG'e (pgvector) girecekler
- Şirket raporları: 10-K/10-Q, KAP finansal raporları ve özel durum açıklamaları.
- **"Benzer olay hafızası":** geçmiş haber özeti embed edilir, 1/5 günlük anormal getiri metadata olarak saklanır → "benzer haberlerde ne olmuştu?"
- Risk politikası ve işlem kuralları.
- Ajanın kendi geçmiş kararları ve dersleri (FinMem yaklaşımı).
- Her aramada `published_at < karar_anı` filtresi.

Yapısal DB (Postgres): fiyatlar, işlemler, pozisyonlar, P&L, makro seriler, olay tabloları, sentiment skorları.

## 6. Kodla yazılan risk kuralları (enterprise'ın kalbi)
Gerekçe: SEC Rule 15c3-5, MiFID II RTS 6 (Art. 12 kill switch, Art. 15 pre-trade kontroller), FINRA 15-09, ESMA 2026 brifingi.
1. Pydantic şema doğrulaması (başarısızsa 1 tekrar, sonra ret).
2. Sembol beyaz listesi (ör. 20 likit ABD hissesi).
3. Hisse başına ≤%5, toplam brüt ≤%50.
4. Maks. emir tutarı/adet; fiyat bandı son fiyatın ±%2'si.
5. Dakika/gün başına emir limiti, hisse başına bekleme (ör. 30 dk).
6. **Günlük %-2 → işlem durur; zirveden %-8 → kill switch** (açık emirler de iptal). Reset = Admin + Risk Officer.
7. Piyasa saati ve bayat veri kontrolü.
8. Kanıt şartı: `evidence_ids` boşsa veya getirilmemiş belgeye işaret ediyorsa ret.
9. İdempotent `client_order_id`.
10. LLM kota sigortası: kota biterse HOLD.

## 7. Kurumsal özellikler
- **RBAC:** Analist (görür, not ekler) · Risk Officer (onay/ret, kill switch, limitler) · Admin (kullanıcı, config, beyaz liste). Limit değişiklikleri de audit'lenir.
- **Append-only, hash zincirli audit log:** olay, filtre skorları, getirilen chunk'lar, ajan raporları, tartışma, öneri, her guardrail sonucu, onaylayan, emir, dolum.
- **"Neden aldık?" ekranı:** kanıtlar, boğa/ayı argümanları, güven.
- **HITL kuyruğu**, **canlı iz paneli** (Langfuse/LangSmith).

## 8. Değerlendirme (farkı yaratacak kısım)
- **Baseline'lar:** SPY al-tut, beyaz liste eşit ağırlık al-tut, 20/50 SMA momentum, yalnızca FinBERT kuralı, tek ajan (tartışma işe yarıyor mu?).
- **Metrikler:** kümülatif getiri, Sharpe, Sortino, maks. düşüş, Calmar, win rate, turnover, guardrail ret sayısı, HITL onay oranı, karar başına $/token, p50/p95 gecikme.
- **Look-ahead bias'a karşı:** yalnızca model eğitim tarihi sonrası; point-in-time zaman damgaları, bir sonraki bar'da işlem; şirket adı maskeleme testi; **6. haftadan demoya canlı paper trading** (en güçlü kanıt).
- **Birden fazla seed/deneme** → varyans.
- **Prompt injection red-team:** içine talimat gizlenmiş sahte haber.
- **RAGAS:** 50 soruluk altın set.
- Araçlar: kendi event-driven replay harness'ınız (en uygun), vectorbt (baseline/sweep), zipline-reloaded. NautilusTrader/Lean 12 hafta için ağır.

## 9. Final demo senaryosu (notun %50'si)
1. Sahte "X beklentiyi aştı" haberi enjekte edilir → ajanlar canlı iz panelinde.
2. Eşik üstü → Risk Officer'a onay kartı → onay → paper emir dolar.
3. Gizli talimatlı zararlı haber → sistem reddeder.
4. Zarar simüle edilir → **kill switch** → audit log'da her adım.
5. Kapanış: 6 haftalık canlı paper sonuçları vs. baseline'lar.
6. Yedek: kota biterse diye önceden kaydedilmiş demo.

## 10. Teknoloji ve bütçe (~$0)
- LangGraph + PostgresSaver; Postgres + pgvector (Chroma karşılaştırma).
- FinBERT (yerel filtre) · Gemini Flash (analiz/karar) · Groq + Ollama (yedek) · bge-m3 embedding.
- Redis Streams · FastAPI · Next.js · Docker Compose.
- Kapasite: **günde ~30–60 tam karar** (karar başına ~5 LLM çağrısı, ~20K token). Groq 200K TPD tek başına ~10 karar/gün → yükü Gemini/Groq/Ollama arasında dağıtın. Herkes kendi anahtarını alsın.
- Hileler: teknik analiz kodla, 1 tartışma turu, (sembol, doc-hash) cache, başlıkları toplu işleme, rapor özetlerini önceden hesaplama.

## 11. Görev dağılımı
1. **Veri ve RAG:** haber akışları, KAP, SEC, olay hafızası.
2. **Ajanlar:** LangGraph grafı, tartışma, HITL, yansıtma hafızası.
3. **İşlem ve risk:** Alpaca/Binance bağlantısı, risk kapısı, kill switch, birim testleri.
4. **Arayüz ve değerlendirme:** dashboard, RBAC, audit log, backtest ve baseline'lar.

## 12. İlk hafta yapılacaklar
- [ ] Herkes: Gemini (AI Studio) + Groq anahtarı al, gerçek limitleri not et.
- [ ] Alpaca paper hesabı aç; News API'nin hâlâ ücretsiz olduğunu doğrula.
- [ ] Binance Spot Testnet anahtarı al.
- [ ] MKK API Portal'a (KAP) başvur — onay zaman alabilir.
- [ ] Hangi LLM'in eğitim tarihi ne → test dönemini buna göre belirle.
- [ ] Proposal taslağı.

## Ham raporlar
- `01-llm-trading-sistemleri-ve-kanitlar.md`
- `02-borsa-api-ve-yasal-durum.md`
- `03-haber-ve-veri-kaynaklari.md`
- `04-mimari-risk-degerlendirme.md`
