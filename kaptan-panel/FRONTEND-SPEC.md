# KAPtan Paneli — Frontend başvurusu (tek kullanıcı)

> Bu belge [`SPEC.md`](./SPEC.md) ve [`API.md`](./API.md) ile birlikte okunur. Ürün kuralları SPEC'tedir, uç noktalar API.md'dedir;
> bu belge **alan şemalarını** (§2), durum sözleşmesini (§1) ve teknik özeti (§3) tutar. Çelişkide
> [`_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md) **Revizyon 4** (tek kullanıcı, 02.11.2026) kazanır.

## 1. Durum sözleşmesi

Her ekran şu durumları tasarlar:

| Durum | Ne gösterilir |
|---|---|
| Yükleniyor | İçeriğin şeklinde iskelet; 300 ms'den sonra görünür. |
| Boş | Ne olduğu, neden boş olduğu ve bir sonraki adım. Örnek: "Bugün henüz bildirim yok. Borsa açılınca burada görünür." |
| Hata | Ekran içinde düz bir cümle ve "Yeniden dene". Teknik ayrıntı katlanır, kişisel veri içermez. |
| Canlı | Akışın bağlı olduğunu gösteren küçük bir gösterge; kopunca "yeniden bağlanıyor". |
| Durdurulmuş | Durdurma açıkken yeni öneri ve emir yok; sebep ve yeniden başlatmanın durumu düz cümleyle yazılır. |
| Bulunamadı | Tasarlanmış 404 (`src/app/not-found.tsx`). |

Yükleme ve hata durumları ekranın ilk cümlesini değiştirmez; önce cümle, sonra durum açıklaması gelir.

## 2. Alan şemaları (zod, `src/lib/domain/`)

Kod alan adları İngilizcedir ve `05` şemalarıyla birebir aynıdır. Para TL `number` (gösterimde `Intl.NumberFormat('tr-TR')`);
tarih ISO 8601 UTC string, gösterimde `Europe/Istanbul`. Bilinmeyen alanlar zod tarafından atılır.

### 2.1 Oturum
`Me {id, display_name}`. Eski yanıtlardaki `role`, `roles`, `mfa_fresh`, `email` alanları **yoktur**; gelirse yok sayılır.

### 2.2 Bildirim
`Disclosure {disclosure_index:int, disclosure_oid, stock_codes:string[], related_stocks:string[], primary_ticker|null,
company_name, disclosure_class: ODA|FR|DG|DKB|DUY, disclosure_type, subject, summary, reason: NEW|UPD|CORR|CANC, related_index|null,
is_late, attachment_count, has_multilang, is_noise, subject_route: noise|E1|E2|E3|E4|llm|avoid:<kod>|archive_only,
subject_map_version, published_at, first_seen_at, available_at, ingest_source: live|backfill|reconcile|demo, is_fixture}` ·
`DisclosureText {lang: tr|en, body}`.

### 2.3 Ön eleme ve koruma (`05` §5.0)
`RouteResult {route, sub_type_hint|null, table_version}` · `PreGateResult {passed, reasons: string[]}` (R03/R04/R13 kodları) ·
`GuardResult {quarantined, injection_score 0–1, regex_hits[], chunks_scored, masked_names_n}` (≥ 0,90 karantina; 0,50–0,90 yumuşak).

### 2.4 Ajan çıktıları (`05`)
- **ClassifierOutput** `{status: ok|abstain, event_type: E1|E2|E3|E4|FILTER|IGNORE, sub_type, direction, is_correction_or_update,
  refers_to_prior_disclosure_date|null, injection_suspected, confidence, rationale_tr ≤400, quotes 1–3, abstain|null}`; eşik 0,80.
- **Reader** (`ReaderBase {status, confidence, injection_suspected, quotes 1–8, notes_tr, abstain}`, eşik 0,75) ve türe göre
  **BuybackExtraction** (E1), **InsiderTradeExtraction** (E2), **ContractExtraction** (E3), **FinancialReportExtraction** (E4).
- **MaterialityOutput** `{status, event_type, denominator_kind, denominator: ValueRef{name, value, ref_id}, market_cap: ValueRef,
  fx_rates: ValueRef[], data_gaps[], confidence (eşik 0,70), notes_tr, abstain}` — **oran içermez**.
- **EvidenceSelection** `{status, event_type, search_queries[], candidates_considered, selected: {ref_id, relevance, why_similar_tr}[],
  same_ticker_selected, exclusion_reasons[], proposed_strength, summary_tr, confidence, abstain}` → **EvidenceCard** (kodla)
  `{selection, stats: EventStats{ref_id, n, n_same_ticker, median_car_5d, mean_car_5d, hit_rate_5d, median_car_20d, mean_car_20d,
  hit_rate_20d, ci95_car_20d:[lo,hi], dispersion_iqr_20d}, strength: strong(n≥15)|moderate(8–14)|weak(5–7)|insufficient(<5), card_id}`.
  Kanıt istatistiklerini kod hesaplar; LLM hesaplamaz.
- **SkepticOutput** `{status, flags: {code, severity: info|reduce|veto, detail_tr, supporting_ref}[], size_multiplier: 1|0.75|0.5|0.25,
  veto, strongest_counterargument_tr, confidence (eşik 0,6), abstain}`. FlagCode: DUPLICATE_OR_CORRECTION, NOT_BINDING,
  RELATED_PARTY, RENEWAL_NOT_NEW, TOKEN_BUYBACK, NOT_OPEN_MARKET, FUND_NOT_INSIDER, DILUTION_OR_HYPE, MANIPULATION_MARKERS,
  AMOUNT_NOT_IN_TEXT, STALE_OR_WEAK_FINANCIALS, WEAK_EVIDENCE, INJECTION_SUSPECT, OTHER.
- **ComplianceReport** `{status, decision: pass|escalate|veto, checks: {code, result: pass|fail|escalate|unknown, basis_ref,
  detail_tr}[], regulation_refs[], summary_tr, confidence, abstain}`.

### 2.5 Birleştirme, kural motoru, risk kapısı (`05` §5.0, `06`)
- **MergedFeatures**: kimlikler, ajan durum ve güvenleri, `any_injection_flag`, `degraded`; olay türüne özgü alanlar; piyasa
  alanları (`last_price`, `upper_limit`, `lower_limit`, `adv20_try`, `free_float_pct`); kanıt alanları. Hepsi nullable.
- **RuleTraceEntry** `{rule: 'E3.materiality'|'E3.binding'|…, passed, observed|null, threshold|null, detail_tr}`.
- **RuleDecision** `{outcome: PROPOSE|NO_TRADE|HOLD, proposal|null, reason_codes[], rules_fired[], rules_hash, trace}`.
- **RiskCheck** `{phase: pre_trade|at_send, rule_code: R01…R16, outcome: pass|resize|reject|hold|approval_required, reason_code,
  detail_tr, observed|null, limit|null}`. Her kuralın Türkçe adı `RISK_RULES` sabitinden gelir (kuralların tek kaynağı `06` §10).

### 2.6 Öneri ve onay (`05`)
- **TradeProposal** `{proposal_id, run_id, strategy_version, rules_hash, prompt_manifest_hash, disclosure_index, ticker,
  venue:'BIST', side: buy|sell (sell yalnızca çıkış), event_type: E1–E4|EXIT, rule_ids[], entry: next_open_auction|intraday_limit,
  limit_price, ref_price, ref_price_at, requested_notional_try, requested_qty, stop_price, holding_days_min, holding_days_max,
  exit_rules[], expected_edge_bps, est_cost_bps, multipliers{evidence, skeptic, leakage, regime}, confidence, evidence_card_id,
  evidence_ids[], retrieved_ids[], escalate_required, degraded}`.
- **ApprovalCard** `{kind:'trade_approval', proposal_id, run_id, ticker, company_name, side, event_type, disclosure_index,
  disclosure_url, final_notional_try, requested_notional_try, limit_price, entry, holding_days:[min,max], level: normal|escalate,
  escalation_reasons: (COMPLIANCE_ESCALATE|DEGRADED|NEAR_MAX_POSITIONS|RESTRICTED_SELL|RESIZED)[], evidence_summary{n,
  median_car_5d, median_car_20d, strength, card_id}, skeptic_flags[], compliance_summary_tr, rule_trace_summary, degraded,
  prompt_manifest_hash, expires_at, status: pending|claimed|approved|rejected|expired|cancelled, is_fixture, decided_by|null}`.
  `decided_role` **yoktur**.
- **ApprovalDecision** `{decision: approve|reject, approved_notional_try|null (≤ final; küçültme = approve + daha küçük tutar),
  comment 1–500}`. Sunucu `decided_by` ve `decided_at` ekler.

### 2.7 Emir, dolum, pozisyon (`07` §9)
`Order {id, client_order_id, proposal_id, ticker, side, order_type: market|limit, tif: day|opg, qty, limit_price, status:
pending_open|accepted|awaiting_manual_entry|partially_filled|filled|canceled|rejected, created_at, broker: simbist|order_ticket}`
· `Fill {id, order_id, qty, price, commission, bsmv, slippage_bps, filled_at, source: simbist|alpaca|manual}`
· `Position {ticker, company_name, qty, avg_cost, last_price, opened_at, planned_exit_date, holding_days, source_proposal,
run_id, event_type, strategy_version, unrealized_pnl, realized_pnl, managed_by_exit_rule}`
· `OrderTicket` (emir fişi; `valid_until`, `side`, `limit_price` (satışta taban), `qty`, `mark`).
`PnlPoint {d, strategy, equity, daily_return, peak_equity, drawdown, n_positions, n_trades}`.
`RiskStatus` ve `reset`: API.md §3.2.

### 2.8 Denetim ve sınırlar
`AuditEntry` ve `ChainVerifyResult`: API.md §3.2. `canonical = [chain_pos, occurred_at, actor, action, entity_type, entity_id,
run_id, strategy_version, payload]`, `hash = sha256(prev_hash || canonical)`, genesis `00`.
`LimitVersion {version, status: proposed|active|superseded|rejected, reason, created_at, effective_from, values: {key, value}[],
proposed_by: Signature, decided_by: Signature|null}`. Başlangıç değerleri `06` §9 ve kanonik kararlardadır:
`risk_per_trade_pct 0.005`, `max_position_pct 0.10`, `max_concurrent_positions 10`, `target_concurrent_positions 8`,
`max_adv_share 0.01`, `price_band_pct 0.02`, `daily_loss_halt_pct -0.01`, `kill_drawdown_pct -0.05`, `min_edge_cost_ratio 2`,
`crisis_exposure_mult 0.5`, `leak_ret5d_threshold 0.08`, `max_sector_pct 0.25`, `max_group_pct 0.20`.

### 2.9 Run ve "Neden" yükü (`07 agent_runs`, `04` §11)
`RunSummary {run_id, disclosure_index, ticker, event_type|null, status: running|interrupted|completed|failed|hold_quota|skipped,
outcome: PROPOSE|NO_TRADE|HOLD|QUARANTINED|PREGATE_VETO|null, mode: paper|live|backtest|replay|demo, started_at, finished_at,
llm_calls, tokens_in, tokens_out, latency_ms, strategy_version, is_fixture}`.
`Explain` `{run, disclosure, texts, route, pre_gate, guard, classifier, reader, materiality, evidence_card, evidence_events,
merged, skeptic, rule_decision, compliance, risk_checks, proposal, approval, orders, fills, ticket, audit_positions[], trace}`;
düğüm çalışmadıysa her alan `null`. `RunTrace` düğüm listesini (`node`, `label_tr`, `status`, `latency_ms`, `tokens_*`,
`model_id`, `cached`, `parallel_group`) ve `langsmith_url|null` taşır.

### 2.10 Sabah özeti
`MorningBrief` API.md §5.3'te. Panelin ana sayfası için veri `GET /me/overview` (`MeOverview`) ile gelir.

### 2.11 Değerlendirme (`08`)
`EvalSummary {is_sample, label: 'örnek değer · gerçek sonuç değil', l1, l2, l3, l4, ablations, redteam, latency, cost}` alt
şemaları `08`'dedir. Sayılar yalnızca tablo doluysa gösterilir; boş tablo "henüz ölçülmedi" der.

## 3. Teknik özet

- Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript strict, Tailwind CSS 4 (`@theme`), zod 4, Radix tabanlı
  primitifler, Recharts, sonner, `@noble/hashes` (senkron sha256), Vitest + Testing Library, Playwright (`channel: 'msedge'`).
- `NEXT_PUBLIC_API_MODE=mock|http` (varsayılan mock). Mock durumu tarayıcıda, `localStorage` destekli.
- Fikstür üreticisi deterministiktir (sabit tohum). Mock saat **11.01.2027 Pazartesi 13:40** (İstanbul), gerçek zamanla ilerler.
- Vercel: Root Directory `kaptan-panel`, ortam değişkeni gerektirmez (mock modu).

## 4. Fikstür kimlikleri

Demo fikstür kimlikleri ve mock veri kuralları [PANEL-CONTRACT.md §4](./PANEL-CONTRACT.md) içindedir; tek liste oradadır.
