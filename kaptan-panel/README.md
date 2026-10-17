# KAPtan Paneli

Sade çekirdek + ince bir kurumsal katman (SENG 429 *Enterprise* Application Development Lab). Tayfa (8 ajan)
KAP bildirimlerini okur, kurallar tartar; insan ne olduğunu **anlar** ve **son imzayı atar**.
Next.js 16 · React 19 · Tailwind 4 · zod · Vitest · Playwright.

- **Bugün** (`/bugun`): tek büyük cümle, karar saati, öneri kartları (canlı belirir), portföy satırı.
- **Öneri** (`/oneri/[id]`): kısa hikâye (Ne oldu? · Neden önemli? · Geçmişte ne oldu? · Tayfa ne dedi? · Risk),
  **iki imza** (Tayfa önerdi → Kurallar onayladı → Risk Sorumlusu imzalar), Onayla / Reddet, emir fişi, **notlar**.
- **Portföy** (`/portfoy`): toplam, çizgi, elindekiler, girilecek fişler, **Durdur**. Yeniden başlatma iki kişi:
  Yönetici başlatır (1/2), Risk Sorumlusu onaylar (2/2).
- **Denetim** (`/denetim`): hash zincirli defter düz bir zaman çizelgesi olarak; **Defteri doğrula** zinciri
  ekranda yürür ("Zincir sağlam." ya da "Kayıt #3.907'de zincir kırık.").
- **⚙ Ayarlar** (`/ayarlar`): sınırlar (cümleler, iki imzalı değişiklik, sürümler), ekip ve "Kim ne yapabilir?",
  senaryolar (**Rehberli tur**, senaryo ekleme, kurcalama testi, sıfırla), çıkış.
- **Giriş** (`/login`): tek ekran — "Hesap" listesinden dört ekip hesabından biri (Analist · Üye 2, Risk Sorumlusu ·
  Üye 3, Yönetici · Üye 1, Denetçi) ve parola; oturum o hesabın rolüyle başlar. `/login/analist`, `/login/risk`,
  `/login/yonetici`, `/login/denetci` aynı ekranı o hesap seçili açar. `?next=` girişten geçer.
- **Roller**: üst çubukta "Kimin gözüyle bakıyorsun?" — Analist (okur, not ekler) · Risk Sorumlusu (onaylar ya da
  reddeder; durdurur) · Yönetici (kullanıcılar, ayarlar, senaryolar) · Denetçi (her şeyi görür, hiçbir şeyi değiştiremez).
  Yetkisiz düğme kapalı durur ve nedenini söyler: "Bunu Risk Sorumlusu yapar."

Ürün kuralları: **[SPEC.md](SPEC.md)**. Backend sözleşmesi: **[API.md](API.md)**. Projenin tamamı: depo kökündeki
[README](../README.md) ve [`docs/`](../docs/README.md).

## Hızlı başlangıç

```bash
npm ci
npm run dev        # http://localhost:3100 → / tanıtım sayfası, /login giriş (dört hesap)
```

Mock modunda parola sayfada yazar: `kaptan2026`. Demo saati 11.01.2027 13:40'tan başlar.

## Demo akışı

En kolayı: ⚙ → Ayarlar → **Rehberli turu başlat**. Alttaki çubuk 6 perdeyi (15 adım) → / ← ile yürür, rolü
kendisi değiştirir, her adımda sunucuya tek cümle; elle basılan adımlarda yedek düğme vardır. Elle akış SPEC.md §5'te.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu, port 3100 (mock) |
| `npm run dev:api` | Aynısı http modunda, `127.0.0.1:8000`'deki FastAPI'ye karşı (env'i `scripts/api-mode.mjs` verir; PowerShell ve Git Bash'te aynı) |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu (3100) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm test` | Vitest birim + bileşen testleri |
| `npm run coverage` | Kapsam raporu; eşik satır/ifade/fonksiyon %80, dal %75 |
| `npm run e2e` | Playwright e2e (Microsoft Edge kanalı); açık dev sunucusunu kullanır. `E2E_BASE_URL=http://localhost:3100` ile açık bir sunucuya yönlendirilir |
| `npm run e2e:api` | Aynı Playwright paketi gerçek backend'e karşı: API'yi (`DEMO_MODE=true`, `LLM_MODE=replay`) ve `dev:api`'yi açar ya da açık olanları kullanır; başta ve durum değiştiren her testten önce demo gününü sıfırlar (`POST /demo/reset`). 3100'de mock dev sunucusu açık kalmasın |
| `npx playwright test e2e/a11y.spec.ts` | Bütün ekranlar + giriş, 390 ve 1440 px'de axe-core WCAG 2.1 A/AA |
| `npm run check` | typecheck + lint + coverage + build |

## Modlar: mock ve http

| Değişken | Değer | Etki |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (varsayılan, env gerekmez) | Tarayıcı içi deterministik mock API, `kaptan_mock_session` çerezi, sayfada yazan parola, senaryolar ve "zamanı ileri sar" |
| | `http` | Gerçek FastAPI: `/api/v1/*` Next rewrite ile `KAPTAN_API_ORIGIN`'e gider (refresh çerezi birinci taraf kalır); JWT bellekte + `__Host-kaptan_rt` refresh çerezi; SSE bileti. Parola API'de denetlenir; demo parolası görünmez |
| `KAPTAN_API_ORIGIN` | ör. `https://api.example` | Yalnızca http modunda |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | http modunda demo enjeksiyonunu açar (backend `DEMO_MODE` ile birlikte) |

`NEXT_PUBLIC_*` değişkenleri derleme anında gömülür: modu değiştirmek yeniden derleme ister (dev sunucusunu
yeniden başlat).

**Backend'e karşı çalıştırmak:** backend'i [`../backend/README.md`](../backend/README.md) "Bütün sistemi yerelde
çalıştır" bölümündeki gibi aç (compose, migrasyon, demo tohumu, `python -m kaptan.api`), sonra burada `npm run dev:api`.
http modunda panelin saati sunucunun saatidir (demo modunda 11.01.2027), parola ipucu sayfada yazmaz (`kaptan2026`
yalnız dev backend'inin varsayılanıdır). Sözleşme ve giriş ayrıntıları: [API.md](API.md) §1–2.

Mock saat **11.01.2027 Pazartesi 13:40 (İstanbul)** ile başlar ve gerçek zamanla ilerler. Durum `localStorage`'da tutulur; ⚙ → Ayarlar → "Verileri sıfırla" (Yönetici) temizler. Seçilen rol oturum çerezindedir; giriş, seçilen hesabın rolüyle başlar.

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
  app/                 (panel)/bugun, oneri/[id], portfoy, denetim, ayarlar · login/ · api/mock/session (giriş, rol, çıkış)
  components/
    today/ proposal/   Bugün; Öneri hikâyesi, iki imza (signatures), notlar, emir fişi
    portfolio/         Portföy, Durdur (iki damgalı yeniden başlatma)
    audit/             Denetim: zaman çizelgesi, Defteri doğrula (chain-walk)
    settings/          Sınırlar (iki imza), ekip ve "Kim ne yapabilir?", demo
    roles/             rol seçici, useRole, <Denied> (düz gerekçe + "… gözüyle bak →")
    demo/              Rehberli demo: adımlar, durum, eylemler, alt çubuk
    story/ shell/ ui/  düz cümleler; üst çubuk, bantlar, masa durumu; küçük parçalar
  lib/
    auth/permissions.ts  can(role, action), deniedReason, canOpen (tek yetki tablosu)
    audit-chain.ts       hash zinciri · audit-words.ts kayıt → düz cümle
    domain (zod) · api (KaptanApi: mock + http; mock/enterprise.ts, mock/guard.ts) · sse · nav · format
  mocks/               deterministik fikstürler (bildirimler, koşular, 4.812 kayıtlık defter, P&L, fişler)
  proxy.ts             oturum koruması; / ve statik dosyalar açık
e2e/                   smoke (her ekran, iki genişlik), flow (E3 → imza → fiş → portföy), enterprise (roller,
                       iki imza, defter + kurcalama, sınır, iki kişilik yeniden başlatma), guided-demo (15 adım), a11y
```

## Lisanslar

Bodoni Moda ve Inter yazı tipleri SIL Open Font License 1.1 ile dağıtılır (`src/app/fonts/OFL.txt`).
