# SENG 429 — Proje Araştırması

Ders: SENG 429 Enterprise Application Development Lab — Dr. Bilgin Avenoğlu
Son güncelleme: 30.09.2026

## ▶ Buradan başla: `05-proje-dokumanlari/00-ICINDEKILER.md`

**Proje dokümantasyonu tamamlandı (30.09.2026):** 15 doküman + ortak kararlar dosyası (`_KANONIK-KARARLAR.md`, Revizyon 3). Proposal (İngilizce, hocaya teslim), PRD, mimari, ajan spesifikasyonları, strateji ve risk kuralları (R01–R16), veri hattı ve şema, değerlendirme, güvenlik, proje planı, demo senaryosu, kişisel kullanım planı, risk kaydı, sözlük. Dokümanlar Revizyon 3'e (30.09.2026, fizibilite doğrulamaları) göre hizalandı. `NIHAI-PROJE.md` 3. tur araştırmanın özetidir; çelişki varsa `05-proje-dokumanlari/_KANONIK-KARARLAR.md` geçerlidir.

## Landing sayfası: `kaptan-landing/`

KAPtan tanıtım sitesi (Vite + GSAP + Lenis + OGL/WebGL). Ödüllü ÖYKÜ projesinin tasarım dili üzerine kuruldu (orijinali `Documents\öy`, dokunulmadı).
- Çalıştır: `cd kaptan-landing` → `npm run dev` (http://localhost:5173) · Test: `npm test` · Build: `npm run build`
- Görselleri yeniden üret: `npm run visuals` (ajan/yolculuk/harita), `node scripts/build-hero.mjs` (hero), `node scripts/build-pusula-still.mjs` (3D sahne yedeği)
- Tasarım sistemi: `kaptan-landing/DESIGN.md` · Brief: `kaptan-landing/KAPTAN-BRIEF.md` · Ekran görüntüleri: `kaptan-landing/.qa/`

## Araştırma özeti: `NIHAI-PROJE.md`

**Seçilen proje: KAPtan.** BIST'teki KAP bildirimlerini ajanlarla okuyup sınıflandıran, geçmiş olaylardan kanıt getiren, kararı kurallara bırakan ve her öneriyi uyum + risk + insan onayından geçiren çok ajanlı yatırım masası. Ders için paper trading; kişisel kullanımda sistem emir fişi hazırlar, son butona sen basarsın.

## Araştırma geçmişi

| Tur | Klasör | Sonuç |
|---|---|---|
| 1 | `01-fikir-A-mutabik/` | e-Fatura denetim ajanı ("Mutabık") — yedek fikir |
| 2 | `02-fikir-B-kurul/` | Haberle işlem yapan ajan masası ("Kurul") — GitHub'daki TradingAgents'a çok benzediği için evrildi |
| 3 | `04-derin-arastirma/` | 5 derin rapor → **KAPtan** (platform, strateji kanıtı, KAP veri hattı, fikir turnuvası, mühendislik planı) |

Diğer dosyalar:
- `00-ders-bilgileri.md` — ders içeriği, not dağılımı, proje şartları
- `03-karsilastirma-ve-karar.md` — karar geçmişi

## Önceki turlardaki düzeltilen bilgiler

- **Algolab (Deniz Yatırım) 31.12.2025'te kapandı.** Türkiye'de öğrenciye ücretsiz Python BIST emir API'si yok.
- **Binance Spot Testnet** → artık `demo.binance.com`.
- **MKK API Portal** ücretsiz planı yalnızca sandbox (donmuş veri); canlı KAP için kap.org.tr JSON uçları.
- **Bloomberg HT RSS** 14 Eylül 2026'dan beri güncellenmiyor.
- Gerçek paraya geçiş şartı: 4–6 hafta değil, **en az 3 ay ve 50 paper işlem** + kendi verinle olay çalışması.

**Revizyon 3 (30.09.2026):**
- **KAP JSON uçları canlı denendi, çalışıyor** (geçmiş sorgu dahil); MKK WAF'ı var → kibar polling. `kap-client` BIST'te çalışmıyor → **kendi httpx istemcimiz**.
- **yfinance ham fiyat vermez** → ham fiyat İş Yatırım'dan (SimBIST dolumları ve fiyat bandı ham fiyatla).
- **Ana LLM Gemini Flash-Lite** (Flash ~20 istek/gün); Groq'ta Llama sohbet modelleri kalktı (Prompt Guard 2 ücretsiz). Zincir: Flash-Lite ⇄ Groq gpt-oss → Azure for Students → Ollama → HOLD.
- **Ersan vd. (2021)** "BIST yavaş fiyatlıyor" değil, fiyat tepkisinin saniyeler içinde başladığını gösteriyor. **Ünal (2022):** geri alım sonrası +%2,0 (1 ay) / +%3,4 (3 ay), işlem tarihinden ve maliyetsiz. E3 için BIST'e özgü kanıt yok (keşifsel).
- StockBench: "çoğu model" al-tut'u geçemedi; Alpha Arena zayıf/kısa dönemli kanıt. Türkçede dense aramanın açık üstünlüğü yok.
- **SPK 22.09.2026:** geri alımlarda **toplam tutar** üst sınırı geçici kaldırıldı (fiyat sınırı değil). Fon tasfiyesi: **131** fon.
- Midas/Enpara Yatırım'da BIST komisyonu %0. Maliyet sonrası pozitif getiri olasılığı kabaca **%20–35**.
