# Fikir A — Mutabık: e-Fatura denetim ve 3'lü eşleştirme ajanı

> Durum: **Yedek fikir.** Ekip Fikir B'ye (Kurul) yöneldi. Düşük riskli alternatif olarak saklanıyor.

## Neden bu fikir çıktı
Dört araştırmanın ortak sonucu:
- **Kazanan projelerin kalıbı:** sıkıcı ama pahalı bir kurumsal iş akışı. Ajan belgeleri kurallara veya veritabanına karşı kontrol ediyor, sorunu işaretliyor ve kararı insana onaylatıyor. "PDF ile sohbet" türü projeler kazanmıyor.
- **Türkiye'ye özgü güçlü açı:** e-Fatura (UBL-TR) + KDV/tevkifat mevzuatı + GİB özelgeleri. Mevzuat FSEK md. 31 gereği telif açısından serbest.

## Problem
Şirketlerin muhasebe/satın alma birimlerine her ay yüzlerce e-Fatura geliyor. Faturaların yaklaşık **%18'inde sorun** çıkıyor ve ortalama **8,2 günde** çözülüyor:
- sipariş (PO) veya teslimatla miktar/fiyat uyuşmazlığı,
- yanlış KDV oranı,
- **hatalı KDV tevkifatı** (Türkiye'ye özgü, yaygın, karmaşık),
- riskli tedarikçi.

## Ajanlar (LangGraph)
| Ajan | Görev | Araçlar |
|---|---|---|
| Supervisor | Faturayı alır, iş dağıtır, sonuçları birleştirir | Router |
| Giriş ajanı | UBL-TR XML/PDF ayrıştırır, şema doğrular | XSD/schematron doğrulayıcı |
| Eşleştirme ajanı | Fatura ↔ sipariş ↔ teslimat (3'lü eşleştirme) | Postgres üzerinde SQL |
| Vergi ajanı | KDV oranı ve tevkifat kontrolü, **madde atıflı** gerekçe | pgvector RAG (KDV Kanunu, VUK, KDV Genel Uygulama Tebliği, özelgeler) |
| Tedarikçi risk ajanı (ek hedef) | Yaptırım listeleri, Rekabet/KİK kararları | OpenSanctions, yargi-mcp, KAP API |
| İletişim ajanı | Tedarikçiye Türkçe e-posta taslağı | LLM |

Uyuşmazlıkta LangGraph `interrupt()` ile **insan onayı**; onaylanınca DB güncellenir ve audit log'a yazılır.

## Final demo akışı
1. Temiz fatura → otomatik onay (5 sn).
2. Miktar uyuşmazlığı → işaretlenir, tedarikçiye e-posta taslağı.
3. Yanlış tevkifat → vergi ajanı tebliğ maddesini gösterir, atıfa tıklanır, düzeltme onaylanır, DB satırı canlı değişir.
4. Yan panelde ajanların iş devrini gösteren canlı iz paneli.

## Ölçülebilirlik
- Sentetik faturalara **bilerek hata eklenir** → hata yakalama precision/recall.
- 50–100 soruluk Türkçe altın set üzerinde RAGAS skorları.
- Fatura başına süre ve maliyet.

## Teknoloji yığını (~$0)
- LLM: Gemini Flash (ana), Groq (hızlı yönlendirme), Azure for Students (final demo, $100 kredi).
- Embedding: bge-m3 (yerel, Türkçe güçlü).
- DB: Postgres + pgvector (vektör + RLS ile departman bazlı erişim + `turkish` FTS hibrit arama + LangGraph checkpointer). Chroma karşılaştırma notebook'unda.
- FastAPI (SSE) + Next.js, `docker compose up`.
- LangSmith ücretsiz + RAGAS.

## Görev dağılımı
1. Veri ve RAG: mevzuat/tebliğ toplama, madde bazlı chunking, embedding, hibrit arama.
2. Ajanlar ve graf: LangGraph, supervisor, HITL, checkpointer.
3. Backend ve araçlar: UBL-TR ayrıştırıcı, sentetik ERP verisi, API.
4. Arayüz ve değerlendirme: onay kutusu, iz paneli, RAGAS panosu, hatalı test seti.

## Riskler
- Kapsam: tedarikçi risk ajanı ve KAP API ek hedef; çekirdek = eşleştirme + vergi + insan onayı.
- Gemini ücretsiz katmanda veri eğitimde kullanılabilir → yalnızca sentetik ve kamuya açık veri.
- Kota rakamları tutarsız → AI Studio'dan teyit; herkes kendi anahtarını alsın.
- Türkçe `"I".lower()` → `"i"` tuzağı.

## Alternatifler (bu turda çıkan)
- **KVKK uyum asistanı:** kurul kararları + rehberler, şirket politikasındaki boşlukları bulur.
- **AI SRE / arıza kök neden ajanı:** kendi mikroservisini bozup ajanın çözmesini izlemek; wow yüksek, altyapı riski büyük.

## Ham raporlar
- `01-kurumsal-trendler.md`
- `02-klisheler-ve-farklilastiricilar.md`
- `03-turkiye-veri-kaynaklari.md`
- `04-teknoloji-yigini.md`
