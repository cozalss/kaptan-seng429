# KAPtan Paneli — API sözleşmesi (tek kullanıcı)

> Tek kullanıcı kararı (02.11.2026, [`_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md) Revizyon 4): rol yoktur,
> iki kişilik onay yoktur. Oturum açmış kullanıcı her uca erişir. Atlanan ikinci imza denetim defterine
> `auth.single_user_waiver` olarak yazılır. Hiçbir uç `403` ile "yanlış rol" ya da "aynı kişi" demez.

Panel **yalnızca** aşağıdaki uç noktaları kullanır. Tipler `src/lib/domain/*.ts` içindeki zod şemalarıdır (tek doğruluk
kaynağı); istemci, arayüz ve mock bu şemalara uymalı. Ürün kuralları: [SPEC.md](SPEC.md).

## 1. Panelin backend'e bağlanması

Ürün http'dir. Backend'in kökü `KAPTAN_API_ORIGIN`'dedir (örnek `http://127.0.0.1:8000`); `next dev` boşsa oraya düşer.
Tarayıcı her zaman `/api/v1/...` çağırır; `next.config.ts` bunu `KAPTAN_API_ORIGIN/api/v1/...`'e yeniden yazar, böylece
çerez birinci taraf kalır. `src/proxy.ts` (oturum yönlendirmesi) `/api/v1/*`'e dokunmaz: kimliği API denetler.
SSE akışları aynı yeniden yazmadan geçer (tamponlanmaz, sıkıştırılmaz; backend `Cache-Control: no-transform` ve 15 sn'de
bir yorum satırı gönderir). Yanıt şemaya uymazsa panel `502 schema` gösterir. Panelin saati sunucunun saatine uyar
(`/disclosures/counters` ve `/risk/status` yanıtlarındaki `as_of`).

Tarayıcı içi sahte API yalnızca bir **test ikizidir** (`NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1`, vitest ve Playwright için);
ürün değildir, kullanıcıya gösterilmez.

```bash
npm run dev         # gerçek backend'e karşı, port 3100
npm run dev:api     # aynısı, KAPTAN_API_ORIGIN açıkça verilir
npm run e2e         # test ikizine karşı Playwright paketi (backend gerekmez)
npm run e2e:api     # aynı paket gerçek backend'e karşı: API'yi (LLM_MODE=replay, canlı kaynaklar kapalı) ve paneli açar
```

Backend'in kurulumu: [`../backend/README.md`](../backend/README.md).

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
| 1a | GET | `/disclosures?day=&ticker=&type=E1\|E2\|E3\|E4\|IGNORE&acted=true&scope=watchlist\|mine` | — | `DisclosureListItem[]` (filtreler VE ile birleşir) |
| 1b | GET | `/disclosures/{index}` | — | `DisclosureReading` (tam metin, okunan rakamlar, ne yaptı; 404) |
| 1c | GET | `/companies/{ticker}?period=1m\|3m\|1y\|all` | — | `Company` (404 `not_found`) |
| 1d | GET | `/search?q=` | — | `SearchResult` (Türkçe harfler katlanır; 2 harften azı boş) |
| 1e | GET/PUT/DELETE | `/watchlist`, `/watchlist/{ticker}` | — | `WatchItem[]` (en çok 50, 409 `watchlist_full`; `watchlist.added/removed` denetlenir) |
| 1f | GET | `/me/reading` | — | `ReadingState` (okunmamış sayısı: izlenen/elindeki şirketler, gürültü hariç; `unread_indexes` ≤ 500, `saved_indexes`) |
| 1g | POST/PUT | `/me/reading/read-all`, `/me/reading/read/{index}`, `/me/reading/read-through` | `{read_through}` (yalnızca read-through) | `ReadingState` ("Hepsini okundu say", tek duyuru açıldı; 404; "Geri al": işaret yalnızca geri gider, gelecek an 422) |
| 1h | GET/PUT/DELETE | `/me/reading/saved`, `/me/reading/saved/{index}` | — | `DisclosureListItem[]` / `ReadingState` (sonra oku; denetim kaydı yok, para değil) |
| 1i | GET | `/compare?a=&b=&period=` | — | `Compare` (iki şirket: fiyat çizgisi, istatistik, 90 günlük KAP sayıları; 404, 422 aynı kod) |
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
| 15 | GET | `/limits` | — | `LimitsView` |
| 16 | POST | `/limits/proposals` | `LimitProposalInput` | `LimitsView` |
| 17 | POST | `/limits/proposals/{version}/decision` | `LimitDecisionInput` | `LimitsView` |
| 18 | GET | `/audit?scope=today\|all&q=&limit=` | — | `AuditPage` |
| 19 | POST | `/audit/verify` | — | `ChainVerifyResult` |
| 20 | GET | `/me/money` | — | `MoneyBook` = `{cash, put_in, movements: MoneyMovement[]}` (yeniden eskiye) |
| 21 | POST | `/me/money` | `MoneyInput` = `{kind:"start\|deposit\|withdrawal", amount_try (>0, ≤1e10), note?}` | `MoneyBook`. `409 already_started`, `409 not_started`, `422 over_cash` |
| 22 | POST | `/me/holdings` | `HoldingInput` = `{ticker, qty, avg_cost, bought_on}` | `Position` (`origin:"own"`). `422 unknown_ticker`, `409 not_started` |
| 23 | POST | `/sse/ticket` | — | `{"ticket":"…"}` (60 sn, tek kullanım) |
| 24 | GET | `/me/overview` | — | `MeOverview` (tek kullanıcı ana sayfası; tek çağrı) |
| 25 | POST | `/me/suggestions/{suggestion_id}/hold` | `{"kind":"held\|skipped","note"?}` | `SuggestionHoldOut` (backend'de; panel henüz çağırmıyor) |
| 26 | POST | `/me/holdings/{position_id}/sell` | `HoldingSellInput` = `{qty, price, sold_at, commission_try?}` | `Position \| null` (kalmadıysa `null`). Yalnız elle eklenen hisse; `422 over_qty` |
| B1 | POST | `/me/money/{id}/correct` | `MovementCorrectInput` = `{amount_try?, qty?, avg_cost?, bought_on?, note?}` | `MoneyBook`. Yanlış yazılan tutarı düzeltir (başlangıç parası dahil); eski satıra işaret eden yeni defter satırı, kazanç/zarar değil. `409 already_undone \| has_sales`, `422 over_cash \| no_change` |
| B2 | POST | `/me/money/{id}/undo` | — | `MoneyBook`. "Bunu yanlış girdim": ters satır; satır listede `status:"undone"` kalır. `409 cannot_undo_start \| already_undone \| has_sales`, `422 over_cash` |
| B3 | POST | `/tickets/{ticket_no}/correct` | `TicketCorrectInput` = `{filled_qty, avg_price, commission_try?}` | `OrderTicket`. Kaydedilen dolumu düzeltir; nakit ve pozisyon yeniden hesaplanır, denetim `ticket.corrected`. `409 not_entered \| sold_since`, `422 over_qty \| over_limit \| under_limit \| sell_qty \| no_change` |
| B4 | GET\|PUT | `/me/fee` | `BrokerFeeInput` = `{commission_rate: 0..0.01 \| null}` | `BrokerFee` = `{commission_rate, default_rate, bsmv, own}`. Bankanın komisyon oranı; tahmin bunu kullanır. `TicketEntry.commission_rate`/`commission_rate_own` hangisinin kullanıldığını söyler. `422 out_of_range` |
| B5 | POST | `/me/book/reset` | `{confirm:"baştan"}` | `{closed_book}`. "Baştan başla": defter kapanır, geçmiş silinmez; `needs_setup` döner. `409 not_started`, `422 confirm` |
| B6 | GET | `/me/books` | — | `PreviousBook[]` (önceki defterler, salt okunur) |
| B7 | GET | `/me/export.csv` | — | CSV (UTF-8 BOM, `;`, ondalık virgül); `Content-Disposition: attachment` |
| C1 | GET | `/me/corporate` | — | `CorporateBook` = `{this_year_try, total_try, per_holding: DividendTotal[], records: CorporateRecord[]}` (kâr payları bu yıl/toplam, hisse başına; kayıtlar yeniden eskiye) |
| C2 | POST | `/me/corporate/dividends` | `DividendInput` = `{ticker, net_try, gross_try?, received_on, note?, notice_id?}` | `CorporateBook`. Gelirdir: nakit ve kazanç artar, koyulan para artmaz. `409 not_started`, `422 never_held`, `422 future_date`. Denetim `dividend.recorded` |
| C3 | POST | `/me/corporate/bonus` | `BonusInput` = `{ticker, ex_date, new_qty \| bonus_pct, note?, notice_id?}` | `CorporateBook`. Adet artar, toplam maliyet aynı, nakit yok. `409 not_held`, `422 not_more`, `422 future_date`. Denetim `bonus.recorded` |
| C4 | POST | `/me/corporate/rights` | `RightsInput` = `{ticker, subscribed_on, qty, price, note?, notice_id?}` | `CorporateBook`. Pay alınır, nakit düşer. `409 not_held`, `422 over_cash`. Denetim `rights.recorded` |
| C5 | POST | `/me/corporate/{id}/undo` | — | `CorporateBook`. Silmez: düzeltme satırı ekler (`corrects`). `409 already_undone \| is_undo \| changed`, `404 not_found`. Denetim `<tür>.corrected` |
| C6 | GET | `/me/corporate/notices` | — | `NoticeAnswer` = `{notices: CorporateNotice[]}`: elindeki hisse için KAP'ın kâr payı / bedelsiz / bedelli duyuruları. Okunamayan rakam `null`, `facts_note` söyler. Defteri değiştirmez |
| C7 | POST | `/me/corporate/notices/{id}/dismiss` | — | `NoticeAnswer`. Denetim `corporate.dismissed` |
| I1 | POST | `/me/import/read?source=&filename=` | ham dosya baytları (CSV/TSV/TXT, XLSX, yazısı seçilebilen PDF; en çok 5 MB) | `ImportTable` = `{file_kind, number_style, columns, rows: string[][], truncated, has_header_guess, saved_mapping, saved_matches}`. Dosya bellekte okunur, saklanmaz. Tür baytlardan anlaşılır, ad uyumlu olmalı. `413 too_large`, `415 unsupported_type \| old_excel \| macros`, `422 encrypted \| scanned \| unreadable \| empty`, `422 validation` (kaynak adı) |
| I2 | POST | `/me/import/preview` | `ImportRequest` = `{source, mapping: ImportMapping, number_style, rows}` | `ImportPreview` = `{rows[{index, date, kind, ticker, qty, price, commission_try, amount_try, status new\|recorded\|conflict\|invalid\|skipped, reason}], new, recorded, conflict, invalid, skipped, unknown_types[], started}`. Yazmaz. Bilinmeyen işlem adı sorulur (`mapping.types`), tahmin edilmez |
| I3 | POST | `/me/import/apply` | `ImportApplyRequest` = `ImportRequest + {selected: number[]}` | `ImportResult` = `{written, failed[ImportRow], preview}`. Yalnız seçilen yeni satırlar, her biri kendi denetimli kaydıyla (`money.deposited`/`money.withdrawn`/`dividend.recorded`/`holding.sold`/`holding.bought`, `imported: true`) ve bir `import.applied` özetiyle. Aynı dosya iki kez: satır özeti (SHA-256) bilindiği için hiçbir şey eklenmez |
| I4 | GET | `/me/import/sources` | — | `ImportSources` = `{sources: string[]}` (hatırlanan sütun eşleştirmesi olan kaynak adları) |
| P1 | GET | `/me/insights/allocation` | — | `Allocation` = `{started, equity_try, cash_try, cash_pct, holdings[{ticker, company, sector, value_try, pct}], sectors[], threshold_pct, warning_tr}`. Pay = paranın tamamında (nakit dahil) yüzde; `warning_tr` en büyük hisse sınırı aşınca ("Paranın %41'i tek hissede (ORNEK). Sınırın %25.") |
| P2 | PUT | `/me/insights/concentration` | `{threshold_pct: 5..100}` | `Allocation`. Yalnızca cümleyi değiştirir. `422 validation`. Denetim `concentration.threshold_set` |
| P3 | GET | `/me/insights/closed-trades` | — | `ClosedTrades` = `{trades[{id, ticker, company, sold_at, qty, cost_try, proceeds_try, gain_try, gain_pct, days_held \| null}], wins, losses, win_rate_pct, total_gain_try, avg_days_held, note_tr}`. Ortalama maliyet, komisyon dahil; elle eklenen hissede `days_held` null |
| P4 | GET | `/me/insights/stats` | — | `ReturnStats` = `{available, reason_tr, days, from, to, twr_pct, best_day, worst_day, max_fall_pct, fall_from, fall_to, caveat_tr}`. Para ekleme/çekmeden arınmış; yalnızca kapanışlar; 2 günden azsa `available: false` |
| P5 | GET | `/me/insights/dividends` | — | `DividendIncome` = `{year, this_year_try, last_year_try, total_try, months[12], holdings[{ticker, company, last12_try, cost_try, yield_on_cost_pct}]}`. Yalnızca yazılmış kâr payları |
| P6 | GET | `/me/insights/versus` | — | `Versus` = `{available, from, to, items[{key you\|usd\|inflation\|deposit, label, pct, source_tr, hidden_reason_tr}], reason_tr}`. Dolar `core.fx_rates`'ten; enflasyon ve mevduat için resmi kaynak bağlı değil: sayı yok, neden var |
| P7 | GET | `/me/notes` | — | `HoldingNotes` = `{notes[{ticker, company, body, updated_at}]}` |
| P8 | PUT | `/me/notes/{ticker}` | `{body: 3..500}` | `HoldingNotes`. `404 not_in_book`, `422 validation`. Denetim `note.saved` (metin değil, uzunluk) |
| P9 | DELETE | `/me/notes/{ticker}` | — | `HoldingNotes`. `404 no_note`. Denetim `note.cleared` |

### 3.0 Kişinin kendi defteri (tek defter)

- Tek defter kişinin kendi parasıdır. `MeOverview.needs_setup` başlangıç parası girilene kadar `true`; o sürece para
  alanları `0`, listeler boş, `capital_start` `0`. Panel `/benim`'de tek soruluk ilk ekranı gösterir.
- `capital_start` = koyulan para (başlangıç + eklenen − çekilen + elle eklenen hisselerin maliyeti). `pnl_abs` =
  `equity_now − capital_start`. Para eklemek ya da çekmek kazanç/zarar değildir; panel çizgiyi her günü o güne kadar
  koyulan paraya göre çizer (`src/lib/solo/flows.ts`).
- `prices_as_of` ve `allocations[].price_as_of`/`Position.price_as_of`: fiyatın bilindiği an; panel düz sözle yaşını yazar.
- `Position` yeni alanlar: `id`, `origin: "suggestion"\|"own"`, `price_as_of`. `own` için `source_proposal`/`run_id` `""`,
  `event_type` `"IGNORE"`.
- `TicketMarkInput.entered` isteğe bağlı `commission_try`; boşsa backend tahmin eder: `OrderTicket.entry.commission_try`,
  `commission_estimated`, `late` (süre dolduktan sonra girilen işlem reddedilmez, `late: true` ile kaydedilir).
- `/disclosures/counters` `waiting_for_money`: başlangıç parası girilene kadar öneri çıkmaz.
- `RiskStatus.equity` / `peak_equity` kurulumdan önce `0` olabilir.

### 3.1 Onay (durdurma yoktur)

- **Onay (3).** `approve` onaylar; `approve` + daha küçük `approved_notional_try` **küçültür**; `reject` reddeder.
  Onay ya da ret, yanıtlanmamış öneriyi bir sonraki seansın 09:50'sinde düşmeden önce kapatır. Yanıt ya da kayıt
  bu arada değiştiyse `409` döner.
- **Durdurma yoktur (2026-11-21 kararı).** Elle durdurma (kill switch), yeniden başlatma isteği/onayı, 24 saat + 5 seans
  beklemesi, günlük −%1 duraklaması ve zirveden −%5 durdurması kaldırıldı. `/risk/kill-switch*` uçları yoktur; hiçbir
  kayıp kendiliğinden bir şeyi durdurmaz ve uyarı da göndermez. Karar kişinindir. `RiskStatus` yalnızca bilgi verir
  (özkaynak, zirve, zirveden düşüş, günün sonucu). Eski denetim kayıtları (`kill_switch.on`, `kill_switch.reset_started`,
  `kill_switch.reset`, `risk.halted`, `risk.halt_cleared`) silinmez; Geçmiş'te okunmaya devam eder. Pozisyon başına ATR
  çıkışı (X2) durdurma değil, bir **çıkış önerisidir** ve durur.
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
- `RiskStatus` = `{daily_pnl_pct, drawdown_pct, peak_equity, equity, regime, live_armed, quota[], as_of}`: yalnızca bilgi;
  durdurma alanları (`kill_*`, `halted_today`, `reset`) yoktur.
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
`risk.halted`, `risk.rejected`, `compliance.rejected`, `limits.proposed|approved|rejected`, `audit.verified`,
`money.started|deposited|withdrawn`, `holding.added|sold`, `auth.single_user_waiver`. Bilinmeyen eylem "Sen: eylem" ya da "KAPtan: eylem" olarak gösterilir.

### 3.3 Hatalar

Gövde `{"detail":"Türkçe, gösterilebilir mesaj","code":"makine_kodu"}`. Panel `detail`'ı olduğu gibi gösterir.

| Kod | `code` | Ne zaman · örnek `detail` |
|---|---|---|
| 401 | `unauthenticated` | oturum yok / süresi doldu |
| 404 | `not_found` | öneri, koşu ya da fiş yok |
| 409 | `conflict`, `already_marked`, `not_started`, `pending_exists`, `too_early` | durum uymuyor |
| 422 | `validation`, `over_qty`, `over_limit`, `under_limit`, `after_ttl`, `grow_not_allowed`, `looser`, `no_change` | doğrulama · ör. "Pozisyon tavanı: kanonik sınırdan gevşek olamaz (R07)." |
| 429 | `rate_limited` | hız sınırı; `Retry-After` |

**403 yoktur.** Oturum açmış kullanıcı her uca erişir. Yetki hatası diye bir yanıt türü yoktur.

### 3.4 Örnekler

`POST /approvals/{proposal_id}/decision`
```json
{ "decision": "approve", "approved_notional_try": null, "comment": "" }
```

`POST /limits/proposals` → `LimitsView` (`pending.proposed_by` = kendi imzan)
```json
{ "key": "risk_per_trade_pct", "value": 0.004, "reason": "Oynaklık arttı, işlem başına riski azaltalım." }
```
`POST /limits/proposals/2/decision` `{"decision":"approve"}` → `active.version = 2`, eski sürüm `superseded`.

`POST /audit/verify` → zincir bozulmuşsa `{"ok":false,"first_bad_pos":3907,"kind":"hash_mismatch",…}`.

`POST /tickets/T-2027-0111-003/mark` → `{ "mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "…" }`
ya da `{"mark":"unfilled"}` / `{"mark":"canceled"}`. Kurallar: `filled_qty ≤ qty`, `avg_price ≤ limit_price`,
`filled_at ≤ valid_until`, tek işaret.

### 3.5 Sistem durumu, uyarılar ve sıra gelmeyen bildirimler

Panelin "KAPtan gerçekten çalışıyor mu?" sorusu. Şemalar `src/lib/domain/system.ts` ve `disclosure.ts`.

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/system/status` | `SystemStatus` |
| GET | `/me/alerts` | `AlertSettings` |
| POST | `/me/alerts/test` | `AlertSettings` (`429 rate_limited`: dakikada en çok bir) |
| GET | `/me/preferences` | `Preferences` = `{pause{active, until, since}, alerts{kinds{suggestion,part_down,watched,price,weekly: {phone, desktop}}, quiet{on, start, end}}}` |
| PUT | `/me/alerts/preferences` | `Preferences` (gövde `AlertPrefs`; saatler `HH:MM`, İstanbul saati; `422` bozuk saat) |
| POST | `/me/pause` | `Preferences` (gövde `{days: 1..90}` ya da `{until: "YYYY-MM-DD"}` = KAPtan'ın yeniden çalıştığı ilk gün, 00:00 İstanbul; `422` geçmiş/90 günden uzak/ikisi birden). Tatil modu: bildirimler okunur ve saklanır, ajan koşusu ve kota harcanmaz, öneri çıkmaz; durdurma ve çıkışlar çalışır |
| POST | `/me/pause/resume` | `Preferences` ("Şimdi devam et"; ara yoksa kayıt yazmaz) |
| GET | `/me/backup` | `BackupStatus` = `{state: idle\|waiting\|running, last_at, last_ok, requested_at, folder, message_tr}` |
| POST | `/me/backup/run` | `BackupStatus` ("Şimdi yedek al": yedek servisi 15 sn içinde alır; sürerken ikinci istek yazılmaz; `429` dakikada 3) |
| GET | `/me/backup/list` | `BackupList` = `{available, folder, last_at, age_days, stale, warning_tr, files[{name, at, size_bytes, age_days}], steps_tr[]}`: yedek klasörü salt okunur bağlıdır; `available` false = klasör görünmüyor (boş liste "yedek yok" demek değildir); `stale` = en yeni yedek 2 günden eski ya da yok. Geri yükleme uygulamadan yapılmaz (`geri-yukle.ps1`) |
| GET | `/me/price-alerts` | `PriceAlert[]` (bekleyenler önce; `current_price` null = fiyat yok) |
| POST | `/me/price-alerts` | `{ticker, direction: above\|below, level \| preset_pct: 5\|10}` → liste; denetim `price_alert.created`; `404` bilinmeyen kod, `409 no_price` / `alerts_full` (30), `422 already_passed` / `validation` |
| DELETE | `/me/price-alerts/{id}` | liste; denetim `price_alert.removed`; `404` |
| GET | `/me/alerts/history` | `AlertHistoryItem[]` = `{at, channel: ntfy\|email, ok, text}` son 100 gönderim; konu adı, adres, hisse, tutar yok |
| GET | `/me/weekly?at=YYYY-MM-DD` | `WeeklySummary` (Pazartesi–Pazar haftası; varsayılan bu hafta); `422` bozuk tarih |
| PUT | `/me/alerts/preferences` | `AlertPrefs` artık `price`, `weekly` (varsayılan açık) ve `muted: string[]` (en çok 50 kod) taşır; susturulan şirketin önerisi ve izlenen bildirimi dışarı haber vermez |
| POST | `/auth/password` | `{signed_out_others}` (gövde `{current, new}`; `403 wrong_password`, `422 weak_password`/validation: en az 6, en çok 200 karakter, `kaptan2026` ve eskisiyle aynısı yok; `429` dakikada `LOGIN_RATE_PER_MINUTE`. Diğer oturumlar kapanır, bu kalır) |
| POST | `/auth/logout-all` | `204` (bu cihaz dahil her oturum kapanır; erişim belirteçleri hemen geçersiz olur) |

- **`SystemStatus`** = `{reading, message|null, checked_at, ingest{ok, last_poll_at|null, age_s|null}, agents{ok,
  last_run_at|null, age_s|null}, scheduler{ok}, backup{ok, last_at|null, age_h|null}, problems: {code, message}[]}`.
  `problems` en önemlisi önce gelir; `message` = `problems[0].message`, sorun yoksa `null`. Panel dakikada bir sorar:
  `message` doluysa her sayfanın üstünde tek sakin satır, Ayarlar "Sistem" bölümünde bütün `problems[].message`.
  Hiç yanıt gelmezse panel ulaşamadığını söyler, bir şey uydurmaz.
- **`AlertSettings`** = `{ntfy, email, last_sent_at|null, last_error_tr|null}`: telefon ve e-posta kanallarından hangisi
  kurulu, son gönderim. Konu adı ya da adres **dönmez**. Mesajlar ticker, şirket, tutar ya da yön taşımaz. Masaüstü
  uyarısı backend'siz, tarayıcının Notification API'siyle SSE'den çıkar.
- **`DayCounters`** iki alan ekler: `deferred_reason_tr: string | null` (sıra gelmeyen bildirimlerin nedeni, tek cümle; `deferred`
  zaten vardı) ve `waiting_for_money: boolean` (başlangıç parası girilene kadar `true`: bildirimler okunup listelenir, ama
  öneri çıkmaz ve LLM kotası harcanmaz).

### 3.6 Karne: öneri sicili, BIST 100 ve aylık/yıllık rapor

Şemalar `src/lib/domain/reports.ts` (altta "Karne" bloğu). Hepsi salt okunur. Panel ayrıca ana sayfada `GET /brief/today` çağırır
(404 = henüz yok, panel hiçbir şey göstermez; bkz. 5.3).

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/reports/track?from=&to=` | `TrackRecord` (verilen her alım önerisi, ne yaptın, sonra fiyat ne yaptı) |
| GET | `/reports/benchmark?from=&to=` | `Benchmark` (paran ve BIST 100, aynı günlerde) |
| GET | `/reports/karne?period=month\|year&at=2026-11\|2026` | `Karne` (varsayılan: bu ay; `422` bozuk dönem) |
| GET | `/reports/quiet?day=` | `QuietDay` ("neden öneri yok?" için günün gerçek sayıları) |
| GET | `/me/digest?day=` | `Digest` (günün önemli KAP duyuruları, TÜM şirketlerden; bilgi, öneri değil: geri alım, yönetici/ana ortak alımı-satımı, yeni iş/ihale, finansal sonuç, kâr payı, sermaye, birleşme/bölünme, SPK tedbiri; KAP konu adına göre seçilir, model yok; sınıflanamayan yok. Varsayılan gün bugün, borsa kapalıysa son işlem günü ve `note`; elindeki, sonra izlediğin şirketler önde; evren dışı şirkette `outside_note`; `day` bozuksa `422`) |
| GET | `/me/calendar?days=` | `Calendar` (elindeki ve izlediğin hisselerin yaklaşan günleri: KAP bildiriminden kâr payı ödeme/hak günü ve genel kurul, geçen yılın rapor günü `approximate`, Merkez Bankası faiz kararı günleri; `notes` neyi göstermediğini söyler; `days` 1-120, varsayılan 60, dışı `422`) |
| GET | `/market/strip` | `MarketStrip` (BIST 100 son kayıtlı kapanış ve günlük değişim, borsa açık/kapalı ve sonraki açılış günü, Merkez Bankası dolar kuru; kayıtlı olmayan değer `null`) |

- **`TrackItem.return_ratio`**: önerinin ardından ilk seansın açılışından, kartın planlanan en uzun tutma gününün kapanışına
  düzeltilmiş fiyat hareketi (komisyon yok); `index_ratio` aynı seansların BIST 100 hareketi. Süre bitmediyse ikisi `null`,
  `status: "open"`, `result_tr` "Sonuç 6 Aralık'ta belli olur". Süre bitti ama fiyat kaydı yoksa `status: "no_data"`: hiçbir ortalamaya
  girmez, tahmin edilmez. `decision` = `took|approved_open|not_bought|declined|skipped|expired|waiting|cancelled`.
- **`TrackSummary.caveat_tr`**: 30'dan az sonuçlanmış öneride "bu kadar azla bir şey söylemek erken" der. `compare_tr` "her öneriyi
  izleseydin" ile "senin aldıkların"ı karşılaştırır (her öneriye eşit tutar).
- **`Benchmark`**: kişinin sonucu `pnl_daily.daily_return` zincirinden (para ekleme/çekme kazanç sayılmaz), BIST 100 kayıtlı XU100
  kapanışlarından. İki günden az kapanış ya da endeks fiyatı yoksa `available: false` + `reason_tr`; panel satırı göstermez.
- **`Karne`**: `null` alan bilinmiyor demektir, sayfa o satırı çıkarır (`dividends_try` defterde temettü satırı olana kadar `null`).
  `gain_try` = dönem sonu değer − dönem başı değer − dışarıdan giren/çıkan para; `realized_try` defterden ortalama maliyetle yeniden
  hesaplanır; `unrealized_try` yalnızca içinde bulunulan dönemde.

## 4. Canlı olaylar (SSE)

`POST /sse/ticket` → `GET /api/v1/stream/{feed|desk}?ticket=…&last_event_id=…` (EventSource). Her olay `event:` +
`data:` JSON + `id:`. Kopunca 1 → 15 sn geri çekilerek yeniden bağlanılır; bilinmeyen olaylar yok sayılır.

| Akış | Olay | `data` | Panel ne yapar |
|---|---|---|---|
| desk | `approval.requested` | `ApprovalCard` | Ana sayfada kart belirir; açık Öneri ekranı yenilenir |
| desk | `approval.decided` | `ApprovalCard` | kart düşer; Öneri'de damga; Geçmiş yenilenir |
| desk | `ticket` | `OrderTicket` | Öneri'de emir fişi; Param yenilenir |
| desk | `order`, `fill` | `Order`, `Fill & {ticker}` | Param yenilenir |
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
  (18:30 İstanbul) kendiliğinden düşer.
- BIST için gerçek aracı kurum adaptörü yok: silahlandırmak yalnızca anahtarları kaydeder, `real_broker` hep `false`,
  emirler SimBIST'te (paper) kalır. Hatalar: `409 not_started`, `409 conflict`
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
  çevrimdışı değerlendirmeler tabloya yazılana kadar boştur (sıfır, boş liste). `is_sample` sayıların örnek olup olmadığını söyler.
- **ForwardWeeklyReport** (`08` §4.2, İstanbul Pazartesi 00:00 → sonraki Pazartesi): `{week, start, end, generated_at,
  config_hash, audit_head|null, pipeline, portfolio, trades, shadow, agent_health}`. Olaylar ve yorum bölümleri insan yazar.
- **PersonalStageStatus:** aşama takvimden (9 Kas 2026 öncesi Kanıt, sonrası Paper); gölgeden ve küçük gerçek paraya
  geçiş yazılı kişi kararıdır, otomatik değildir. Ölçütler ölçülür: holdout (`core.event_returns`, 20 seans CAR, t ≥ 2, n ≥ 30),
  kapanmış işlem (≥ 50), paper süresi (≥ 90 gün), en büyük düşüş (≤ %10).
