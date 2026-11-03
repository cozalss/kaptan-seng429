# KAPtan Paneli — API sözleşmesi (tek kullanıcı)

> Tek kullanıcı kararı (02.11.2026, [`_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md) Revizyon 4): rol yoktur,
> iki kişilik onay yoktur. Oturum açmış kullanıcı her uca erişir. Atlanan ikinci imza denetim defterine
> `auth.single_user_waiver` olarak yazılır. Hiçbir uç `403` ile "yanlış rol" ya da "aynı kişi" demez.

Panel **yalnızca** aşağıdaki uç noktaları kullanır. Tipler `src/lib/domain/*.ts` içindeki zod şemalarıdır (tek doğruluk
kaynağı); istemci, arayüz ve mock bu şemalara uymalı. Ürün kuralları: [SPEC.md](SPEC.md).

## 1. Panele gerçek backend'i bağlamak

```bash
NEXT_PUBLIC_API_MODE=http                 # varsayılan: mock (backend gerekmez)
KAPTAN_API_ORIGIN=http://127.0.0.1:8000   # FastAPI kökü; Next /api/v1/* isteklerini buraya yönlendirir
NEXT_PUBLIC_DEMO_MODE=true                # isteğe bağlı: demo enjeksiyonu (backend DEMO_MODE açıksa)
```

Tarayıcı her zaman `/api/v1/...` çağırır; `next.config.ts` bunu `KAPTAN_API_ORIGIN/api/v1/...`'e yeniden yazar,
böylece çerez birinci taraf kalır. `src/proxy.ts` (oturum yönlendirmesi) `/api/v1/*`'e dokunmaz: kimliği API denetler.
SSE akışları aynı yeniden yazmadan geçer (tamponlanmaz, sıkıştırılmaz; backend `Cache-Control: no-transform` ve 15 sn'de
bir yorum satırı gönderir). Yanıt şemaya uymazsa panel `502 schema` gösterir. Panelin saati http modunda sunucunun saatine
uyar (`/disclosures/counters` ve `/risk/status` yanıtlarındaki `as_of`): backend `DEMO_MODE`'da bu demo saatidir.

```bash
npm run dev:api     # http modu, KAPTAN_API_ORIGIN=http://127.0.0.1:8000, NEXT_PUBLIC_DEMO_MODE=true
npm run e2e:api     # Playwright paketi http modunda: API'yi (DEMO_MODE, LLM_MODE=replay) ve paneli açar;
                    # paketten ve durum değiştiren her testten önce POST /demo/reset
npm run dev         # mock (varsayılan, backend gerekmez) · npm run e2e: mock'a karşı aynı paket
```

Backend'in kurulumu ve demo günü: [`../backend/README.md`](../backend/README.md).

## 2. Oturum: tek parola

Tek parola, tek hesap. Hesap seçimi, rol seçimi ve hesap değiştirme yoktur.

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| POST | `/auth/login` | `{"passphrase":"…"}` | `200 {"access_token":"<jwt>","user":Me}` + `Set-Cookie: __Host-kaptan_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/` |
| POST | `/auth/refresh` | başlık `X-KAPtan-CSRF: 1`, çerez | `200 {"access_token":"<jwt>"}` |
| POST | `/auth/logout` | çerez | `204` |
| GET | `/me` | Bearer | `200 Me` = `{"id":"sahip","display_name":"Sen"}` (değerler örnektir) |

- Yanlış parola: `401`. Giriş hız sınırı IP başına dakikada `LOGIN_RATE_PER_MINUTE` (varsayılan 5) → `429`.
- Yanıtta `user.role` ya da başka eski rol alanı gelebilir; panel bunları **yok sayar** (zod bilinmeyen alanı atar).
  Yeni istemci hiçbir rol alanı göndermez.
- `POST /auth/role` **yoktur**. `GET /admin/users` **yoktur**. `GET /api/v1/health` yanıtında `single_user` alanı **yoktur**;
  panel bu alanı okumaz.
- Access JWT yalnızca bellekte; `401` → bir kez `/auth/refresh`, olmazsa giriş ekranı. Refresh token her kullanımda döner;
  tekrar kullanılan token bütün aileyi iptal eder, bu yüzden istemci eşzamanlı yenilemeleri tek istekte birleştirir.
  SSE bileti (`/sse/ticket`) Bearer'sız, yalnız refresh çereziyle alınır.
- Mock modunda `POST /api/mock/session` `{"passphrase":"…"}` alır ve `kaptan_mock_session` çerezini (8 saat) açar.
  Parola `kaptan2026`; ipucu yalnız mock modunda giriş sayfasında yazar.

## 3. Uç noktalar

Hepsi `/api/v1` altında, JSON, Bearer ile. Saatler ISO-8601 UTC; para TL, oranlar 0–1 ondalık.

| # | Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|---|
| 1 | GET | `/disclosures/counters` | — | `DayCounters` |
| 2 | GET | `/approvals?status=pending\|all` | — | `ApprovalCard[]` |
| 3 | POST | `/approvals/{proposal_id}/decision` | `ApprovalDecision` | `ApprovalCard` |
| 4 | GET | `/approvals/{proposal_id}/notes` | — | `ProposalNote[]` |
| 5 | POST | `/approvals/{proposal_id}/notes` | `{"body":"…"}` (3–500) | `ProposalNote` |
| 6 | GET | `/runs/{run_id}/explain` | — | `Explain` |
| 7 | GET | `/tickets` | — | `OrderTicket[]` |
| 8 | POST | `/tickets/{ticket_no}/mark` | `TicketMarkInput` | `OrderTicket` |
| 9 | GET | `/portfolio/positions` | — | `Position[]` |
| 10 | GET | `/portfolio/pnl?from=&to=` | — | `PnlPoint[]` |
| 11 | GET | `/risk/status` | — | `RiskStatus` |
| 12 | POST | `/risk/kill-switch` | `{"reason":"…"}` (≥ 5) | `RiskStatus` |
| 13 | POST | `/risk/kill-switch/reset/request` | `{"reason":"…"}` (≥ 10) | `RiskStatus` |
| 14 | POST | `/risk/kill-switch/reset/confirm` | `{"reason":"…"}` (≥ 10) | `RiskStatus` |
| 15 | GET | `/limits` | — | `LimitsView` |
| 16 | POST | `/limits/proposals` | `LimitProposalInput` | `LimitsView` |
| 17 | POST | `/limits/proposals/{version}/decision` | `LimitDecisionInput` | `LimitsView` |
| 18 | GET | `/audit?scope=today\|all&q=&limit=` | — | `AuditPage` |
| 19 | POST | `/audit/verify` | — | `ChainVerifyResult` |
| 20 | POST | `/demo/inject` | `{"scenario":"e3_contract\|redteam_injection\|restricted_r04\|loss_simulation"}` | `{"disclosure_index":int\|null,"run_id":str\|null}` (yalnız `DEMO_MODE`) |
| 21 | POST | `/demo/tamper` | `{"on":true\|false}` | `{"tamper_on":bool}` (yalnız `DEMO_MODE`) |
| 22 | POST | `/demo/reset` | — | `204` (yalnız `DEMO_MODE`) |
| 23 | POST | `/sse/ticket` | — | `{"ticket":"…"}` (60 sn, tek kullanım) |
| 24 | GET | `/me/overview` | — | `MeOverview` (tek kullanıcı ana sayfası; tek çağrı) |
| 25 | POST | `/me/suggestions/{suggestion_id}/hold` | `{"kind":"held\|skipped","note"?}` | `SuggestionHoldOut` (backend'de; panel henüz çağırmıyor) |

### 3.1 Onay, durdurma ve yeniden başlatma

- **Onay (3).** `approve` onaylar; `approve` + daha küçük `approved_notional_try` **küçültür**; `reject` reddeder.
  Onay ya da ret, yanıtlanmamış öneriyi bir sonraki seansın 09:50'sinde düşmeden önce kapatır. Yanıt ya da kayıt
  bu arada değiştiyse `409` döner.
- **Durdurma (12).** Yeni emir çıkmaz, açık emirler iptal edilir, bekleyen öneriler düşer, pozisyon satılmaz.
- **Yeniden başlatma (13, 14).** Tek kişi iki adımı da yapar.
  1. `reset/request` gerekçeyi alır ve `reset.started` alanını doldurur.
  2. `RiskStatus.reset.ready_at` alanı, onayın açılacağı en erken anı (ISO) söyler. Gerçek veride bu an, istek ile onay
     arasında **en az 24 saat** ve durdurmadan sonra **en az 5 seans** geçtikten sonradır. `ready_at` `null` ise ya da
     geçmişteyse onay hemen yapılabilir.
  3. `reset/confirm` `ready_at` gelmeden çağrılırsa `409` döner; mesajı panel olduğu gibi gösterir.
  4. `DEMO_MODE=true` bekleme süresini muaf tutar (`ready_at` `null` gelir); muafiyet `auth.single_user_waiver`
     olarak denetim defterine yazılır.

  Panel akışı: "Yeniden başlat" → `reset/request`. Yanıttaki `ready_at` boşsa ya da geçmişteyse hemen `reset/confirm`.
  Değilse şu cümleyi gösterir: "Yeniden başlatma isteğin alındı. En erken <tarih> tarihinde açılır." Sebebi de yanında yazılır.
- **Sınırlar (15–17).** Değişikliği hem önerir hem onaylarsın. İkinci imzanın muafiyeti `auth.single_user_waiver`
  olarak yazılır. Sınırlar yalnızca sıkılaştırılabilir
  (`limitViolations`, `LimitProposalInput` için sunucu da doğrular).

### 3.2 Şemalar (kısa)

- `ApprovalCard` — önceki alanlar + `decided_by` (`uid` ya da `null`). `decided_role` **yoktur**. Panel "ne oldu" cümlesini
  `event_type` + ailenin ilk kuralının `observed` değerinden kurar (`E3.materiality` → "Yıllık gelirinin %18'i kadar yeni iş aldı.").
- `Signature` = `{uid, name, at, reason|null}` — bir imza. `role` alanı **yoktur**.
- `OrderTicket.side` = `"buy" | "sell"`. `sell` = elindeki pozisyondan çıkış; açığa satış yok. Satış fişinin `qty`'si kişisel
  defterde tutulan adettir. Satış fişinde `limit_price` bir **taban**dır: `girildi` işaretinde `avg_price ≥ limit_price`
  (aksi `422 under_limit`). Panel: fiş ve kartta **Alış / Satış** (fişte `AL` / `SAT`).
- `RiskStatus` = `{kill_switch: off|on, kill_reason|null, kill_at|null, halted_today, daily_pnl_pct, drawdown_pct, peak_equity,
  equity, regime, live_armed, quota[], reset}` ve `reset` = `{started: Signature|null, ready_at: ISO|null}` (kill switch
  açıkken), kapalıyken `reset: null`. `kill_by` = `user:<uid>` ya da `system:risk_monitor`.
- `LimitVersion` = `{version, status: proposed|active|superseded|rejected, reason, created_at, effective_from|null,
  values: LimitValue[], proposed_by: Signature, decided_by: Signature|null}`; `LimitsView` = `{active, pending|null, history}`
  (history yeni → eski, `proposed` hariç).
- `LimitProposalInput` = `{key: LimitKey, value: number, reason (≥ 10)}` — tek sınır; yalnızca sıkılaştırır.
- `LimitDecisionInput` = `{decision: approve|reject, comment?}`.
- `AuditPage` = `{items: AuditEntry[] (yeni → eski), total, length (zincirin tamamı), tamper_on}`. `q` serbest metin
  (aktör, eylem, varlık, payload). Panel her kaydı `src/lib/audit-words.ts` ile düz cümleye çevirir; okunur cümle için payload'da
  `ticker` ve `company` bulunmalıdır.
- `AuditEntry` = `{seq, chain_pos, occurred_at, actor ("user:<uid>" | "agent:…" | "system:…"), action, entity_type,
  entity_id, run_id, strategy_version, payload, prev_hash, hash}`; `hash = sha256(prev_hash || canonical)`, genesis `"00"`
  (`src/lib/audit-chain.ts`).
- `ChainVerifyResult` = `{ok, first_bad_pos|null, kind|null, checked, head_hash, verified_at, anchor|null}`.
- `ProposalNote` = `{id, proposal_id, uid, name, body, created_at}`.
- `MeOverview` — tek kullanıcı ana sayfasının verisi (toplam değer, başladığından beri kazanç, bugünkü değişim, yerleşim,
  bekleyen öneriler). Şeması backend'de `domain/schemas/overview.py` içindedir; alanlar değişmedi. Her sayının ne olduğunu
  panel etiketler; sayılar bu uçtan gelir, panel uydurmaz.

Panelin okuduğu eylem adları (denetim defteri): `disclosure.ingested`, `proposal.created`, `approval.decided`, `note.added`,
`ticket.issued|entered|unfilled|canceled`, `order.filled`, `kill_switch.on`, `kill_switch.reset_started`, `kill_switch.reset`,
`risk.halted`, `risk.rejected`, `compliance.rejected`, `limits.proposed|approved|rejected`, `audit.verified`, `demo.injected`,
`auth.single_user_waiver`. Bilinmeyen eylem "Sen: eylem" ya da "KAPtan: eylem" olarak gösterilir.

### 3.3 Hatalar

Gövde `{"detail":"Türkçe, gösterilebilir mesaj","code":"makine_kodu"}`. Panel `detail`'ı olduğu gibi gösterir.

| Kod | `code` | Ne zaman · örnek `detail` |
|---|---|---|
| 401 | `unauthenticated` | oturum yok / süresi doldu |
| 404 | `not_found` | öneri, koşu ya da fiş yok |
| 409 | `conflict`, `kill_switch`, `halted`, `already_marked`, `already_on`, `not_on`, `not_started`, `already_started`, `pending_exists`, `too_early` | durum uymuyor · ör. yeniden başlatma için bekleme süresi dolmamış |
| 422 | `validation`, `over_qty`, `over_limit`, `under_limit`, `after_ttl`, `grow_not_allowed`, `looser`, `no_change` | doğrulama · ör. "Pozisyon tavanı: kanonik sınırdan gevşek olamaz (R07)." |
| 429 | `rate_limited` | hız sınırı; `Retry-After` |

**403 yoktur.** Oturum açmış kullanıcı her uca erişir. Yetki hatası diye bir yanıt türü yoktur.

### 3.4 Örnekler

`POST /approvals/prop-demo-e3-ornek/decision`
```json
{ "decision": "approve", "approved_notional_try": null, "comment": "" }
```

`POST /limits/proposals` → `LimitsView` (`pending.proposed_by` = kendi imzan)
```json
{ "key": "risk_per_trade_pct", "value": 0.004, "reason": "Oynaklık arttı, işlem başına riski azaltalım." }
```
`POST /limits/proposals/2/decision` `{"decision":"approve"}` → `active.version = 2`, eski sürüm `superseded`.

`POST /risk/kill-switch/reset/request` `{"reason":"Olay incelendi, eşikler doğru çalıştı."}` →
`reset.started` dolu, `reset.ready_at` gerçek veride ileri bir tarih, demo modunda `null`.
`POST /risk/kill-switch/reset/confirm` erken çağrılırsa `409 conflict`; uygunsa `kill_switch:"off"`, `reset:null`.

`POST /audit/verify` → kurcalanmış demo şemasında `{"ok":false,"first_bad_pos":3907,"kind":"hash_mismatch",…}`.

`POST /tickets/T-2027-0111-003/mark` → `{ "mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "…" }`
ya da `{"mark":"unfilled"}` / `{"mark":"canceled"}`. Kurallar: `filled_qty ≤ qty`, `avg_price ≤ limit_price`,
`filled_at ≤ valid_until`, tek işaret.

## 4. Canlı olaylar (SSE)

`POST /sse/ticket` → `GET /api/v1/stream/{feed|desk}?ticket=…&last_event_id=…` (EventSource). Her olay `event:` +
`data:` JSON + `id:`. Kopunca 1 → 15 sn geri çekilerek yeniden bağlanılır; bilinmeyen olaylar yok sayılır.

| Akış | Olay | `data` | Panel ne yapar |
|---|---|---|---|
| desk | `approval.requested` | `ApprovalCard` | Ana sayfada kart belirir; açık Öneri ekranı yenilenir |
| desk | `approval.decided` | `ApprovalCard` | kart düşer; Öneri'de damga; Geçmiş yenilenir |
| desk | `ticket` | `OrderTicket` | Öneri'de emir fişi; Param yenilenir |
| desk | `order`, `fill` | `Order`, `Fill & {ticker}` | Param yenilenir |
| desk | `kill_switch`, `halt` | `RiskStatus` | durdurma durumu, `reset` dahil; Geçmiş yenilenir |
| desk | `regime` | `RiskStatus` | piyasa rejimi değişti (06 §9, `normal` ↔ `crisis`) |
| desk | `limits.changed` | `LimitsView` | Ayarlar → Sınırlar; Geçmiş yenilenir |
| feed | `counters` | `DayCounters` | Okunanlar ve ana sayfa sayaçları |

## 5. Yalnızca backend (panel çağırmıyor ya da henüz çağırmıyor)

Bu uçlar backend'de vardır; panelin bugünkü ekranları kullanmaz. Şekilleri yukarıdaki sözleşmeyi değiştirmez.

### 5.1 Canlı mod anahtarları

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| GET | `/admin/live` | — | `LiveView` |
| POST | `/admin/live/arm` | `{"action":"start\|confirm\|disarm","reason":"…"}` (10–500) | `LiveView` |

- Üç anahtar: K1 `config/trading.yaml` `mode: live` (ya da `KAPTAN_MODE=live`), K2 `KAPTAN_LIVE_ENABLED=true`, K3 bu
  uçtaki onay. K3 tek kişiyle `start` + `confirm` olarak yapılır; ikinci adımın muafiyeti denetime yazılır. Gün sonunda
  (18:30 İstanbul) kendiliğinden düşer. Kill switch açıkken onaylanamaz.
- BIST için gerçek aracı kurum adaptörü yok: silahlandırmak yalnızca anahtarları kaydeder, `real_broker` hep `false`,
  emirler SimBIST'te (paper) kalır. Hatalar: `409 kill_switch`, `409 not_started`, `409 already_on`, `409 conflict`
  (18:30 sonrası), `422 validation`.

### 5.2 İşletim uçları ve çalıştırma akışı

| Yöntem | Yol | Yanıt | Erişim |
|---|---|---|---|
| GET | `/healthz` (kök, `/api/v1` dışında) | `{"status":"ok"}` | herkes |
| GET | `/readyz` | 200/503 `{"status":"ready\|not_ready","checks":{"db","redis","migrations"},"workers":{…}}` | herkes |
| GET | `/metrics` | Prometheus metni (`kaptan_*`) | `METRICS_TOKEN` varsa `Authorization: Bearer`, yoksa yalnızca 127.0.0.1 |
| GET | `/api/v1/stream/runs/{run_id}?ticket=…&last_event_id=…` | `text/event-stream`: tek koşunun olayları (`node`, `crew`, `classification`, `done` …) | `/sse/ticket` bileti |
| GET | `/api/v1/health` | sağlık durumu (`single_user` alanı yok) | herkes |

Tüm yanıtlarda `X-Request-ID`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`; prod'da HSTS. Mutasyon uçları
kullanıcı başına dakikada `MUTATION_RATE_PER_MINUTE` (60): aşımda `429 {"detail":"Çok fazla istek. Biraz sonra yeniden deneyin.","code":"rate_limited"}` + `Retry-After: 60`.
`REFRESH_GRACE_S` (prod 10): az önce döndürülmüş yenileme çerezi bu süre içinde yeniden gelirse aile iptal edilmez.

### 5.3 Sabah özeti

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/brief/today` | `MorningBrief` (bugün = sunucu saatinin İstanbul günü) |
| GET | `/brief/{date}` | `MorningBrief` (`YYYY-MM-DD`) |

`MorningBrief` = `date`, `generated_at`, `important_disclosures`, `orders_for_open`, `pending_approvals`, `open_positions`,
`expiring_today`, `risk_warnings` (`info|warn|critical`), `restriction_changes` (`added|removed`), `summary_tr` (veriden
kurulan düz Türkçe metin, model yok), `is_sample: false`. Zamanlayıcı her seans günü 08:45'te (İstanbul) kurar. O gün için
yoksa `404 {"detail":"Bu gün için sabah özeti yok.","code":"not_found"}`.

### 5.4 Engel listesi, evren, yapılandırma, değerlendirme ve kişisel aşama

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| GET | `/admin/restricted` | — | `RestrictedView` = `{entries, pending_removals}` |
| POST | `/admin/restricted` | `{"ticker":"ASELS","kind":"team_insider\|other","source_ref":null,"reason":"…"}` (10–500) | `RestrictedView` (hemen etkili) |
| POST | `/admin/restricted/{id}/removal` | `{"reason":"…"}` | `RestrictedView` |
| POST | `/admin/restricted/{id}/removal/confirm` | `{"reason":"…"}` | `RestrictedView` (ikinci imza muaf; denetime yazılır) |
| GET | `/admin/universe?d=YYYY-MM-DD` | — | `AdminUniverseView` |
| PUT | `/admin/universe/overrides/{ticker}` | `{"mode":"include\|exclude","reason":"…"}` | `AdminUniverseView` |
| DELETE | `/admin/universe/overrides/{ticker}?reason=…` | — | `AdminUniverseView` |
| GET | `/admin/config` | — | `{view, settings, limits}` |
| GET | `/eval/summary` | — | `EvalSummary` |
| GET | `/reports/forward/weekly?week=YYYY-Www` | — | `ForwardWeeklyReport` |
| GET | `/personal/stage` | — | `PersonalStageStatus` |

- **Engel listesi (R13).** Kişisel: bağlantılı olduğun şirketlerin hisseleri. Ekleme hemen etkilidir; çıkarma
  tek adımda, yine denetime yazılan bir kayıtla yapılır. Tedbir eşitlemesinden gelen satırlar elle çıkarılamaz.
  Hatalar: `409 already_listed`, `409 synced` ("Bu kayıt tedbir eşitlemesinden geliyor; elle çıkarılamaz."), `409 pending_exists`,
  `409 not_started`, `404 not_found`. Denetim eylemleri: `restricted.added`, `restricted.removal_requested`, `restricted.removed`.
  (`kind` değerleri backend'in mevcut sözlüğüdür; yeniden adlandırılırsa bu tablo güncellenir.)
- **Evren.** `AdminUniverseRow` = `UniverseEntry` alanları + `is_eligible`, `reasons`, `override`. `in_universe` istisna
  uygulanmış sonuçtur (exclude her zaman kazanır). Audit: `universe.override_set`, `universe.override_cleared`.
- **Yapılandırma.** `settings` gizli olmayan ayarlardır: her `SecretStr` ve adı key/secret/token/password/hash/url/dsn içeren
  ayar düşülür.
- **EvalSummary.** L4 (`pnl_daily`), gölge getiriler, gecikme ve LLM maliyeti tablolardan gelir; L1/L2/L3, ablation ve red-team
  çevrimdışı değerlendirmeler tabloya yazılana kadar boştur (sıfır, boş liste). `is_sample` = `DEMO_MODE`.
- **ForwardWeeklyReport** (`08` §4.2, İstanbul Pazartesi 00:00 → sonraki Pazartesi): `{week, start, end, generated_at,
  config_hash, audit_head|null, pipeline, portfolio, trades, shadow, agent_health}`. Olaylar ve yorum bölümleri insan yazar.
- **PersonalStageStatus:** aşama takvimden (9 Kas 2026 öncesi Kanıt, sonrası Paper); gölgeden ve küçük gerçek paraya
  geçiş yazılı kişi kararıdır, otomatik değildir. Ölçütler ölçülür: holdout (`core.event_returns`, 20 seans CAR, t ≥ 2, n ≥ 30),
  kapanmış işlem (≥ 50), paper süresi (≥ 90 gün), en büyük düşüş (≤ %10).
