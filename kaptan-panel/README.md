# KAPtan Paneli

Tek kişi için bir yatırım asistanı arayüzü. KAPtan borsadaki KAP bildirimlerini okur, kurallara göre öneri çıkarır ve
her önerinin son sözü sendedir; emri kendisi vermez, sen bankanda girersin. Next.js 16 · React 19 · Tailwind 4 · zod ·
Vitest · Playwright.

- **Ana sayfa** (`/benim`): paranın durumu tek cümleyle, başladığından beri çizgi, bugünkü kararlar.
- **Öneri** (`/oneri/[id]`): neden öneriliyor, onaylarsan ne olur, ne kadar emin değil. Onayla ya da reddet.
- **Param** (`/portfoy`): neye sahipsin, her biri ne kadar değerli.
- **Okunanlar** (`/bildirimler`): KAPtan bugün ne okudu, ne yaptı, hangilerine sıra gelmedi ve neden.
- **Geçmiş** (`/gecmis`): olan her şey, okunabilir zaman çizelgesi ve "Kayıtlar sağlam mı?" kontrolü.
- **Ayarlar** (`/ayarlar`): limitler, bildirimler (bu bilgisayar, telefon, e-posta), sistemin durumu, parola, çıkış.
- **Giriş** (`/login`): tek parola.

Her sayfanın üstünde, KAPtan'ın kendisi düzgün çalışmıyorsa tek satırlık sakin bir uyarı çıkar (`GET /system/status`, dakikada bir).

Ürün kuralları: **[SPEC.md](SPEC.md)**. Backend sözleşmesi: **[API.md](API.md)**. Kod kuralları:
**[PANEL-CONTRACT.md](PANEL-CONTRACT.md)**. Projenin tamamı: depo kökündeki [README](../README.md) ve
[`docs/`](../docs/README.md).

## Ürün gerçek backend'le çalışır

Panelin tek ürün hâli http'dir: tarayıcı `/api/v1/*` ile aynı adrese konuşur, Next bunu `KAPTAN_API_ORIGIN`'deki
FastAPI'ye yönlendirir (yenileme çerezi `__Host-kaptan_rt` böylece birinci taraf kalır; JWT bellekte tutulur).
Kurulum, sunucuyu bu bilgisayarda açar (`kur.cmd`, `baslat.cmd`, `durdur.cmd`); yalnızca bu bilgisayardan açılır.

| Durum | Davranış |
|---|---|
| `KAPTAN_API_ORIGIN` dolu | Gerçek panel. `next dev` boşsa `http://127.0.0.1:8000`'e düşer |
| `next build`, `KAPTAN_API_ORIGIN` boş (Vercel) | Yalnızca tanıtım sitesi: `/` tanıtım, diğer yollar tek dürüst sayfa ("KAPtan senin bilgisayarında çalışır") |
| `NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1` | Tarayıcı içi **test ikizi** (sahte API). Yalnızca vitest ve Playwright için; `next dev` dışında derleme ve sunucu bunu reddeder |

Test ikizi ürün değildir: kullanıcıya hiçbir yerde gösterilmez, üretim derlemesinde yoktur. Durumu `localStorage`'dadır
(`kaptan-mock-state`); testler `kaptan-mock-fresh=1` ile "henüz başlangıç parası yok" hâliyle, ya da `kaptan-mock-state`
içine `status` yazarak sistem sorunlarıyla, kurulu bildirim kanallarıyla ve sıra gelmeyen bildirimlerle başlatır
(`e2e/helpers.ts` → `seedMock`). Parolası `kaptan2026`'dır.

## Hızlı başlangıç

```bash
npm ci
npm run dev        # http://localhost:3100, backend 127.0.0.1:8000'de açık olmalı
```

Backend'i [`../backend/README.md`](../backend/README.md) "Run the whole system locally" bölümündeki gibi aç.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu, port 3100, gerçek backend'e karşı |
| `npm run dev:api` | Aynısı; `KAPTAN_API_ORIGIN`'i açıkça verir (`scripts/api-mode.mjs`; PowerShell ve Git Bash'te aynı) |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu (3100) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm test` | Vitest birim ve bileşen testleri (test ikizine karşı) |
| `npm run coverage` | Kapsam raporu; eşik satır/ifade/fonksiyon %80, dal %75 |
| `npm run e2e` | Playwright e2e (Microsoft Edge kanalı), test ikizine karşı, port 3199 |
| `npm run e2e:api` | Aynı paket gerçek backend'e karşı: API'yi açar ya da açık olanı kullanır |
| `npx playwright test e2e/a11y.spec.ts` | Bütün ekranlar ve durumlar, 320/360/390/1440 px'de axe-core WCAG 2.2 A/AA |
| `npm run check` | typecheck + lint + coverage + build |

`NEXT_PUBLIC_*` değişkenleri derleme anında gömülür: değiştirince dev sunucusunu yeniden başlat. İkinci bir dev sunucusu
`NEXT_DIST_DIR=.next/<ad>` ile kendi klasörüne derler; Next bunun için `tsconfig.json`'a satır ekler, işin bitince sil.

## Vercel (yalnızca tanıtım sitesi)

| Ayar | Değer |
|---|---|
| Root Directory | `kaptan-panel` |
| Framework Preset | Next.js |
| Build / Output / Install | varsayılan (`next build`, `.next`, `npm ci`) |
| Node.js | 20.x, 22.x veya 24.x (`engines.node >= 20.9`) |
| Ortam değişkenleri | Yok: `KAPTAN_API_ORIGIN` boş kalır, yalnızca site derlenir |

`prebuild`/`predev` adımı (`scripts/sync-landing.mjs`) `../kaptan-landing`'i derler ve çıktısını `public/`'e kopyalar
(git'e girmez). Vercel'de "Include files outside the root directory" açık kalmalıdır. Yalnız panelde çalışırken
`SKIP_LANDING=1`. Güvenlik başlıkları `next.config.ts`'tedir; panel arama motorlarına kapalıdır.

## Yapı

```
src/
  app/                 (app) rotaları, login/, api/mock/session (yalnız test ikizi)
  components/          ekran bileşenleri; shell/ kabuk ve uyarı satırı, settings/, disclosures/ …
  lib/
    api/               KaptanApi: http (ürün) + mock/ (test ikizi); types.ts tek liste
    domain/            zod şemaları (system.ts: sistem durumu ve bildirim ayarı)
    alerts/            masaüstü bildirimleri: olay → bildirim eşlemesi ve tarayıcı izni
    auth/              oturum · sse/ canlı akış · audit-chain.ts hash zinciri
    nav.ts             rotalar (tek kaynak) · format.ts · time.ts
  mocks/               test ikizinin sabit verileri
  proxy.ts             oturum koruması; / ve statik dosyalar açık
e2e/                   her ekran, akış, durumlar (status.spec.ts), a11y
```

## Lisanslar

Bodoni Moda ve Inter yazı tipleri SIL Open Font License 1.1 ile dağıtılır (`src/app/fonts/OFL.txt`).
