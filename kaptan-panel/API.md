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
böylece çerez birinci taraf kalır. Yanıt şemaya uymazsa panel `502 schema` gösterir.

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
| POST | `/auth/login` | `{"passphrase":"…","role"?:"analyst\|risk_officer\|admin\|auditor"}` | `200 {"access_token":"<jwt>","user":Me}` + `Set-Cookie: __Host-kaptan_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/`. İlk rol: aşağıdaki "Kapıdan istenen rol" |
| POST | `/auth/role` | `{"role":"analyst\|risk_officer\|admin\|auditor"}` | `200 {"access_token":"<jwt>","user":Me}` (yeni rol; refresh ailesi rolü hatırlar) |
| POST | `/auth/refresh` | başlık `X-KAPtan-CSRF: 1`, çerez | `200 {"access_token":"<jwt>"}` |
| POST | `/auth/logout` | çerez | `204` |
| GET | `/me` | Bearer | `200 Me` = `{"id":"uye-3","display_name":"Üye 3","role":"risk_officer"}` |

Access JWT yalnızca bellekte; `401` → bir kez `/auth/refresh`, olmazsa `/login`. Yanlış parola: `401`.

**Kapıdan istenen rol.** `/login` dört kapı gösterir; her kapı kendi giriş ekranıdır (`/login/analist`, `/login/risk`,
`/login/yonetici`, `/login/denetci`). Panel `POST /auth/login` gövdesine kapının rolünü `role` olarak ekler. Bu bir
**istek**tir, yetki değil: rolü backend belirler (ör. kullanıcıya açık değilse yok sayar ya da `risk_officer` verir) ve
panel yanıttaki `user.role`'ü kullanır. Bilinmeyen bir rol değeri `400` alır. `role` yoksa ilk rol `risk_officer`.
Mock modunda `/api/mock/session` aynı gövdeyi alır ve oturumu doğrudan o rolle açar.

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
| 422 | `validation`, `over_qty`, `over_limit`, `after_ttl`, `grow_not_allowed`, `looser`, `no_change` | doğrulama · ör. "Pozisyon tavanı: kanonik sınırdan gevşek olamaz (R07)." |
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
| desk | `limits.changed` | `LimitsView` | Ayarlar → Sınırlar (1/2 → 2/2); Denetim yenilenir |
| feed | `counters` | `DayCounters` | Bugün'deki tayfa cümlesi; Denetim listesi yenilenir |

Rol değişikliği olay değildir: her istemci kendi rolüyle bakar; sunucu yetkiyi her istekte JWT'deki role göre denetler.
