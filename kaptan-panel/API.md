# KAPtan Paneli — API sözleşmesi (backend için)

Panel **yalnızca** aşağıdaki uç noktaları kullanır. Tipler `src/lib/domain/*.ts` içindeki zod şemalarıdır (tek
doğruluk kaynağı); istemci `src/lib/api/http/http-api.ts`, arayüz `src/lib/api/types.ts`, mock `src/lib/api/mock/`.
Bu dosya ile o üçü birbirine uymalı. Ürün kuralları: [SPEC.md](SPEC.md).

## 1. Panele gerçek backend'i bağlamak

```bash
NEXT_PUBLIC_API_MODE=http                 # varsayılan: mock (backend gerekmez)
KAPTAN_API_ORIGIN=http://127.0.0.1:8000   # FastAPI kökü; Next /api/v1/* isteklerini buraya yönlendirir
NEXT_PUBLIC_DEMO_MODE=true                # isteğe bağlı: Ayarlar'daki demo bölümü (backend DEMO_MODE açıksa)
```

Tarayıcı her zaman `/api/v1/...` çağırır; `next.config.ts` bunu `KAPTAN_API_ORIGIN/api/v1/...`'e yeniden yazar,
böylece çerez birinci taraf kalır. `src/proxy.ts` (oturum yönlendirmesi) `/api/v1/*`'e dokunmaz: kimliği API denetler.
SSE akışları da aynı yeniden yazmadan geçer (tamponlanmaz, sıkıştırılmaz; backend `Cache-Control: no-transform` ve
15 sn'de bir yorum satırı gönderir). Yanıt şemaya uymazsa panel `502 schema` gösterir. Panelin saati http modunda
sunucunun saatine uyar (`/disclosures/counters` ve `/risk/status` yanıtlarındaki `as_of`): backend `DEMO_MODE`'da bu
demo saatidir (11.01.2027 …).

Tek komutla (env elle verilmez; PowerShell ve Git Bash'te aynı, `scripts/api-mode.mjs`):

```bash
npm run dev:api     # http modu, KAPTAN_API_ORIGIN=http://127.0.0.1:8000, NEXT_PUBLIC_DEMO_MODE=true
npm run e2e:api     # Playwright paketi http modunda: API'yi (DEMO_MODE, LLM_MODE=replay) ve paneli açar,
                    # açık olanları kullanır; paketten ve durum değiştiren her testten önce POST /demo/reset
npm run dev         # mock (varsayılan, backend gerekmez) · npm run e2e: mock'a karşı aynı paket
```

Backend'in kurulumu ve demo günü: [`../backend/README.md`](../backend/README.md) ("Bütün sistemi yerelde çalıştır").

## 2. Kimlik: tek giriş, dört rol

Bir parola ile girilir; **rol** "kimin gözüyle bakıyorsun" seçimidir ve JWT'nin `role` iddiasında taşınır. Her rol
ekipten bir kişiye bağlıdır (`TEAM`, `src/lib/domain/user.ts`): aynı kişi hem başlatıp hem onaylayamaz.

| Rol (`role`) | Kişi (`uid`) | Ne yapar |
|---|---|---|
| `analyst` — Analist | `uye-2` (`uye-4`) | Okur, not ekler |
| `risk_officer` — Risk Sorumlusu | `uye-3` | Öneriyi imzalar/reddeder, fişi işaretler, durdurur, yeniden başlatmayı **onaylar**, sınır değişikliğini **onaylar**, defteri doğrular |
| `admin` — Yönetici | `uye-1` | Durdurur, yeniden başlatmayı **başlatır**, sınır değişikliği **önerir**, kullanıcıları görür, demo |
| `auditor` — Denetçi | `denetci` | Her şeyi görür; tek yazmayan POST'u `/audit/verify` (yan etkisiz) |

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| POST | `/auth/login` | `{"passphrase":"…","role"?:"analyst\|risk_officer\|admin\|auditor"}` | `200 {"access_token":"<jwt>","user":Me}` + `Set-Cookie: __Host-kaptan_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/`. İlk rol: aşağıdaki "Hesap seçerek giriş" |
| POST | `/auth/role` | `{"role":"analyst\|risk_officer\|admin\|auditor"}` | `200 {"access_token":"<jwt>","user":Me}` (yeni rol; refresh ailesi rolü hatırlar) |
| POST | `/auth/refresh` | başlık `X-KAPtan-CSRF: 1`, çerez | `200 {"access_token":"<jwt>"}` |
| POST | `/auth/logout` | çerez | `204` |
| GET | `/me` | Bearer | `200 Me` = `{"id":"uye-3","display_name":"Üye 3","role":"risk_officer"}` |

Access JWT yalnızca bellekte; `401` → bir kez `/auth/refresh`, olmazsa `/login`. Yanlış parola: `401`.

**Hesap seçerek giriş.** `/login` tek bir ekrandır: "Hesap" radyo grubunda dört ekip hesabı (Analist · Üye 2, Risk
Sorumlusu · Üye 3, Yönetici · Üye 1, Denetçi · Denetçi; varsayılan Risk Sorumlusu) ve tek parola alanı. Panel
`POST /auth/login` gövdesine seçilen hesabın rolünü `role` olarak ekler (`{"passphrase":"…","role":"admin"}`).
`/login/analist`, `/login/risk`, `/login/yonetici`, `/login/denetci` aynı ekranı o hesap seçili açar; bilinmeyen bir
yol (`/login/kral`) 404'tür. `role` bir **istek**tir: rolü backend belirler ve panel yanıttaki `user.role`'ü kullanır.
Bilinmeyen bir rol değeri `400` alır; `role` yoksa ilk rol `risk_officer`. Yanlış parola `401` → "Parola doğrulanamadı."
Giriş hız sınırı IP başına dakikada `LOGIN_RATE_PER_MINUTE` (varsayılan 5; `npm run e2e:api`'nin açtığı test
backend'i 600) → `429`. Mock modunda `/api/mock/session` aynı gövdeyi alır ve oturumu doğrudan o rolle açar; parola
ipucu yalnız mock modunda sayfada yazar.

**Hesap değiştirme** (üst çubuktaki hesap menüsü, rehberli tur): `POST /auth/role` yeni bir access JWT verir ve refresh
ailesinin rolünü günceller; sayfa yenilenince `/auth/refresh` aynı rolle döner.

**Refresh.** Access JWT yalnızca bellekte. Sayfa açılışında (bellek boş) istemci önce `/auth/refresh` çağırır; bir
`401`'de bir kez yeniler, olmazsa `/login`. Refresh token her kullanımda döner ve tekrar kullanılan token bütün aileyi
iptal eder; bu yüzden istemci eşzamanlı yenilemeleri **tek istekte** birleştirir (`http-api.ts`). Dev'de http
üzerinden: tarayıcı `localhost`/`127.0.0.1`'i güvenli bağlam sayar, `Secure` + `__Host-` çerez rewrite üzerinden
çalışır. SSE bileti (`/sse/ticket`) Bearer'sız, yalnız bu çerezle de alınır.

## 3. Uç noktalar

Hepsi `/api/v1` altında, JSON, Bearer ile. Saatler ISO-8601 UTC; para TL, oranlar 0–1 ondalık. "Rol" sütunu
`can(role, action)` tablosudur (`src/lib/auth/permissions.ts`); tablo dışı rol `403` alır (§3.2).

| # | Yöntem | Yol | İstek | Yanıt | Rol |
|---|---|---|---|---|---|
| 1 | GET | `/disclosures/counters` | — | `DayCounters` | hepsi |
| 2 | GET | `/approvals?status=pending\|all` | — | `ApprovalCard[]` | hepsi |
| 3 | POST | `/approvals/{proposal_id}/decision` | `ApprovalDecision` | `ApprovalCard` | risk_officer |
| 4 | GET | `/approvals/{proposal_id}/notes` | — | `ProposalNote[]` | hepsi |
| 5 | POST | `/approvals/{proposal_id}/notes` | `{"body":"…"}` (3–500) | `ProposalNote` | analyst, risk_officer, admin |
| 6 | GET | `/runs/{run_id}/explain` | — | `Explain` | hepsi |
| 7 | GET | `/tickets` | — | `OrderTicket[]` | hepsi |
| 8 | POST | `/tickets/{ticket_no}/mark` | `TicketMarkInput` | `OrderTicket` | risk_officer |
| 9 | GET | `/portfolio/positions` | — | `Position[]` | hepsi |
| 10 | GET | `/portfolio/pnl?from=&to=` | — | `PnlPoint[]` | hepsi |
| 11 | GET | `/risk/status` | — | `RiskStatus` | hepsi |
| 12 | POST | `/risk/kill-switch` | `{"reason":"…"}` (≥ 5) | `RiskStatus` | risk_officer, admin |
| 13 | POST | `/risk/kill-switch/reset/request` | `{"reason":"…"}` (≥ 10) | `RiskStatus` | admin (1/2) |
| 14 | POST | `/risk/kill-switch/reset/confirm` | `{"reason":"…"}` (≥ 10) | `RiskStatus` | risk_officer (2/2, başlatandan farklı kişi) |
| 15 | GET | `/limits` | — | `LimitsView` | hepsi |
| 16 | POST | `/limits/proposals` | `LimitProposalInput` | `LimitsView` | admin (1/2) |
| 17 | POST | `/limits/proposals/{version}/decision` | `LimitDecisionInput` | `LimitsView` | risk_officer (2/2, önerenden farklı kişi) |
| 18 | GET | `/audit?scope=today\|all&q=&limit=` | — | `AuditPage` | hepsi |
| 19 | POST | `/audit/verify` | — | `ChainVerifyResult` | risk_officer, admin, auditor |
| 20 | GET | `/admin/users` | — | `TeamMember[]` | admin, auditor (panel Yönetici ve Denetçi'ye gösterir) |
| 21 | POST | `/demo/inject` | `{"scenario":"e3_contract\|redteam_injection\|restricted_r04\|loss_simulation"}` | `{"disclosure_index":int\|null,"run_id":str\|null}` | admin (yalnız DEMO_MODE) |
| 22 | POST | `/demo/tamper` | `{"on":true\|false}` | `{"tamper_on":bool}` | admin (yalnız DEMO_MODE, demo şeması) |
| 23 | POST | `/demo/reset` | — | `204` | admin (yalnız DEMO_MODE) |
| 24 | POST | `/sse/ticket` | — | `{"ticket":"…"}` (60 sn, tek kullanım) | hepsi |

### 3.1 Şemalar (kısa)

- `ApprovalCard` — önceki alanlar + `decided_by` (`uid`) ve **`decided_role`** (`"risk_officer"` ya da `null`). Panel "ne oldu" cümlesini `event_type` + ailenin **ilk** kuralının `observed` değerinden kurar (`E3.materiality` → "Yıllık gelirinin %18'i kadar yeni iş aldı.").
- `Signature` = `{uid, name, role, at, reason|null}` — her imza.
- `OrderTicket.side` = `"buy" | "sell"` (M4). `sell` = elindeki pozisyondan çıkış (X1–X4 önerisi, aynı iki imzalı onaydan geçer); açığa satış yok: satış fişinin `qty`'si kişisel defterde tutulan adettir. Fiş yalnız kişisel defter o pozisyonu tutuyorsa basılır; kâğıt defter SimBIST üzerinden satar. Satış fişinde `limit_price` bir **taban**dır: `girildi` işaretinde `avg_price ≥ limit_price` (aksi `422 under_limit`); girilen satış kişisel pozisyonu kapatır. Denetimde `ticket.issued` / `ticket.entered` payload'ında `side: "sell"`. Türetilmiş `Order.side` fişinkiyle aynıdır. Panel: fiş ve kartta **Alış / Satış** (fişte `AL` / `SAT`).
- `RiskStatus.reset` = `{"started": Signature|null}` (kill switch açıkken), kapalıyken `null`. `kill_by` = `user:<uid>` ya da `system:risk_monitor`.
- `LimitVersion` = `{version, status: proposed|active|superseded|rejected, reason, created_at, effective_from|null, values: LimitValue[], proposed_by: Signature, decided_by: Signature|null}`; `LimitsView` = `{active, pending|null, history}` (history yeni → eski, `proposed` hariç).
- `LimitProposalInput` = `{key: LimitKey, value: number, reason (≥ 10)}` — tek sınır; yalnızca sıkılaştırır (`limitViolations`).
- `LimitDecisionInput` = `{decision: approve|reject, comment?}`.
- `AuditPage` = `{items: AuditEntry[] (yeni → eski), total, length (zincirin tamamı), tamper_on}`. `q` serbest metin (aktör, eylem, varlık, payload). Panel her kaydı `src/lib/audit-words.ts` ile düz cümleye çevirir; okunur cümle için payload'da `ticker` ve `company` bulunmalı, insan eylemlerinde `role`.
- `AuditEntry` = `{seq, chain_pos, occurred_at, actor ("user:uye-3" | "agent:…" | "system:…"), action, entity_type, entity_id, run_id, strategy_version, payload, prev_hash, hash}`; `hash = sha256(prev_hash || canonical)`, genesis `"00"` (`src/lib/audit-chain.ts`).
- `ChainVerifyResult` = `{ok, first_bad_pos|null, kind|null, checked, head_hash, verified_at, anchor|null}`.
- `TeamMember` = `{uid, name, role, duty_tr}`; `ProposalNote` = `{id, proposal_id, uid, name, role, body, created_at}`.

Panelin okuduğu eylem adları: `disclosure.ingested`, `proposal.created`, `approval.decided`, `note.added`,
`ticket.issued|entered|unfilled|canceled`, `order.filled`, `kill_switch.on`, `kill_switch.reset_started`,
`kill_switch.reset`, `risk.halted`, `risk.rejected`, `compliance.rejected`, `limits.proposed|approved|rejected`,
`audit.verified`, `demo.injected`. Bilinmeyen eylem "Kim: eylem" olarak gösterilir.

### 3.2 Hatalar

Gövde `{"detail":"Türkçe, gösterilebilir mesaj","code":"makine_kodu"}`. Panel `detail`'ı olduğu gibi gösterir.

| Kod | `code` | Ne zaman · örnek `detail` |
|---|---|---|
| 401 | `unauthenticated` | oturum yok / süresi doldu |
| 403 | `forbidden` | rol yetmiyor · **"Bunu Risk Sorumlusu yapar."**, "Bunu Risk Sorumlusu ya da Yönetici yapar.", Denetçi'ye: "Denetçi yalnızca bakar. Bunu … yapar." (metin `deniedReason()` ile aynı) |
| 403 | `same_person` | ikinci imza ilk imzayı atan kişiden · "Başlatan kişi onaylayamaz; ikinci imza başka birinden gelir." / "Öneren kişi onaylayamaz; …" |
| 404 | `not_found` | öneri, koşu ya da fiş yok |
| 409 | `conflict`, `kill_switch`, `halted`, `already_marked`, `already_on`, `not_on`, `not_started`, `already_started`, `pending_exists` | durum uymuyor · ör. "Önce Yönetici yeniden başlatmayı başlatmalı (1/2)." |
| 422 | `validation`, `over_qty`, `over_limit`, `under_limit` (satış fişi), `after_ttl`, `grow_not_allowed`, `looser`, `no_change` | doğrulama · ör. "Pozisyon tavanı: kanonik sınırdan gevşek olamaz (R07)." |
| 429 | — | hız sınırı |

### 3.3 Örnekler

`POST /approvals/prop-demo-e3-ornek/decision` (Risk Sorumlusu)
```json
{ "decision": "approve", "approved_notional_try": null, "comment": "" }
```
Analist aynı isteği yaparsa: `403 {"detail":"Bunu Risk Sorumlusu yapar.","code":"forbidden"}`.

`POST /limits/proposals` (Yönetici) → `LimitsView` (`pending.proposed_by.role = "admin"`)
```json
{ "key": "risk_per_trade_pct", "value": 0.004, "reason": "Oynaklık arttı, işlem başına riski azaltalım." }
```
`POST /limits/proposals/2/decision` (Risk Sorumlusu) `{"decision":"approve"}` → `active.version = 2`, eski sürüm `superseded`.

`POST /risk/kill-switch/reset/request` (Yönetici) `{"reason":"Olay incelendi, eşikler doğru çalıştı."}` →
`reset.started = {uid:"uye-1", role:"admin", …}`; ardından `…/reset/confirm` (Risk Sorumlusu) → `kill_switch:"off"`, `reset:null`.

`POST /audit/verify` → kurcalanmış demo şemasında `{"ok":false,"first_bad_pos":3907,"kind":"hash_mismatch",…}`.

`POST /tickets/T-2027-0111-003/mark` → `{ "mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "…" }`
ya da `{"mark":"unfilled"}` / `{"mark":"canceled"}`. Kurallar: `filled_qty ≤ qty`, `avg_price ≤ limit_price`, `filled_at ≤ valid_until`, tek işaret.

## 4. Canlı olaylar (SSE)

`POST /sse/ticket` → `GET /api/v1/stream/{feed|desk}?ticket=…&last_event_id=…` (EventSource). Her olay `event:` +
`data:` JSON + `id:`. Kopunca 1 → 15 sn geri çekilerek yeniden bağlanılır; bilinmeyen olaylar yok sayılır.

| Akış | Olay | `data` | Panel ne yapar |
|---|---|---|---|
| desk | `approval.requested` | `ApprovalCard` | Bugün'de kart belirir; açık Öneri sayfası (henüz yoksa) yüklenir |
| desk | `approval.decided` | `ApprovalCard` | kart düşer; Öneri'de imza damgası; Denetim yenilenir |
| desk | `ticket` | `OrderTicket` | Öneri'de emir fişi; Portföy yenilenir |
| desk | `order`, `fill` | `Order`, `Fill & {ticker}` | Portföy yenilenir |
| desk | `kill_switch`, `halt` | `RiskStatus` | bant, Durdur bölümü, iki damga (`reset.started` dahil); Denetim yenilenir |
| desk | `regime` | `RiskStatus` | günlük piyasa rejimi değişti (06 §9, `normal` ↔ `crisis`; 18:45 `regime` işi, commit sonrası); Portföy'de "Piyasa: Normal / Kriz" satırı canlı güncellenir |
| desk | `limits.changed` | `LimitsView` | Ayarlar → Sınırlar (1/2 → 2/2); Denetim yenilenir |
| feed | `counters` | `DayCounters` | Bugün'deki tayfa cümlesi; Denetim listesi yenilenir |

Rol değişikliği olay değildir: her istemci kendi rolüyle bakar; sunucu yetkiyi her istekte JWT'deki role göre denetler.

## 5. Yalnızca backend (panel henüz çağırmıyor)

Panelin bugünkü ekranları bu uçları kullanmaz; şekilleri yukarıdaki sözleşmeyi değiştirmez, yalnızca ekler.

### 5.1 Canlı mod anahtarları (M3 A3, `09` §8)

| # | Yöntem | Yol | İstek | Yanıt | Rol |
|---|---|---|---|---|---|
| B1 | GET | `/admin/live` | — | `LiveView` | admin, risk_officer, auditor |
| B2 | POST | `/admin/live/arm` | `{"action":"start\|confirm\|disarm","reason":"…"}` (10–500) | `LiveView` | start: admin (1/2) · confirm: risk_officer (2/2, başlatandan farklı kişi) · disarm: admin, risk_officer |

- `LiveView` = `LiveArmState` (`config_live, env_enabled, ui_key, armed, expires_at|null`) + `started: Signature|null`
  (bekleyen 1/2 imza), `armed_by: Signature|null`, `missing: string[]` (canlı gönderimi engelleyenler, sırayla
  `config`, `env`, `ui_armed`, `kill_switch_off`, `real_broker`), `real_broker: bool`, `effective_mode: "paper"|"live"`.
  `armed` yalnızca `missing` boşsa `true` olur.
- Üç anahtar: K1 `config/trading.yaml` `mode: live` (ya da `KAPTAN_MODE=live`), K2 `KAPTAN_LIVE_ENABLED=true`, K3 bu iki imza.
  K3 18:30'da (İstanbul) kendiliğinden düşer; kill switch açıkken başlatılamaz/onaylanamaz.
- BIST için gerçek aracı kurum adaptörü yok: silahlandırmak yalnızca anahtarları kaydeder, `real_broker` hep `false`,
  emirler SimBIST'te (paper) kalır. Canlı istenip paper'a düşülen her gönderim audit'e `broker.live_fallback` olarak yazılır.
- Hatalar: `403 forbidden` ("Bunu Yönetici yapar." …), `403 same_person`, `409 kill_switch`, `409 not_started`
  ("Önce Yönetici silahlandırmayı başlatmalı (1/2)."), `409 already_on`, `409 conflict` (18:30 sonrası), `422 validation`.
- Audit eylemleri: `live.arm_started`, `live.armed` (`payload.missing`), `live.disarmed`; emir yolunda ayrıca
  `order.refused` (GuardedBroker: `kill_switch`, `halted`, `cooldown`, `hard_cap`), `order.missed` (açılış limit dışı,
  tavan/taban, fiyat yok), `proposal.created` (çıkış önerisi, `rule` X1–X4), `position.stop_moved` (X6).

### 5.2 İşletim uçları ve çalıştırma akışı (M3 A5)

| Yöntem | Yol | Yanıt | Erişim |
|---|---|---|---|
| GET | `/healthz` (kök, `/api/v1` dışında) | `{"status":"ok"}` (canlılık, G/Ç yok) | herkes |
| GET | `/readyz` | 200/503 `{"status":"ready\|not_ready","checks":{"db","redis","migrations"},"workers":{…}}` — DB/Redis yanıt vermezse ya da şema alembic başında değilse 503; işçi nabızları yalnızca bilgi | herkes |
| GET | `/metrics` | Prometheus metni (`kaptan_*`) | `METRICS_TOKEN` varsa `Authorization: Bearer`, yoksa yalnızca 127.0.0.1 |
| GET | `/api/v1/stream/runs/{run_id}?ticket=…&last_event_id=…` | `text/event-stream`: tek koşunun `RUN_EVENTS` olayları (`node`, `crew`, `classification`, `done` …; Redis `kaptan:run:<id>`, 24 sa) | `/sse/ticket` bileti (tüm roller) |

Tüm yanıtlarda `X-Request-ID` (gönderilen geçerliyse aynısı), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`; prod'da
HSTS. Mutasyon uçları (POST/PUT/PATCH/DELETE) kullanıcı başına dakikada `MUTATION_RATE_PER_MINUTE` (60; giriş hız
sınırı yükseltilirse onunla birlikte yükselir): aşımda `429 {"detail":"Çok fazla istek. Biraz sonra yeniden deneyin.","code":"rate_limited"}` + `Retry-After: 60`.
`REFRESH_GRACE_S` (prod 10): az önce döndürülmüş yenileme çerezi bu süre içinde yeniden gelirse aile iptal edilmez
(iki sekme aynı anda yeniler).

### Sabah özeti (M3 B1, FR-35)

| Yöntem | Yol | Yanıt | Rol |
|---|---|---|---|
| GET | `/brief/today` | `MorningBrief` (bugün = sunucu saatinin İstanbul günü) | tüm roller |
| GET | `/brief/{date}` | `MorningBrief` (`YYYY-MM-DD`) | tüm roller |

- `MorningBrief` = `domain/reports.ts`: `date`, `generated_at`, `important_disclosures` (son seans kapanışından bu yana
  bilinen, gürültü olmayan KAP bildirimleri), `orders_for_open` (açılışı bekleyen SimBIST emirleri), `pending_approvals`,
  `open_positions`, `expiring_today` (planlanan çıkışı bugün), `risk_warnings` (`info|warn|critical`), `restriction_changes`
  (`added|removed`), `summary_tr` (veriden kurulan düz Türkçe metin, model yok), `is_sample: false`.
- Zamanlayıcı her seans günü 08:45'te (İstanbul) kurar ve `ops.morning_briefs`'e yazar; aynı gün yeniden kurulursa
  yerine geçer. O gün için yoksa `404 {"detail":"Bu gün için sabah özeti yok.","code":"not_found"}`; bozuk tarih `422`.

### 5.4 Yönetim, değerlendirme ve kişisel aşama (M3 B3, `04` §11, `08` §4, `12` §1)

| Yöntem | Yol | İstek | Yanıt | Rol |
|---|---|---|---|---|
| GET | `/admin/restricted` | — | `RestrictedView` = `{entries: RestrictedSecurity[], pending_removals: {id, ticker, requested_by: {uid,name,role,at,reason}}[]}` | admin, risk_officer, auditor |
| POST | `/admin/restricted` | `{"ticker":"ASELS","kind":"team_insider\|other","source_ref":null,"reason":"…"}` (10–500) | `RestrictedView` | admin (hemen etkili) |
| POST | `/admin/restricted/{id}/removal` | `{"reason":"…"}` | `RestrictedView` | admin (1/2) |
| POST | `/admin/restricted/{id}/removal/confirm` | `{"reason":"…"}` | `RestrictedView` | risk_officer (2/2, başlatandan farklı kişi) |
| GET | `/admin/universe?d=YYYY-MM-DD` | — | `AdminUniverseView` = `{d\|null, rule_version\|null, rows: AdminUniverseRow[], unmatched_overrides[]}` | admin, auditor |
| PUT | `/admin/universe/overrides/{ticker}` | `{"mode":"include\|exclude","reason":"…"}` | `AdminUniverseView` | admin |
| DELETE | `/admin/universe/overrides/{ticker}?reason=…` | — | `AdminUniverseView` | admin |
| GET | `/admin/config` | — | `{view: ConfigView, settings: {…}, limits: {version, values: LimitValue[]}}` | admin, auditor |
| GET | `/eval/summary` | — | `EvalSummary` | tüm roller |
| GET | `/reports/forward/weekly?week=YYYY-Www` | — | `ForwardWeeklyReport` (varsayılan: geçen hafta) | tüm roller |
| GET | `/personal/stage` | — | `PersonalStageStatus` | tüm roller |

- **Engel listesi (R13, `09` RBAC):** ekleme hemen etkilidir (`tb:<hex>` kimliği, `added_by: "user:<uid>"`); çıkarma iki
  imzalıdır. Tedbir eşitlemesinin satırları (`ts:` öneki, `system:` ekleyen) ve SPK/VBTS türleri elle çıkarılamaz.
  Hatalar: `409 already_listed`, `409 synced` ("Bu kayıt tedbir eşitlemesinden geliyor; elle çıkarılamaz."),
  `409 pending_exists`, `409 not_started` ("Önce Yönetici çıkarmayı başlatmalı (1/2)."), `403 same_person`, `404 not_found`.
  Audit: `restricted.added`, `restricted.removal_requested`, `restricted.removed`.
- **Evren:** `AdminUniverseRow` = `UniverseEntry` alanları + `is_eligible` (kuralların cevabı), `reasons` (geçilemeyen U
  kodları), `override: {mode, reason, set_by, set_at}|null`. `in_universe` istisna uygulanmış sonuçtur (exclude her
  zaman kazanır; include yalnızca o gün satırı olan hisse için). Ajanların okuduğu evren de istisnaları uygular.
  Audit: `universe.override_set` (`from`, `mode`), `universe.override_cleared`.
- **Config:** `settings` gizli olmayan ayarlardır: her `SecretStr` ve adı key/secret/token/password/hash/url/dsn içeren
  ayar düşülür (maskelenmez). `fallback_chain` OLLAMA_BASE_URL verilince `ollama` halkasını da gösterir.
- **EvalSummary:** L4 (`pnl_daily`), gölge getiriler (`trading.shadow_signals`, 20 günlük getirisi olanlar), gecikme
  (canlı koşuların p50/p95'i) ve bugünkü LLM maliyeti tablolardan gelir; L1/L2/L3, ablation ve red-team çevrimdışı
  değerlendirmeler tabloya yazılana kadar boştur (sıfır, boş liste). `is_sample` = `DEMO_MODE`.
- **ForwardWeeklyReport** (`08` §4.2 şablonunun 1–5. bölümleri, İstanbul Pazartesi 00:00 → sonraki Pazartesi):
  `{week, start, end, generated_at, config_hash, audit_head|null, pipeline: {disclosures, noise, classified,
  by_event: {E1..E4, X}, quarantined, signals, to_approval, approved, rejected, expired}, portfolio: {strategy,
  week_return|null, cumulative|null, max_dd}[], trades: {version, ticker, event_type, opened_at, closed_at, exit_rule,
  return, realized_pnl_try}[], shadow: {version, ticker, event_type, rejected_by, excess_5d|null, excess_20d|null}[],
  agent_health: {runs, p50_s|null, p95_s|null, tokens_per_run, hold_rate, quota_holds}}`. 6–7. bölümler (olaylar,
  yorum) insan yazar. `422 validation` geçersiz hafta.
- **PersonalStageStatus:** aşama takvimden (9 Kas 2026 öncesi Kanıt, sonrası Paper); Gölge ve Küçük gerçek paraya
  geçiş yazılı kişi kararıdır, otomatik değildir. Ölçütler ölçülür: holdout (`core.event_returns`, 20 seans CAR,
  t ≥ 2, n ≥ 30), kapanmış işlem (≥ 50), paper süresi (≥ 90 gün), en büyük düşüş (≤ %10, kişisel).
