# KAPtan belgeleri

KAPtan'ın yazılı belgeleri burada. KAPtan bir kişi içindir ve yalnızca tek kullanıcı modunda çalışır. Çelişki olduğunda
[`proje/_KANONIK-KARARLAR.md`](proje/_KANONIK-KARARLAR.md) geçerlidir; en üstteki bölüm en yeni karardır (Revizyon 4,
02.11.2026: tek kullanıcı). Projenin özeti için depo kökündeki [README](../README.md)'ye bakın.

## Nereden başlamalı?

| Kim | Okuma sırası |
|---|---|
| Yeni başlayan | [Proje tanıtımı](proje/01-proje-tanitimi.md) → [Kanonik kararlar](proje/_KANONIK-KARARLAR.md) (en üst bölüm) |
| Kuralları anlamak | [Strateji ve kurallar](proje/06-strateji-ve-kurallar.md) → [Ajanlar](proje/05-ajan-spesifikasyonlari.md) |
| Sistemi anlamak | [Mimari](proje/04-mimari.md) → [Güvenlik ve erişim](proje/09-guvenlik-ve-uyum.md) → [Veri hattı](proje/07-veri-hatti-ve-sema.md) |
| Panel üzerinde çalışan | [Panel SPEC](../kaptan-panel/SPEC.md) → [API sözleşmesi](../kaptan-panel/API.md) → [Panel README](../kaptan-panel/README.md) |
| Tanıtım sayfası üzerinde çalışan | [Tasarım sistemi](../kaptan-landing/DESIGN.md) → [Brief](../kaptan-landing/KAPTAN-BRIEF.md) → [Tanıtım sayfası README](../kaptan-landing/README.md) |
| Sistemi çalıştıran / işleten | [Kök README: çalıştır](../README.md#çalıştır) → [İşletim el kitabı](ops/RUNBOOK.md) → [Backend README](../backend/README.md) |

## Proje belgeleri: [`proje/`](proje/00-ICINDEKILER.md)

| # | Belge | İçerik |
|---|---|---|
| — | [Kanonik kararlar](proje/_KANONIK-KARARLAR.md) | Ortak kararlar. Revizyon 4 (tek kullanıcı) en üstte ve her şeyi geçersiz kılar |
| 00 | [İçindekiler](proje/00-ICINDEKILER.md) | Belgelerin listesi |
| 01 | [Proje tanıtımı](proje/01-proje-tanitimi.md) | Projeyi beş dakikada anlatır |
| 02 | [Proposal](proje/02-proposal.md) | Proje önerisi (İngilizce, tarihsel) |
| 03 | [PRD](proje/03-PRD.md) | Kullanıcı hikâyeleri ve kabul kriterleri (tarihsel; rol anlatımı Revizyon 4 ile geçersiz) |
| 04 | [Mimari](proje/04-mimari.md) | Bağlam ve konteyner diyagramları, ajan grafı, API, ekranlar, ADR'ler |
| 05 | [Ajan spesifikasyonları](proje/05-ajan-spesifikasyonlari.md) | Her ajanın görevi, araçları, şeması, istemi |
| 06 | [Strateji ve kurallar](proje/06-strateji-ve-kurallar.md) | E1–E4 kuralları, risk kapısı R01–R16 (tek kaynak), durdurma ve yeniden başlatma (§11) |
| 07 | [Veri hattı ve şema](proje/07-veri-hatti-ve-sema.md) | KAP, fiyat ve haber verisi, veritabanı şeması, RAG tabanları |
| 08 | [Değerlendirme planı](proje/08-degerlendirme-plani.md) | Dört katmanlı değerlendirme, altın setler, ablation, red-team |
| 09 | [Güvenlik ve uyum](proje/09-guvenlik-ve-uyum.md) | Tehdit modeli, erişim (tek kullanıcı), denetim zinciri, yasal uyum |
| 10 | [Proje planı ve görevler](proje/10-proje-plani-ve-gorevler.md) | Haftalık plan ve görev listesi (tarihsel) |
| 11 | [Demo senaryosu](proje/11-demo-senaryosu.md) | Beş dakikalık gösterim akışı (tarihsel; rol adımları Revizyon 4 ile geçersiz) |
| 12 | [Kişisel kullanım planı](proje/12-kisisel-kullanim-plani.md) | Gerçek parayla kullanımın aşamaları ve kuralları |
| 13 | [Risk kaydı](proje/13-risk-kaydi.md) | Risk kaydı |
| 14 | [Sözlük](proje/14-sozluk.md) | Terimler |

## Uygulama belgeleri

| Belge | İçerik |
|---|---|
| [`backend/README.md`](../backend/README.md) | Backend: çalıştırma, testler, KAP, fiyatlar, LLM, RAG, risk, zamanlayıcı, yayına alma |
| [`backend/PLAN.md`](../backend/PLAN.md) | Backend iş paketleri ve tamamlanan işlerin durumu |
| [`kaptan-panel/SPEC.md`](../kaptan-panel/SPEC.md) | Panelin ürün kuralları: ekranlar, dil, görsel çizgiler (tek doğru kaynak) |
| [`kaptan-panel/API.md`](../kaptan-panel/API.md) | Backend sözleşmesi: oturum, uç noktalar, şemalar, hatalar |
| [`kaptan-panel/FRONTEND-SPEC.md`](../kaptan-panel/FRONTEND-SPEC.md) | Başvuru: alan şemaları, içerik kuralları, demo fikstürleri |
| [`kaptan-panel/PANEL-CONTRACT.md`](../kaptan-panel/PANEL-CONTRACT.md) | Panel kodunun sözleşmesi: API istemcisi, rotalar, bileşen kuralları, bitti tanımı |
| [`kaptan-panel/README.md`](../kaptan-panel/README.md) | Panelin komutları, modları ve Vercel ayarları |
| [`kaptan-landing/DESIGN.md`](../kaptan-landing/DESIGN.md) | Tanıtım sayfasının tasarım sistemi |
| [`kaptan-landing/KAPTAN-BRIEF.md`](../kaptan-landing/KAPTAN-BRIEF.md) | Tanıtım sayfasının içerik gerçekleri ve kırmızı çizgileri |
| [`kaptan-landing/THIRD_PARTY_NOTICES.md`](../kaptan-landing/THIRD_PARTY_NOTICES.md) | Yazı tipleri ve lisansları |

## İşletim: [`ops/`](ops/RUNBOOK.md)

| Belge | İçerik |
|---|---|
| [`ops/RUNBOOK.md`](ops/RUNBOOK.md) | Başlat/durdur, Postgres yedeği ve geri yükleme, durdurmadan sonra yeniden başlatma, denetim zinciri doğrulama, anahtar döndürme, sık sorunlar |
| [`ops/SOPS-AGE.md`](ops/SOPS-AGE.md) | Sırların SOPS + age ile şifrelenmesi |
| [`../docker-compose.yml`](../docker-compose.yml) | Bütün sistem tek komutla (yerel, demo günü) |
| [`../backend/docker-compose.prod.yml`](../backend/docker-compose.prod.yml) · [`../backend/prod.env.example`](../backend/prod.env.example) | Üretim biçimli yığın ve her ortam değişkeni |

## Araştırma geçmişi: [`arastirma/`](arastirma/NIHAI-PROJE.md)

Proje üç araştırma turunun sonunda seçildi. Bu klasördeki raporlar tarihseldir ve güncellenmez; sonradan düzeltilen
bilgiler kanonik kararlardadır. Özet: [Nihai proje](arastirma/NIHAI-PROJE.md).

<details>
<summary><b>Önceki turlarda düzeltilen bilgiler</b></summary>

<br>

- **Algolab (Deniz Yatırım) 31.12.2025'te kapandı.** Türkiye'de öğrenciye ücretsiz Python BIST emir API'si yok.
- **Binance Spot Testnet** artık yeni adresinde (ayrıntı için kaynak adı arşivde).
- **MKK API Portal** ücretsiz planı yalnızca sandbox (donmuş veri); canlı KAP için KAP JSON uçları.
- **Bloomberg HT RSS** 14 Eylül 2026'dan beri güncellenmiyor.
- Gerçek paraya geçiş şartı: **en az 3 ay ve 50 paper işlem** ve kendi verinle olay çalışması.

**Revizyon 3 (30.09.2026):**

- **KAP JSON uçları canlı denendi, çalışıyor** (geçmiş sorgu dahil); MKK WAF'ı var, kibar polling. `kap-client`
  BIST'te çalışmıyor; **kendi httpx istemcimiz**.
- **yfinance ham fiyat vermez**; ham fiyat İş Yatırım'dan (SimBIST dolumları ve fiyat bandı ham fiyatla).
- **Ana LLM Gemini Flash-Lite** (Flash ~20 istek/gün); Groq'ta Llama sohbet modelleri kalktı (Prompt Guard 2
  ücretsiz). Zincir: Flash-Lite ⇄ Groq gpt-oss → Azure for Students → Ollama → HOLD.
- **Ersan vd. (2021)** "BIST yavaş fiyatlıyor" değil, fiyat tepkisinin saniyeler içinde başladığını gösteriyor.
  **Ünal (2022):** geri alım sonrası +%2,0 (1 ay) / +%3,4 (3 ay), işlem tarihinden ve maliyetsiz. E3 için BIST'e
  özgü kanıt yok (keşifsel).
- StockBench: "çoğu model" al-tut'u geçemedi; Alpha Arena zayıf ve kısa dönemli kanıt. Türkçede dense aramanın
  açık üstünlüğü yok.
- **SPK 22.09.2026:** geri alımlarda **toplam tutar** üst sınırı geçici kaldırıldı (fiyat sınırı değil).
- Midas ve Enpara Yatırım'da BIST komisyonu %0. Maliyet sonrası pozitif getiri olasılığı kabaca **%20–35**.

</details>

## Ekran görüntüleri: [`screens/`](screens/)

Kök README'deki görüntüler. Dosya adları: `landing.png`, `panel-bugun.png`, `panel-oneri.png`, `panel-portfoy.png`,
`panel-denetim.png`, `panel-login.png`, `panel-telefon.png`.
