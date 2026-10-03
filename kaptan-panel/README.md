# KAPtan Paneli

Tek kişilik, üç ekranlı panel. Tayfa (8 ajan) KAP bildirimlerini okur, kurallar tartar; sana kalan
tek şey kararı vermek ve ne olduğunu **anlamak**. Next.js 16 · React 19 · Tailwind 4 · zod · Vitest · Playwright.

- **Bugün** (`/bugun`, girişten sonra): tek büyük cümle ("Bugün 3 öneri var."), karar saatine kalan süre,
  tayfanın bugün ne yaptığı, öneri kartları (şirket, düz Türkçe olay, "1.240 lot · en fazla 48,35 TL", İncele →),
  portföy satırı. Yeni öneri canlı (SSE) mürekkeple belirir.
- **Öneri** (`/oneri/[id]`): kısa bir hikâye — Ne oldu? · Neden önemli? · Geçmişte ne oldu? (şerit grafik) ·
  Tayfa ne dedi? (8 portre, birer satır) · Risk · Öneri. Tek eylem **Onayla**; "Reddet" sessiz bir bağlantı.
  Onaydan sonra emir fişi: Kopyala, **Girdim**, "…" altında Dolmadı / İptal. En altta kapalı "Tüm ayrıntılar".
- **Portföy** (`/portfoy`): toplam, bugünkü değişim, küçük çizgi, elindekiler (lot, kâr/zarar, kalan gün),
  girilecek fişler, **Durdur**. Durdurunca: 24 saat + 5 seans bekleme, geri sayım, sonra ikinci onayla yeniden başlat.
- **⚙ Ayarlar** (`/ayarlar`): demo senaryoları, zamanı ileri sar, demo verisini sıfırla, sabit sınırlar (tek satır), çıkış.

Eski yollar (`/kopru`, `/oneriler`, `/akis`, `/karne`, `/ozet`, `/kosular`, `/tayfa`, `/styleguide`…) en yakın ekrana yönlenir.
Backend sözleşmesi: **[API.md](API.md)**. Ürün kuralları: [PERSONAL-SPEC.md](PERSONAL-SPEC.md).

## Hızlı başlangıç

```bash
npm ci
npm run dev        # http://localhost:3100 → / tanıtım sayfası, /login panel
```

Mock modunda parola sayfada yazar: `kaptan-demo`. Demo saati 11.01.2027 13:40'tan başlar.

## Demo akışı

1. Giriş → Bugün (3 öneri).
2. ⚙ → Ayarlar → "Yeni iş (E3)" Ekle → Bugün'e git: ÖRNEK ENERJİ kartı birkaç saniyede belirir.
3. İncele → hikâyeyi oku → Onayla → emir fişi → Girdim → Kaydet → "Portföyünde →".
4. Portföy → Durdur (bir cümle gerekçe) → "24 saat ve 5 seans" bekleme.
5. Ayarlar → "Beklemeyi doldur" → Portföy → Yeniden başlat.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu, port 3100 |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu (3100) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm test` | Vitest birim + bileşen testleri |
| `npm run coverage` | Kapsam raporu; eşik satır/ifade/fonksiyon %80, dal %75 |
| `npm run e2e` | Playwright e2e (Microsoft Edge kanalı); açık dev sunucusunu kullanır. `E2E_BASE_URL=http://localhost:3100` ile açık bir sunucuya yönlendirilir |
| `npx playwright test e2e/a11y.spec.ts` | Üç ekran + Ayarlar + giriş, 390 ve 1440 px'de axe-core WCAG 2.1 A/AA |
| `npm run check` | typecheck + lint + coverage + build |

## Modlar: mock ve http

| Değişken | Değer | Etki |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (varsayılan, env gerekmez) | Tarayıcı içi deterministik mock API, `kaptan_mock_session` çerezi, "DEMO VERİSİ" şeridi, demo parolası, senaryolar ve "zamanı ileri sar" |
| | `http` | Gerçek FastAPI: `/api/v1/*` Next rewrite ile `KAPTAN_API_ORIGIN`'e gider (refresh çerezi birinci taraf kalır); JWT bellekte + `__Host-kaptan_rt` refresh çerezi; SSE bileti. Parola API'de denetlenir; demo parolası görünmez |
| `KAPTAN_API_ORIGIN` | ör. `https://api.example` | Yalnızca http modunda |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | http modunda demo enjeksiyonunu açar (backend `DEMO_MODE` ile birlikte) |

`NEXT_PUBLIC_*` değişkenleri derleme anında gömülür: modu değiştirmek yeniden derleme ister.

Mock saat **11.01.2027 Pazartesi 13:40 (İstanbul)** ile başlar ve gerçek zamanla ilerler. Durum `localStorage`'da tutulur; ⚙ → Ayarlar → "Demo verisini sıfırla" temizler.

## Vercel

| Ayar | Değer |
|---|---|
| Root Directory | `kaptan-panel` |
| Framework Preset | Next.js |
| Build / Output / Install | varsayılan (`next build`, `.next`, `npm ci`) |
| Node.js | 20.x, 22.x veya 24.x (`engines.node >= 20.9`) |
| Ortam değişkenleri | Gerekmez (mock modu). Gerçek backend için `NEXT_PUBLIC_API_MODE=http` + `KAPTAN_API_ORIGIN` |

**Tek deploy, iki site.** `prebuild`/`predev` adımı (`scripts/sync-landing.mjs`) `../kaptan-landing`'i derler ve çıktısını `public/`'e kopyalar (git'e girmez). `/` tanıtım sayfasıdır (`next.config.ts` → `/index.html`), `/login` ve diğer yollar paneldir; landing'deki "Panele giriş" `/login`'e gider. Vercel'de "Include files outside the root directory" açık kalmalıdır (varsayılan). Yalnız panel üzerinde çalışırken `SKIP_LANDING=1`.

`npm run build` env olmadan çalışır. Güvenlik başlıkları (`X-Frame-Options`, `Referrer-Policy`, `nosniff`, `Permissions-Policy`) `next.config.ts`'te; panel arama motorlarına kapalıdır (`robots: noindex`).

## Yapı

```
src/
  app/                 (panel)/bugun, (panel)/oneri/[id], (panel)/portfoy, (panel)/ayarlar · login/ · api/mock/session
  components/
    today/             Bugün: büyük cümle, öneri kartları
    proposal/          Öneri: hikâye bölümleri, tayfa yolu, geçmiş şeridi, tayfa notları, karar, emir fişi
    portfolio/         Portföy: toplam, çizgi, elindekiler, Durdur
    settings/          Ayarlar: demo senaryoları, zamanı ileri sar, sıfırla, çıkış
    story/             düz Türkçe cümleler (plain.ts) ve sayı ekleri (turkish.ts: %18’i, 09:50’ye)
    shell/             üst çubuk, demo şeridi, risk bandı, masa durumu (SSE)
    approvals/ tickets/ saf karar ve fiş mantığı · ui/ brand/ crew/  küçük parçalar
  lib/                 domain (zod), api (KaptanApi: mock + http), auth, sse, nav, format, time
  mocks/               deterministik fikstürler (bildirimler, demo koşuları, P&L, fişler)
  proxy.ts             oturum koruması; / ve statik dosyalar açık
e2e/                   smoke (giriş → her ekran, iki genişlik), flow (E3 → onay → fiş → portföy → durdur → bekleme → yeniden başlat), a11y
```

## Lisanslar

Bodoni Moda ve Inter yazı tipleri SIL Open Font License 1.1 ile dağıtılır (`src/app/fonts/OFL.txt`).
