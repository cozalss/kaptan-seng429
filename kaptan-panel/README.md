# KAPtan Paneli

Tek kişi için bir yatırım asistanı arayüzü. KAPtan borsadaki KAP bildirimlerini okur, kurallara göre öneri çıkarır ve
her önerinin son sözü sendedir. Next.js 16 · React 19 · Tailwind 4 · zod · Vitest · Playwright.

- **Ana sayfa** (`/benim`): paranın durumu tek cümleyle, başladığından beri çizgi, bugünkü kararlar.
- **Öneri** (`/oneri/[id]`): neden öneriliyor, onaylarsan ne olur, ne kadar emin değil. Onayla ya da reddet.
- **Param** (`/portfoy`): neye sahipsin, her biri ne kadar değerli, durdurma.
- **Okunanlar** (`/bildirimler`): KAPtan bugün ne okudu ve ne yaptı.
- **Geçmiş** (`/gecmis`): olan her şey, okunabilir zaman çizelgesi ve "Kayıtlar sağlam mı?" kontrolü.
- **Ayarlar** (`/ayarlar`): limitler, parola, çıkış, "KAPtan nasıl çalışır".
- **Giriş** (`/login`): tek parola.

Ürün kuralları: **[SPEC.md](SPEC.md)**. Backend sözleşmesi: **[API.md](API.md)**. Kod kuralları:
**[PANEL-CONTRACT.md](PANEL-CONTRACT.md)**. Projenin tamamı: depo kökündeki [README](../README.md) ve
[`docs/`](../docs/README.md).

## Hızlı başlangıç

```bash
npm ci
npm run dev        # http://localhost:3100 → / tanıtım sayfası, /login giriş
```

Mock modunda parola giriş sayfasında yazar: `kaptan2026`. Mock saat 11.01.2027 Pazartesi 13:40'tan başlar (İstanbul).

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu, port 3100 (mock) |
| `npm run dev:api` | Aynısı http modunda, `127.0.0.1:8000`'deki FastAPI'ye karşı (env `scripts/api-mode.mjs` verir; PowerShell ve Git Bash'te aynı) |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu (3100) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm test` | Vitest birim ve bileşen testleri |
| `npm run coverage` | Kapsam raporu; eşik satır/ifade/fonksiyon %80, dal %75 |
| `npm run e2e` | Playwright e2e (Microsoft Edge kanalı), mock'a karşı; `E2E_BASE_URL=http://localhost:3100` ile açık bir sunucuya yönlendirilir |
| `npm run e2e:api` | Aynı Playwright paketi gerçek backend'e karşı: API'yi (`DEMO_MODE=true`, `LLM_MODE=replay`) ve `dev:api`'yi açar ya da açık olanları kullanır; demo gününü sıfırlar |
| `npx playwright test e2e/a11y.spec.ts` | Bütün ekranlar, 390 ve 1440 px'de axe-core WCAG 2.1 A/AA |
| `npm run check` | typecheck + lint + coverage + build |

## Modlar: mock ve http

| Değişken | Değer | Etki |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (varsayılan, env gerekmez) | Tarayıcı içi deterministik mock API, `kaptan_mock_session` çerezi, sayfada yazan parola |
| | `http` | Gerçek FastAPI: `/api/v1/*` Next rewrite ile `KAPTAN_API_ORIGIN`'e gider. JWT bellekte, yenileme çerezi `__Host-kaptan_rt` |
| `KAPTAN_API_ORIGIN` | ör. `https://api.example` | Yalnızca http modunda |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | http modunda demo enjeksiyonunu açar (backend `DEMO_MODE` ile birlikte) |

`NEXT_PUBLIC_*` değişkenleri derleme anında gömülür: modu değiştirmek yeniden derleme ister (dev sunucusunu yeniden başlat).

**Backend'e karşı çalıştırmak:** backend'i [`../backend/README.md`](../backend/README.md) "Run the whole system locally"
bölümündeki gibi aç, sonra burada `npm run dev:api`. http modunda panelin saati sunucunun saatidir (demo modunda
11.01.2027), parola ipucu sayfada yazmaz.

Mock modunda durum tarayıcıda (`localStorage`) tutulur. Ayrıntı: [API.md](API.md) §1–2.

## Vercel

| Ayar | Değer |
|---|---|
| Root Directory | `kaptan-panel` |
| Framework Preset | Next.js |
| Build / Output / Install | varsayılan (`next build`, `.next`, `npm ci`) |
| Node.js | 20.x, 22.x veya 24.x (`engines.node >= 20.9`) |
| Ortam değişkenleri | Gerekmez (mock modu). Gerçek backend için `NEXT_PUBLIC_API_MODE=http` + `KAPTAN_API_ORIGIN` |

**Tek deploy, iki site.** `prebuild`/`predev` adımı (`scripts/sync-landing.mjs`) `../kaptan-landing`'i derler ve çıktısını
`public/`'e kopyalar (git'e girmez). `/` tanıtım sayfasıdır (`next.config.ts` → `/index.html`), `/login` ve diğer yollar
paneldir. Vercel'de "Include files outside the root directory" açık kalmalıdır (varsayılan). Yalnız panel üzerinde çalışırken
`SKIP_LANDING=1`.

`npm run build` ortam değişkeni olmadan çalışır. Güvenlik başlıkları (`X-Frame-Options`, `Referrer-Policy`, `nosniff`,
`Permissions-Policy`) `next.config.ts`'tedir; panel arama motorlarına kapalıdır (`robots: noindex`).

## Yapı

```
src/
  app/                 (panel) rotaları, login/, api/mock/session
  components/          ekran bileşenleri, ortak kabuk ve ui/ parçaları
  lib/
    api/               KaptanApi: mock + http (types.ts tek liste)
    domain/            zod şemaları
    auth/              oturum
    audit-chain.ts     hash zinciri · audit-words.ts kayıt → düz cümle
    nav.ts             rotalar (tek kaynak) · format.ts · time.ts
  mocks/               deterministik fikstürler
  proxy.ts             oturum koruması; / ve statik dosyalar açık
e2e/                   smoke (her ekran, iki genişlik), akış, a11y
```

## Lisanslar

Bodoni Moda ve Inter yazı tipleri SIL Open Font License 1.1 ile dağıtılır (`src/app/fonts/OFL.txt`).
