# KAPtan belgeleri

KAPtan'ın bütün yazılı belgeleri burada. Çelişki olduğunda
[`proje/_KANONIK-KARARLAR.md`](proje/_KANONIK-KARARLAR.md) geçerlidir (en üstte Revizyon 3, sonra Revizyon 2).
Projenin özeti için depo kökündeki [README](../README.md)'ye bakın.

## Nereden başlamalı?

| Kim | Okuma sırası |
|---|---|
| Yeni başlayan | [Proje tanıtımı](proje/01-proje-tanitimi.md) → [Proposal](proje/02-proposal.md) → [Final sunumu senaryosu](proje/11-demo-senaryosu.md) |
| Kod yazmadan önce | [PRD](proje/03-PRD.md) → [Mimari](proje/04-mimari.md) → [Ajanlar](proje/05-ajan-spesifikasyonlari.md) → [Strateji ve kurallar](proje/06-strateji-ve-kurallar.md) → [Veri hattı](proje/07-veri-hatti-ve-sema.md) |
| Panel üzerinde çalışan | [Panel SPEC](../kaptan-panel/SPEC.md) → [API sözleşmesi](../kaptan-panel/API.md) → [Panel README](../kaptan-panel/README.md) |
| Tanıtım sayfası üzerinde çalışan | [Tasarım sistemi](../kaptan-landing/DESIGN.md) → [Brief](../kaptan-landing/KAPTAN-BRIEF.md) → [Tanıtım sayfası README](../kaptan-landing/README.md) |
| Her hafta | [Proje planı](proje/10-proje-plani-ve-gorevler.md) ve [risk kaydı](proje/13-risk-kaydi.md) |

## Proje belgeleri: [`proje/`](proje/00-ICINDEKILER.md)

| # | Belge | İçerik |
|---|---|---|
| — | [Kanonik kararlar](proje/_KANONIK-KARARLAR.md) | Bütün belgelerin uyduğu ortak kararlar: isimler, parametreler, takvim |
| 00 | [İçindekiler](proje/00-ICINDEKILER.md) | Belgelerin listesi ve kimin için olduğu |
| 01 | [Proje tanıtımı](proje/01-proje-tanitimi.md) | Projeyi beş dakikada anlatır |
| 02 | [Proposal](proje/02-proposal.md) | Hocaya teslim edilen proje önerisi (İngilizce) |
| 03 | [PRD](proje/03-PRD.md) | Personalar, kullanıcı hikâyeleri, kabul kriterleri |
| 04 | [Mimari](proje/04-mimari.md) | Bağlam ve konteyner diyagramları, ajan grafı, API, ekranlar, ADR'ler |
| 05 | [Ajan spesifikasyonları](proje/05-ajan-spesifikasyonlari.md) | Her ajanın görevi, araçları, şeması, istemi |
| 06 | [Strateji ve kurallar](proje/06-strateji-ve-kurallar.md) | E1–E4 kuralları, risk kapısı R01–R16 (tek kaynak), olay çalışması yöntemi |
| 07 | [Veri hattı ve şema](proje/07-veri-hatti-ve-sema.md) | KAP, fiyat ve haber verisi, veritabanı şeması, RAG tabanları |
| 08 | [Değerlendirme planı](proje/08-degerlendirme-plani.md) | Dört katmanlı değerlendirme, altın setler, ablation, red-team |
| 09 | [Güvenlik ve uyum](proje/09-guvenlik-ve-uyum.md) | Tehdit modeli, roller, denetim zinciri, yasal uyum |
| 10 | [Proje planı ve görevler](proje/10-proje-plani-ve-gorevler.md) | Haftalık plan, görev listesi, çalışma kuralları |
| 11 | [Final sunumu senaryosu](proje/11-demo-senaryosu.md) | Beş dakikalık sunum akışı ve olası sorular |
| 12 | [Kişisel kullanım planı](proje/12-kisisel-kullanim-plani.md) | Gerçek parayla kişisel kullanımın aşamaları ve kuralları |
| 13 | [Risk kaydı](proje/13-risk-kaydi.md) | Proje risk kaydı |
| 14 | [Sözlük](proje/14-sozluk.md) | Terimler |

## Uygulama belgeleri

| Belge | İçerik |
|---|---|
| [`kaptan-panel/SPEC.md`](../kaptan-panel/SPEC.md) | Panelin ürün kuralları: ekranlar, kurumsal katman, oturum, içerik (tek doğru kaynak) |
| [`kaptan-panel/API.md`](../kaptan-panel/API.md) | Backend sözleşmesi: kimlik, roller, 24 uç nokta, şemalar |
| [`kaptan-panel/FRONTEND-SPEC.md`](../kaptan-panel/FRONTEND-SPEC.md) | Başvuru: alan şemaları, API ayrıntısı, içerik kuralları, fikstürler |
| [`kaptan-panel/README.md`](../kaptan-panel/README.md) | Panelin komutları, modları ve Vercel ayarları |
| [`kaptan-landing/DESIGN.md`](../kaptan-landing/DESIGN.md) | Tanıtım sayfasının tasarım sistemi |
| [`kaptan-landing/KAPTAN-BRIEF.md`](../kaptan-landing/KAPTAN-BRIEF.md) | Tanıtım sayfasının içerik gerçekleri ve kırmızı çizgileri |
| [`kaptan-landing/THIRD_PARTY_NOTICES.md`](../kaptan-landing/THIRD_PARTY_NOTICES.md) | Yazı tipleri ve lisansları |

## Araştırma geçmişi: [`arastirma/`](arastirma/NIHAI-PROJE.md)

Proje üç araştırma turunun sonunda seçildi. Bu klasördeki raporlar tarihseldir ve güncellenmez; sonradan düzeltilen
bilgiler kanonik kararlardadır.

| Tur | Belge | Sonuç |
|---|---|---|
| — | [Ders bilgileri](arastirma/00-ders-bilgileri.md) | Ders içeriği, not dağılımı, proje şartları |
| 1 | [`01-fikir-A-mutabik/`](arastirma/01-fikir-A-mutabik/00-ozet-ve-oneri.md) | e-Fatura denetim ajanı ("Mutabık"); yedek fikir |
| 2 | [`02-fikir-B-kurul/`](arastirma/02-fikir-B-kurul/00-ozet-ve-oneri.md) | Haberle işlem yapan ajan masası ("Kurul"); GitHub'daki TradingAgents'a çok benzediği için evrildi |
| — | [Karşılaştırma ve karar](arastirma/03-karsilastirma-ve-karar.md) | Dokuz varyantın puanları ve KAPtan'ın seçilme gerekçesi |
| 3 | [`04-derin-arastirma/`](arastirma/04-derin-arastirma/04-fikir-turnuvasi.md) | Beş derin rapor: [platform seçimi](arastirma/04-derin-arastirma/01-gercek-para-platform-secimi.md), [strateji kanıtı](arastirma/04-derin-arastirma/02-haber-stratejisi-kanit.md), [KAP veri hattı](arastirma/04-derin-arastirma/03-bist-kap-veri-hatti.md), [fikir turnuvası](arastirma/04-derin-arastirma/04-fikir-turnuvasi.md), [mühendislik planı](arastirma/04-derin-arastirma/05-muhendislik-plani.md) |
| Özet | [Nihai proje](arastirma/NIHAI-PROJE.md) | Üçüncü turun özeti: KAPtan'ın tanımı |

<details>
<summary><b>Önceki turlarda düzeltilen bilgiler</b></summary>

<br>

- **Algolab (Deniz Yatırım) 31.12.2025'te kapandı.** Türkiye'de öğrenciye ücretsiz Python BIST emir API'si yok.
- **Binance Spot Testnet** artık `demo.binance.com`.
- **MKK API Portal** ücretsiz planı yalnızca sandbox (donmuş veri); canlı KAP için kap.org.tr JSON uçları.
- **Bloomberg HT RSS** 14 Eylül 2026'dan beri güncellenmiyor.
- Gerçek paraya geçiş şartı: 4–6 hafta değil, **en az 3 ay ve 50 paper işlem** ve kendi verinle olay çalışması.

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
- **SPK 22.09.2026:** geri alımlarda **toplam tutar** üst sınırı geçici kaldırıldı (fiyat sınırı değil). Fon
  tasfiyesi: **131** fon.
- Midas ve Enpara Yatırım'da BIST komisyonu %0. Maliyet sonrası pozitif getiri olasılığı kabaca **%20–35**.

</details>

## Ekran görüntüleri: [`screens/`](screens/)

Kök README'deki görüntüler. Dosya adları: `landing.png`, `panel-bugun.png`, `panel-oneri.png`, `panel-portfoy.png`,
`panel-denetim.png`, `panel-login.png`, `panel-telefon.png`.
