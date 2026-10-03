# KAPtan Paneli

KAPtan'ın masa paneli: KAP bildirimlerinin canlı akışı, onay kuyruğu, "Neden bu işlem?" izi, portföy ve kill switch, audit zinciri, limitler, değerlendirme ve sabah özeti. SENG 429 (Güz 2026) ders projesi; **yatırım tavsiyesi değildir**, tüm şirketler kurgusaldır (Temsili) ve demo sayıları örnek değerdir.

> Bu klasör, ileride kurulacak monorepo'nun **`web/`** paketidir. Backend (FastAPI, `/api/v1`) hazır olana kadar panel kendi deterministik mock katmanıyla tek başına çalışır; taşınırken klasör olduğu gibi `web/` altına alınır.

- Ürün ve ekran spesifikasyonu: [`FRONTEND-SPEC.md`](./FRONTEND-SPEC.md)
- Ekip sözleşmesi (sahiplik, paylaşılan dosyalar, hook/API kullanımı, fikstür kimlikleri, test beklentileri): [`PANEL-CONTRACT.md`](./PANEL-CONTRACT.md)
- Canlı tasarım sistemi: `/styleguide`

## Hızlı başlangıç

Node 20.9+ (geliştirmede 24 kullanıldı), npm. Sürümler sabitlenmiştir (`.npmrc` → `save-exact`).

```bash
npm ci
npm run dev            # http://localhost:3100 — mock modu, env gerekmez
```

### Demo hesapları (yalnızca mock modu)

Giriş ekranında tek tıkla doldurulur; parola hepsinde `kaptan-demo`. Mock modda kenar çubuğundaki **rol değiştirici** (A · R · D · U) aynı tarayıcı oturumunda rol değiştirir; demo verisi rol değişince korunur.

| Hesap | Kişi · rol | Açılış | Ne yapabilir |
|---|---|---|---|
| `risk@kaptan.demo` | Zeynep · Risk Officer (R) | `/approvals` | Onayla / küçült / reddet, kill switch, reset onayı (2/2), limit önerisi ve onayı |
| `admin@kaptan.demo` | Burak · Admin (D) | `/inbox` | Demo enjeksiyonu, rehberli demo, reset başlatma (1/2), kullanıcı/evren/engel listesi; **öneri onaylayamaz** |
| `analist@kaptan.demo` | Mert · Analist (A) | `/inbox` | Akışı izler, not ekler; audit'i görür ama doğrulayamaz |
| `denetci@kaptan.demo` | Hoca · Auditor (U) | `/inbox` | Her şeyi görür ve zinciri doğrular, hiçbir şey yazamaz (jüri hesabı) |
| `risk2@kaptan.demo` | Elif · ikinci Risk Officer | `/approvals` | Dört göz adımlarını iki ayrı kişiyle denemek için |

## Rehberli demo (final sunumu, 5 dk)

`05-proje-dokumanlari/11-demo-senaryosu.md` §2'nin 17 adımı panelde bir sunucu şeridi olarak çalışır (FRONTEND-SPEC §7).

1. **Admin** olarak girin → `/admin` → **Demo** sekmesi → **Rehberli demoyu başlat** (ya da ⌘K → "Rehberli demoyu başlat"). Demo verisi sıfırlanır, saat 13:40'a döner.
2. Ekranın altındaki şeritte **→ / ←** (ya da "Sonraki adım") ile ilerleyin. Her adım gerekirse rolü kendisi değiştirir (mock), ilgili ekrana gider ve senaryoyu enjekte eder: E3 sözleşme → ajan grafı → kanıt → şüpheci → kural/risk → **onay (2f)** → iz → red-team → tedbirli hisse (R04) → zarar simülasyonu ve kill switch → **reset 1/2 (Admin) ve 2/2 (Risk Officer)** → zinciri doğrula → kurcalama testi (#3.907) → değerlendirme → kişisel mod emir fişi.
3. Onay (2f) ve reset (4b, 4c) adımlarında düğmeye ekrandaki gerçek karttan basılır (yorum + kod `000000`). Şeritteki **"Yedek: …"** düğmeleri aynı işi tek tıkla yapar.
4. **Otomatik oynat**: eller klavyeden çekilmiş yedek oynatma. Adımlar planlanan sürelerle ilerler, onay ve iki kişilik reset de kendiliğinden yapılır; 5:00 bütçe içinde biter (`e2e/demo-script.spec.ts` bunu ölçer).
5. Şerit küçültülebilir (–). Saat 5:00'e göre geride kalırsa "geride" yazar. Kapatmak için ×.

Demo çalıştırmaları (`/runs/run-demo-…`) kasıtlı olarak **enjeksiyonla doğar**: jüri bildirimin canlı akışa düştüğü anı görür. Enjeksiyondan önce açılan bir demo bağlantısı bunu anlatan bir bekleme sayfası gösterir; Admin oradan ya da ⌘K → "Demo çalıştırmaları"ndan tek tıkla başlatır.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu, port 3100 |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu (3100) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm test` | Vitest birim + bileşen testleri |
| `npm run coverage` | Kapsam raporu; eşik satır/ifade/fonksiyon %80, dal %75 |
| `npm run e2e` | Playwright e2e (Microsoft Edge kanalı); açık dev sunucusunu kullanır. `E2E_BASE_URL=http://localhost:3120` ile başka bir sunucuya yönlendirilir |
| `npx playwright test e2e/demo-script.spec.ts` | Final demosunun tamamı: klavyeyle (gerçek onay ve reset) ve "Otomatik oynat" ile, 5:00 sınırına karşı |
| `npx playwright test e2e/a11y.spec.ts` | Her rotada axe-core WCAG 2.1 A/AA taraması |
| `npm run check` | typecheck + lint + coverage + build |

## Modlar: mock ve http

| Değişken | Değer | Etki |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (varsayılan, env gerekmez) | Tarayıcı içi deterministik mock API, `kaptan_mock_session` çerezi, "DEMO VERİSİ" şeridi, rol değiştirici, demo hesapları, rehberli demo |
| | `http` | Gerçek FastAPI: `/api/v1/*` Next rewrite ile `KAPTAN_API_ORIGIN`'e gider (refresh çerezi birinci taraf kalır); JWT bellekte + `__Host-kaptan_rt` refresh çerezi; SSE bileti. Demo hesapları ve rol değiştirici görünmez |
| `KAPTAN_API_ORIGIN` | ör. `https://api.example` | Yalnızca http modunda |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | http modunda demo enjeksiyonunu ve rehberli demoyu açar (backend `DEMO_MODE` ile birlikte) |

`NEXT_PUBLIC_*` değişkenleri derleme anında gömülür: modu değiştirmek yeniden derleme ister.

Mock saat **11.01.2027 Pazartesi 13:40 (İstanbul)** ile başlar ve gerçek zamanla ilerler. Durum `localStorage`'da tutulur (rol değişse de kalır); ⌘K → "Demo verisini sıfırla" (Admin) ya da rehberli demonun başlatılması temizler.

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
  app/                 rotalar — (panel)/ altında kabuklu ekranlar, login/, api/mock/session
  components/
    ui/                primitifler (Button, Badge, Panel, Dialog, DataTable, ConfirmDialog…)
    shell/             kenar çubuğu, üst çubuk, risk bantları, komut paleti, masa durumu
    brand/             wordmark, pusula, yasal not
    inbox/ approvals/ run/ portfolio/ eval/ brief/ audit/ limits/ admin/
                       ekranlar (sahipler: PANEL-CONTRACT.md §1)
    charts/            Recharts grafikleri (portföy ve değerlendirme, tembel yüklenir)
    demo/              rehberli demo şeridi ve adımları
  lib/
    domain/            zod şemaları (05, 06, 07, 09 belgelerinden)
    api/               KaptanApi arayüzü, mock/ ve http/ uygulamaları, React hook'ları
    auth/              roller, izinler, rota korumaları, mock oturum
    sse/               useEventStream + mock olay yolu
  mocks/               deterministik fikstürler (318 bildirim, demo runları, audit zinciri, P&L, eval)
  proxy.ts             oturum ve rol koruması (Next 16 proxy)
e2e/                   Playwright: rota başına akışlar, demo-script (tam demo), a11y (axe)
```

## Lisanslar

Bodoni Moda ve Inter yazı tipleri SIL Open Font License 1.1 ile dağıtılır (`src/app/fonts/OFL.txt`).
