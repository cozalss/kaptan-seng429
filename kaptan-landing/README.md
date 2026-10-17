# KAPtan tanıtım sayfası

KAPtan'ın halka açık tanıtım sayfası: pirinç kâğıdına sumi mürekkeple basılmış bir çizgi roman. Fırtınada küçük
bir tekne, okuyan bir tayfa, dümeni tutan kurallar ve son imzayı atan bir insan. Vite ile derlenen düz
JavaScript; GSAP, Lenis, WebGL (mürekkep deniz) ve Canvas 2D (Pusula sahnesi).

Yayında: [kaptan-seng429.vercel.app](https://kaptan-seng429.vercel.app/). Yayında ayrı bir deploy yoktur: panelin
`predev`/`prebuild` adımı (`../kaptan-panel/scripts/sync-landing.mjs`) bu sayfayı derler ve panelin `public/`
klasörüne kopyalar; `/` bu sayfadır, `/login` paneldir.

## Bölümler

| Bölüm | `id` | Ne anlatır |
|---|---|---|
| Bölüm 1 · Fırtına | `#hero` | "Kanıt / önce.": mürekkep deniz, tekne, pusula |
| Bölüm 2 · Tayfa | `#ajanlar` | Sekiz kişilik tayfa: altı LLM ajanı, Kural Motoru, Risk Kapısı |
| Bölüm 3 · Seyir Kuralları | `#olaylar` | Dört olay türü (E1–E4), yalnızca alım |
| Ara · 350'den 1'e | `#pusula` | Bildirimlerin üç halkadan geçip tek yöne inmesi |
| Bölüm 4 · Rota | `#yolculuk` | Bir bildirimin rotası: Yakala · Anla · Kanıtla · Onayla |
| Kolofon | `#kolofon` | Künye, ders bilgileri, ekip rolleri, yasal satır |

## Komutlar

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest birim testleri
npm run coverage   # kapsam; eşik %80
npm run build      # dist/
npm run visuals    # tayfa, yolculuk, harita ve og görsellerini yeniden üretir
```

- Pusula sahnesinin durağan karesi: `node scripts/build-pusula-still.mjs` (çalışan bir dev sunucusu ister).
- Görsel QA: `node scripts/qa/shot.mjs --out=.qa/hero.png` (çalışan dev sunucusunun ekran görüntüsü; `.qa/` git'e
  girmez).

Node.js 24 önerilir; Vitest 5 ve jsdom en az Node 22.22 ister.

## Belgeler

- [`DESIGN.md`](DESIGN.md): tasarım sistemi (renk görevleri, tipografi, kitap bileşenleri, hareket, erişilebilirlik).
- [`KAPTAN-BRIEF.md`](KAPTAN-BRIEF.md): içerik gerçekleri ve kırmızı çizgiler. Sayfadaki her gerçek bu dosyanın §0
  bölümünden, `src/config/site.js` ve `src/data/*` dosyalarından gelir.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): yazı tipleri ve lisansları (SIL OFL 1.1).
- Projenin tamamı: depo kökündeki [README](../README.md) ve [`docs/`](../docs/README.md).

Ders projesidir. Yatırım tavsiyesi değildir. KAP, Borsa İstanbul ve SPK ile bağlantılı değildir.
