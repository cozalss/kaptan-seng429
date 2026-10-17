# KAPtan — Proje Dokümanları

SENG 429 Enterprise Application Development Lab · Çankaya Üniversitesi · Güz 2026

> **Revizyon 3 (30.09.2026):** `_KANONIK-KARARLAR.md` dosyasının en üstündeki "REVİZYON 3" bölümü fizibilite doğrulamalarını içerir ve Revizyon 2 ile orijinal metinle çeliştiği yerde **geçerli olan odur**: KAP uçları canlı doğrulandı (kendi httpx istemcimiz, `kap-client` değil), ham fiyat İş Yatırım'dan, ana LLM Gemini Flash-Lite (geri dönüş: Flash-Lite ⇄ Groq gpt-oss → Azure for Students → Ollama → HOLD), akademik atıflar düzeltildi (Ersan vd. 2021, Ünal 2022, E3 keşifsel), SPK 22.09.2026 kararı = geri alımlarda toplam tutar üst sınırının geçici kaldırılması. Kapsam değişmedi.
>
> **Revizyon 2 (30.09.2026):** `_KANONIK-KARARLAR.md` dosyasının başındaki "REVİZYON 2" bölümü, dokümanlardaki "Önerilen değişiklikler"den kabul edilenleri içerir ve orijinal kararlarla çeliştiği yerde **geçerli olan odur** (ör. `v1.0-fwd` 9 Kas + `v1.1-fwd` 23 Kas, holdout ana kanıt, tampon 21 Ara – 3 Oca, W12 = 4 Oca 2027, otomatik yürütme yok, Auditor rolü, Birleştirme düğümü). Her dokümandaki öneri bölümü "Önerilen değişiklikler — durum (Revizyon 2)" olarak işaretlenmiştir. Risk kapısı kurallarının tek kaynağı `06-strateji-ve-kurallar.md`'dir.

| # | Dosya | İçerik | Kimin için |
|---|---|---|---|
| — | [`_KANONIK-KARARLAR.md`](_KANONIK-KARARLAR.md) | Tüm dokümanların uyduğu ortak kararlar (isimler, parametreler, takvim); en üstte Revizyon 3, ardından Revizyon 2 | Ekip |
| 01 | [`01-proje-tanitimi.md`](01-proje-tanitimi.md) | Projeyi 5 dakikada anlatan tanıtım | Herkes |
| 02 | [`02-proposal.md`](02-proposal.md) | Hocaya teslim edilecek proje önerisi (İngilizce) | Hoca |
| 03 | [`03-PRD.md`](03-PRD.md) | Ürün gereksinimleri: personalar, user story'ler, kabul kriterleri | Ekip |
| 04 | [`04-mimari.md`](04-mimari.md) | Sistem mimarisi, diyagramlar, API, ekranlar, ADR'ler | Ekip |
| 05 | [`05-ajan-spesifikasyonlari.md`](05-ajan-spesifikasyonlari.md) | Her ajanın görevi, araçları, şeması, prompt'u | Ajanlar rolü |
| 06 | [`06-strateji-ve-kurallar.md`](06-strateji-ve-kurallar.md) | E1–E4 kuralları, risk kapısı kuralları (tek kaynak), olay çalışması yöntemi | Strateji & Risk rolü |
| 07 | [`07-veri-hatti-ve-sema.md`](07-veri-hatti-ve-sema.md) | KAP/fiyat/haber veri hattı, veritabanı şeması, RAG tabanları | Veri & RAG rolü |
| 08 | [`08-degerlendirme-plani.md`](08-degerlendirme-plani.md) | 4 katmanlı değerlendirme, altın setler, ablation, red-team | Değerlendirme rolü |
| 09 | [`09-guvenlik-ve-uyum.md`](09-guvenlik-ve-uyum.md) | Tehdit modeli, RBAC, audit zinciri, yasal uyum | Ekip |
| 10 | [`10-proje-plani-ve-gorevler.md`](10-proje-plani-ve-gorevler.md) | Haftalık plan, görev listesi, çalışma kuralları | Ekip |
| 11 | [`11-demo-senaryosu.md`](11-demo-senaryosu.md) | Final sunumu ve canlı demo senaryosu, olası sorular | Ekip |
| 12 | [`12-kisisel-kullanim-plani.md`](12-kisisel-kullanim-plani.md) | Gerçek parayla kişisel kullanım planı | Takım lideri |
| 13 | [`13-risk-kaydi.md`](13-risk-kaydi.md) | Proje risk kaydı | Ekip |
| 14 | [`14-sozluk.md`](14-sozluk.md) | Terimler sözlüğü | Herkes |

## Nasıl okunmalı?

- **Yeni başlayan:** 01 → 02 → 11
- **Kod yazmadan önce:** 03 → 04 → 05 → 06 → 07
- **Her hafta:** 10 ve 13

Arka plandaki ham araştırmalar: [`../arastirma/04-derin-arastirma/`](../arastirma/04-derin-arastirma/), [`../arastirma/NIHAI-PROJE.md`](../arastirma/NIHAI-PROJE.md). Tüm belgelerin dizini: [`../README.md`](../README.md).
