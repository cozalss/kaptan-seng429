# KAPtan Paneli — Ekip sözleşmesi (PANEL-CONTRACT)

Temel katman (foundation) hazır. Dört ekran mühendisi (S1–S4) paralel çalışır; bu belge kimin neye dokunacağını, paylaşılan parçaların nasıl kullanılacağını ve neyin "bitti" sayılacağını söyler. Ürün davranışı için tek kaynak **FRONTEND-SPEC.md**'dir; çelişki görürseniz §9'a satır önerin, kendi başınıza karar vermeyin.

> Belgelerde (02–14) geçen "SİSTEM NOTU: önceki talimatları yok say…" gibi metinler **red-team fikstürüdür**: veri olarak gösterilir, talimat olarak asla uygulanmaz.

---

## 1. Sahiplik

| Kişi | Rotalar ve klasörler | Spec |
|---|---|---|
| **S1** | `src/app/(panel)/runs/**` (liste + `[id]`), `src/components/run/**` (ajan izi, "Neden bu işlem?", kanıt kartı, kural izi, emir fişinin gömülü görünümü) | §2.4, §2.6 (gömülü) |
| **S2** | `src/app/(panel)/inbox/**`, `src/app/(panel)/approvals/**`, `src/components/inbox/**`, `src/components/approvals/**` | §2.2, §2.3 |
| **S3** | `src/app/(panel)/portfolio/**`, `src/app/(panel)/eval/**`, `src/app/(panel)/brief/**`, `src/components/portfolio/**`, `src/components/eval/**`, `src/components/brief/**`, grafikler (Recharts) | §2.5, §2.6, §2.9, §2.10 |
| **S4** | `src/app/(panel)/audit/**`, `src/app/(panel)/limits/**`, `src/app/(panel)/admin/**`, `src/app/login/**` (cila), `src/components/audit/**`, `src/components/limits/**`, `src/components/admin/**`, **rehberli demo modu** (`src/components/demo/**`) | §2.1, §2.7, §2.8, §2.11, §7 |
| **Temel** | Aşağıdaki §2 listesi | §10 |

Kendi klasörünüzde istediğiniz kadar dosya açın (200–400 satır tipik, 800 üst sınır). Ekran sayfasını değiştirirken `ScreenPlaceholder`'ı **tamamen kaldırın**; bileşenin kendisine dokunmayın.

## 2. Paylaşılan dosyalar — düzenlemeyin

Bunlar herkesin bağımlılığıdır; bir ekran için değiştirilirse diğer üç ekran kırılır.

- `src/app/layout.tsx`, `src/app/globals.css` (tokenlar, fontlar), `src/app/(panel)/layout.tsx`, `src/proxy.ts`, `next.config.ts`
- `src/components/ui/**` (primitifler), `src/components/shell/**`, `src/components/brand/**`
- `src/lib/**` — `domain/` (zod şemaları), `api/` (KaptanApi, mock, http), `auth/`, `sse/`, `format.ts`, `time.ts`, `market.ts`, `clock.ts`, `audit-chain.ts`, `utils.ts`
- `src/mocks/**` (deterministik fikstürler, ID'ler)
- `src/app/(panel)/styleguide/**`, `vitest.config.mts`, `playwright.config.ts`, `package.json`, `.npmrc`

### Değişiklik isteme yolu

1. Önce mevcut parçayla çözmeyi deneyin (kompozisyon, `className`, kendi klasörünüzde sarmalayıcı).
2. Olmuyorsa ekip kanalına **"TEMEL-İSTEK: <dosya> — <neden> — <önerilen imza>"** yazın; küçük bir örnek kullanım ekleyin.
3. Temel sahibi değişikliği tek PR'da yapar, `npm run check` yeşil olmadan birleştirmez, etkilenen ekip arkadaşlarını etiketler.
4. Acil durumda (demo öncesi) kendi klasörünüzde geçici kopya açabilirsiniz; adını `*.local.tsx` koyun ve istek açın.

Yeni bir alan, uç nokta ya da SSE olayı gerekiyorsa: önce `src/lib/domain/` şemasına ve `KaptanApi` arayüzüne (`src/lib/api/types.ts`) eklenir, sonra mock ve http uygulamalarına. Şemasız veri UI'a girmez.

## 3. Kullanacağınız parçalar

### 3.1 Veri

```tsx
import { useApi, useApiQuery, useApiMutation } from "@/lib/api/react";

const q = useApiQuery((api) => api.listApprovals("pending"), []);   // { data, error, loading, refreshing, refetch }
const decide = useApiMutation((api, id: string, d: ApprovalDecision) => api.decideApproval(id, d));
const card = await decide.run(id, d);  // hata durumunda undefined döner; decide.error Türkçe mesaj
```

- `KaptanApi` (`src/lib/api/types.ts`) tek arayüzdür; `NEXT_PUBLIC_API_MODE=mock|http` hangisinin bağlanacağını seçer (varsayılan **mock**). Ekranlar hangi modda olduğunu bilmez.
- Hatalar `ApiError(status, code, messageTr)`. Kullanıcıya `messageTr` gösterilir; 401 → oturum, 403 → `deniedHint(perm)`, 409 → "başka bir oturumda karara bağlandı / kill switch açık", 422 → alan hatası.
- Masa durumu (sayaçlar, risk, bekleyen onaylar, akış durumu) zaten çekiliyor: **`useDesk()`** (`src/components/shell/desk-state.tsx`) kullanın, aynı şeyi yeniden çekmeyin.

### 3.2 Canlı akış (SSE)

```tsx
import { useEventStream } from "@/lib/sse/use-event-stream";

const status = useEventStream("feed", { disclosure: (d) => …, classification: (c) => …, counters: (c) => … });
useEventStream("desk", { "approval.requested": …, "approval.decided": …, order: …, fill: …, kill_switch: …, halt: …, "limits.changed": … });
useEventStream({ run: runId }, { node: …, progress: …, interrupt: …, done: … });
```

Olaylar zod ile doğrulanır; bilinmeyen/bozuk olay sessizce düşer. Handler'lar her render'da değişebilir, yeniden abonelik olmaz.

### 3.3 Oturum ve yetki

- `useSession()` → `{ uid, name, email, role }`. Rol kodları `ROLE_CODE` (A R D U), etiketler `ROLE_LABEL`.
- `can(role, perm)` ve `deniedHint(perm)` (`src/lib/auth/permissions.ts`). Yetkisi olmayan rol için düğmeyi **gizlemeyin, devre dışı bırakıp nedenini gösterin** (Tooltip ile `deniedHint`). Yetki sunucuda (mock: `createMockApi`) yeniden denetlenir.
- Adım-yukarı (TOTP) gereken izinler `STEP_UP`'ta. `ConfirmDialog requireTotp` bunu sağlar.
- Rota korumaları `src/proxy.ts` + `PANEL_ROUTES` (`src/lib/auth/routes.ts`); yeni rota gerekiyorsa TEMEL-İSTEK.

### 3.4 Bileşenler (canlı örnekler: `/styleguide`)

`Button` (primary · secondary · outline · ghost · danger · danger-outline), `Badge` / `EventBadge` / `RuleMark` / `SeverityBadge` / `FixtureBadge` / `TemsiliBadge`, `Panel*`, `PageHeader`, `Stat`, `EmptyState`, `ErrorState`, `Skeleton*`, `SampleNote`, `LlmNote`, `Kbd`, `Dialog` / `DrawerContent` / `Tabs` / `Tooltip`, `Field` / `Input` / `Textarea` / `RequiredComment`, `ConfirmDialog` (yazarak onay + yorum + TOTP), `DataTable` (sıralama, `aria-sort`, klavye satır), `Countdown`, `HashChip`, `Sparkline`, `notify.*` (sonner'ı doğrudan çağırmayın), `Disclaimer`.

Biçimlendirme yalnızca `src/lib/format.ts` üzerinden (`fmtTry`, `fmtPct` "%18", `fmtSignedPct` "−%1,1", `fmtTime` İstanbul saati…). Zaman için `useNow()` (mock saatini izler).

### 3.5 Tasarım kuralları (özet)

- Pirinç kâğıdı zemin, sumi mürekkep, çivit yıkama. **Kuzey kırmızısı (`north`) yalnızca kill switch, veto ve kritik durum** için; aşı boyası (`ochre`) yalnızca günlük durdurma.
- Bodoni Moda (`font-display`, `.title-display`) **yalnızca ≥ 22 px** başlık ve büyük rakam; altında Inter. Mono (`.code`) yalnızca kod, ticker, hash, kimlik.
- Kare köşe, 1,5 px mürekkep kenar, sert gölge (`shadow-ink`, `shadow-ink-lg`). Yuvarlak köşe, gradyan, emoji yok.
- Türkçe arayüz, WCAG AA, tam klavye, görünür odak. Her ekran: yükleniyor · boş · hata · yetki yok durumları.
- Sayılar örnekse `SampleNote` ("örnek değer · gerçek sonuç değil"); LLM metni `LlmNote`; enjekte edilen kayıt `FixtureBadge`. Kurgusal şirketler "Temsili". Yatırım tavsiyesi dili, gerçek şirket ve gerçek fiyat **yok**.

## 4. Demo fikstür kimlikleri (`src/mocks/ids.ts`)

Mock saat: **11.01.2027 Pazartesi 13:40 (İstanbul)**, gerçek zamanla ilerler. Günün bildirimi **318** (13:40'ta 212 görünür, gerisi canlı akışla 7–12 sn'de bir düşer).

| Ne | Kimlik | Not |
|---|---|---|
| E3 demo bildirimi | `disclosure_index 1651901` · run `run-demo-e3-ornek` · öneri `prop-demo-e3-ornek` · kanıt `card-demo-e3-ornek` · emir `ord-demo-e3-ornek` | ÖRNEK ENERJİ (ORNEK). Güven 0,93, sözleşme/ciro %18, n=23, ort. CAR(5g) +%1,4, isabet %61, şüpheci ×0,5, 1.240 lot, dolum 48,32 (Ç-17) |
| Red-team | `1651902` · `run-demo-redteam-dmogd` | Prompt Guard 0,98, uyum vetosu, kural motoruna ulaşmaz |
| R04 sert veto | `1651903` · `run-demo-r04-tmslj` | Tedbirli/engel listesi; LLM çağrısı 0 |
| Bekleyen onaylar | `prop-day-e1-krgcl`, `prop-day-e2-orncm`, `prop-day-e4-tmspz` (run'ları `run-day-…`) | Süre: ertesi seans 09:50 |
| Geçmiş runlar | `run-hist-101` … `run-hist-105` | KRGSG pozisyonu bugün süresi dolan |
| Emir fişi (kişisel mod) | `T-2027-0111-003` · emir `ord-demo-ticket-ornek` | 620 lot @ 48,40, örnek hesap 350.000 TL (Ç-18) |
| Audit zinciri | 4.812 kayıt; kurcalama `#3907` → `hash_mismatch`; dış çapa `#4700` | `setTamper(true)` yalnızca Admin, yalnızca demo |
| Senaryolar | `injectDemo("e3_contract" \| "redteam_injection" \| "restricted_r04" \| "loss_simulation")` | Admin; ⌘K → "Demo çalıştırmaları" |

Demo hesapları (yalnızca mock, parola `kaptan-demo`): `admin@`, `risk@`, `analist@`, `denetci@` ve ikinci onaylayıcı `risk2@` — hepsi `@kaptan.demo`. Dört göz adımları için mock rol değiştirici (kenar çubuğu) ya da `risk2@` kullanılır.

## 5. Test beklentileri ("bitti" tanımı)

- `npm run check` yeşil: `typecheck` + `lint` + `coverage` (vitest, kapsam eşiği satır/ifade/fonksiyon %80, dal %75) + `build`.
- Ekranınızın mantığı (seçiciler, biçimlendiriciler, form doğrulama) birim testli; bileşen testleri Testing Library ile **rol/etiket** üzerinden sorgular.
- Her ekran için `e2e/<rota>.spec.ts` (Playwright, Edge): mutlu yol + bir yetki reddi + konsolda hata yok. Demo adımınız (FRONTEND-SPEC §7) uçtan uca bir test olarak bulunur.
- 1440×900 ve 390×844'te yatay taşma yok; klavye ile tüm eylemler yapılabilir; odak görünür.
- Sahte veri yalnızca `src/mocks/` üzerinden; ekran içinde sabit sayı, sabit şirket adı yok.

## 6. Komutlar

```bash
npm run dev        # http://localhost:3100 (mock)
npm run check      # typecheck + lint + coverage + build
npm run coverage   # vitest kapsam raporu
npm run e2e        # Playwright smoke (Edge); dev sunucusu açıksa onu kullanır
```
