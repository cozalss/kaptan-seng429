# KAPtan Paneli — API sözleşmesi (backend için)

Panelin üç ekranı (Bugün, Öneri, Portföy) ve Ayarlar **yalnızca** aşağıdaki uç noktaları kullanır.
Tipler `src/lib/domain/*.ts` içindeki zod şemalarıdır (tek doğruluk kaynağı); istemci
`src/lib/api/http/http-api.ts`, arayüz `src/lib/api/types.ts`. Bu dosya ile o iki dosya birbirine uymalı.

## 1. Panele gerçek backend'i bağlamak

```bash
NEXT_PUBLIC_API_MODE=http            # varsayılan: mock (backend gerekmez)
KAPTAN_API_ORIGIN=http://127.0.0.1:8000   # FastAPI kökü; Next /api/v1/* isteklerini buraya yönlendirir
NEXT_PUBLIC_DEMO_MODE=true           # isteğe bağlı: Ayarlar'daki demo düğmeleri (backend DEMO_MODE açıksa)
```

Tarayıcı her zaman `/api/v1/...` çağırır; `next.config.ts` bunu `KAPTAN_API_ORIGIN/api/v1/...`'e
yeniden yazar, böylece çerez birinci taraf kalır. Yanıtlar şemaya uymazsa panel `502 schema` hatası gösterir.

## 2. Kimlik: tek kullanıcı, tek parola

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| POST | `/auth/login` | `{"passphrase":"…"}` | `200 {"access_token":"<jwt>","user":{"id":"sen","display_name":"Sen"}}` + `Set-Cookie: __Host-kaptan_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/` |
| POST | `/auth/refresh` | başlık `X-KAPtan-CSRF: 1`, çerez | `200 {"access_token":"<jwt>"}` |
| POST | `/auth/logout` | çerez | `204` (refresh ailesi iptal) |
| GET | `/me` | Bearer | `200 {"id":"sen","display_name":"Sen"}` |

- Access JWT yalnızca bellekte tutulur; her istekte `Authorization: Bearer <jwt>`.
- `401` gelince panel bir kez `/auth/refresh` dener, yine olmazsa `/login`'e döner.
- Yanlış parola: `401` (tek, genel mesaj). Rol yok, ikinci onaylayıcı yok, TOTP yok.
- `src/proxy.ts` http modunda yalnızca `__Host-kaptan_rt` çerezinin varlığına bakar.

## 3. Uç noktalar

Hepsi `/api/v1` altında, JSON, Bearer ile. Saatler ISO-8601 UTC; para TL, oranlar 0–1 arası ondalık.

| # | Yöntem | Yol | İstek | Yanıt | Kullanan |
|---|---|---|---|---|---|
| 1 | GET | `/disclosures/counters` | — | `DayCounters` | Bugün (tayfa cümlesi) |
| 2 | GET | `/approvals?status=pending\|all` | — | `ApprovalCard[]` | Bugün, Öneri |
| 3 | POST | `/approvals/{proposal_id}/decision` | `ApprovalDecision` | `ApprovalCard` | Öneri (Onayla / Reddet) |
| 4 | GET | `/runs/{run_id}/explain` | — | `Explain` | Öneri (hikâye, tayfa, kanıt, fiş) |
| 5 | GET | `/tickets` | — | `OrderTicket[]` | Portföy (girilecek fişler) |
| 6 | POST | `/tickets/{ticket_no}/mark` | `TicketMarkInput` | `OrderTicket` | Öneri, Portföy (Girdim / Dolmadı / İptal) |
| 7 | GET | `/portfolio/positions` | — | `Position[]` | Portföy |
| 8 | GET | `/portfolio/pnl?from=&to=` | — | `PnlPoint[]` | Portföy (çizgi; `strategy="kaptan:v1.1-fwd"` kullanılır) |
| 9 | GET | `/risk/status` | — | `RiskStatus` | hepsi (bant, Durdur) |
| 10 | POST | `/risk/kill-switch` | `{"reason":"…"}` (≥ 5 harf) | `RiskStatus` | Portföy (Durdur) |
| 11 | POST | `/risk/kill-switch/reset` | `{"reason":"…"}` (≥ 10 harf) | `RiskStatus` | Portföy (1. ve 2. onay) |
| 12 | POST | `/demo/inject` | `{"scenario":"e3_contract\|redteam_injection\|restricted_r04\|loss_simulation"}` | `{"disclosure_index":int\|null,"run_id":str\|null}` | Ayarlar (yalnız DEMO_MODE) |
| 13 | POST | `/demo/clock` | `{"hours":1..336}` | `RiskStatus` | Ayarlar: zamanı ileri sar (yalnız DEMO_MODE) |
| 14 | POST | `/demo/reset` | — | `204` | Ayarlar (yalnız DEMO_MODE) |
| 15 | POST | `/sse/ticket` | — | `{"ticket":"…"}` (60 sn, tek kullanım) | SSE bağlantısı |

### Örnekler

`POST /approvals/prop-demo-e3-ornek/decision`
```json
{ "decision": "approve", "approved_notional_try": null, "comment": "" }
```
Ret: `{"decision":"reject","approved_notional_try":null,"comment":"Tek seferlik kâr"}` (not isteğe bağlı, ≤ 500).
Panel lot küçültmez; `approved_notional_try` her zaman `null` gönderilir (alan sözleşmede kalır).

`ApprovalCard` (kısaltılmış — panelin okuduğu alanlar):
```json
{
  "proposal_id": "prop-demo-e3-ornek", "run_id": "run-demo-e3-ornek",
  "ticker": "ORNEK", "company_name": "ÖRNEK ENERJİ A.Ş.",
  "event_type": "E3", "sub_type_tr": "Bağlayıcı hizmet sözleşmesi",
  "headline_tr": "Yıllık gelirin %18'i tutarında bağlayıcı sözleşme",
  "qty": 1240, "limit_price": 48.35, "holding_days": [5, 5],
  "final_notional_try": 59954, "requested_notional_try": 119908,
  "evidence_summary": { "n": 23, "hit_rate_5d": 0.61, "median_car_5d": 0.011, "median_car_20d": 0.012, "strength": "strong", "card_id": "…" },
  "skeptic_note_tr": "Bildirimden önceki 2 seansta +%3,6 anormal hareket var…",
  "size_multiplier": 0.5, "compliance_summary_tr": "Tedbir yok, injection yok.",
  "rule_trace_summary": [{ "rule": "E3.materiality", "passed": true, "observed": "%18", "threshold": "≥ %10 yıllık gelir", "detail_tr": "…" }],
  "created_at": "2027-01-11T10:41:30Z", "expires_at": "2027-01-12T06:50:00Z",
  "status": "pending", "decided_at": null, "is_fixture": true
}
```
Panel "ne oldu" cümlesini `event_type` + ilgili ailenin **ilk** kuralının `observed` değerinden kurar
(`E3.materiality` → "Yıllık gelirinin %18’i kadar yeni iş aldı."). Bu yüzden `rule_trace_summary`'de
olayın kendi kuralı (`E1.*`…`E4.*`) ilk sırada ve `observed` okunur biçimde ("%18", "%0,31", "1,4") olmalı.

`Explain` içinden kullanılanlar: `disclosure.published_at`, `texts[0].body` (alıntı: ikinci paragrafın ilk cümlesi),
`classifier.confidence`, `merged.amount_try`, `compliance.decision`, `risk_checks[]`, `proposal.stop_price`,
`evidence_events[].car_5d` (şerit grafik, en çok 20), `ticket` (onaydan sonra), `trace.nodes[]` (ayrıntılar).

`POST /tickets/T-2027-0111-003/mark`
```json
{ "mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "2027-01-11T10:52:00Z" }
```
ya da `{"mark":"unfilled"}` / `{"mark":"canceled"}`. Kurallar: `filled_qty ≤ qty` (`422 over_qty`),
`avg_price ≤ limit_price` (`422 over_limit`), `filled_at ≤ valid_until` (`422 after_ttl`), tek işaret (`409 already_marked`).
"Girildi" bir fişi `book:"personal"` pozisyonu yapar.

### Durdur (kill switch) kişisel kuralı
`POST /risk/kill-switch` yeni emirleri durdurur, açık emirleri iptal eder, pozisyon satmaz; bekleyen öneriler
`status:"cancelled"` olur. Panel durdururken yazılan gerekçeyi aynı anda **1. onay** olarak da gönderir
(`/risk/kill-switch/reset`). 2. onay ancak `reset.next_step == "second"` iken: 1. onaydan ≥ 24 saat **ve**
tetikten sonra ≥ 5 seans kapanışı. Erken: `409 too_early`; kapalıyken: `409 not_on`.
`RiskStatus.reset` = `{sessions_since_kill, sessions_required, sessions_ready_at, min_gap_hours, first, second_allowed_at, next_step, ready_at}`;
`demo_clock_offset_h` gerçek API'de hep `0`.

### Hatalar
Gövde `{"detail":"Türkçe, kullanıcıya gösterilebilir mesaj"}`. Panel `detail`'ı olduğu gibi gösterir.

| Kod | Ne zaman |
|---|---|
| 401 | oturum yok / süresi doldu |
| 404 | öneri, koşu ya da fiş yok |
| 409 | zaten karar verildi / süresi doldu (`conflict`), kill switch açık (`kill_switch`), günlük −%1 durdurması (`halted`), `already_marked`, `too_early`, `not_on`, `already_on` |
| 422 | doğrulama (`validation`, `over_qty`, `over_limit`, `after_ttl`, `grow_not_allowed`) |
| 429 | hız sınırı |

## 4. Canlı olaylar (SSE)

`POST /sse/ticket` → `GET /api/v1/stream/{feed|desk}?ticket=…&last_event_id=…` (EventSource).
Her olay `event:` adı + `data:` JSON + `id:`. Panel kopunca 1 → 15 sn geri çekilerek `last_event_id` ile yeniden bağlanır;
tanımadığı olayları yok sayar.

| Akış | Olay | `data` | Panel ne yapar |
|---|---|---|---|
| desk | `approval.requested` | `ApprovalCard` | Bugün'de kart mürekkeple belirir; başka ekrandaysan küçük bir fiş "Yeni öneri · İncele" |
| desk | `approval.decided` | `ApprovalCard` | kart listeden düşer; açık Öneri sayfası güncellenir |
| desk | `ticket` | `OrderTicket` | Öneri sayfasında emir fişi görünür; Portföy yenilenir |
| desk | `order`, `fill` | `Order`, `Fill & {ticker}` | Portföy yenilenir |
| desk | `kill_switch`, `halt` | `RiskStatus` | kırmızı/okra bant, Durdur bölümü |
| feed | `counters` | `DayCounters` | Bugün'deki tayfa cümlesi |

Sözleşmedeki diğer olaylar (`disclosure`, `classification`, `crew`, run akışı…) gönderilebilir; bu panel kullanmaz.
