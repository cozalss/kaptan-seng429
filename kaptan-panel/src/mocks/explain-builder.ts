import type {
  ApprovalCard,
  ClassifierOutput,
  ComplianceReport,
  DisclosureListItem,
  EvidenceCard,
  EvidenceEvent,
  Explain,
  Fill,
  GuardResult,
  MaterialityOutput,
  MergedFeatures,
  Order,
  PreGateResult,
  RiskCheck,
  RuleDecision,
  RunSummary,
  SkepticOutput,
  TradeProposal,
} from "@/lib/domain";
import { strengthForN, RISK_GATE_ORDER, RISK_RULES } from "@/lib/domain";
import { fmtPct } from "@/lib/format";
import { approvalExpiry } from "@/lib/time";
import { sha256Hex } from "@/lib/hash";
import { issuer } from "./issuers";
import { createRng, round } from "./rng";
import type { RunSpec } from "./run-spec";
import { buildTrace } from "./trace-builder";

export const PAPER_EQUITY_TRY = 1_016_480; // örnek değer
export const RULES_HASH = sha256Hex("rules-v1.0-prereg").slice(0, 16);
export const PROMPT_MANIFEST_HASH = sha256Hex("manifest:v1.1-fwd").slice(0, 16);
const MODEL_FLASH_LITE = "gemini-flash-lite-001";
const MODEL_GPT_OSS = "groq/gpt-oss-120b";

const plusMs = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();

export function kapUrl(index: number): string {
  return `https://www.kap.org.tr/tr/Bildirim/${index}`;
}

export function disclosureOf(spec: RunSpec): DisclosureListItem {
  const iss = issuer(spec.ticker);
  return {
    disclosure_index: spec.disclosure_index,
    disclosure_oid: sha256Hex(`oid:${spec.disclosure_index}`).slice(0, 32),
    stock_codes: [spec.ticker],
    related_stocks: [],
    primary_ticker: spec.ticker,
    company_name: iss.name,
    disclosure_class: spec.event === "E4" ? "FR" : "ODA",
    disclosure_type: spec.event === "E4" ? "Finansal Rapor" : "Özel Durum Açıklaması",
    subject: spec.subject,
    summary: spec.headline_tr,
    reason: "NEW",
    related_index: null,
    is_late: false,
    attachment_count: spec.event === "E4" ? 2 : 0,
    has_multilang: spec.text_en !== null,
    is_noise: false,
    subject_route: spec.route,
    subject_map_version: "subject_map.v1",
    published_at: spec.publishedAtIso,
    first_seen_at: plusMs(spec.publishedAtIso, 21_000),
    available_at: plusMs(spec.publishedAtIso, 21_000),
    ingest_source: spec.is_fixture ? "demo" : "live",
    classification: spec.classifiedAs
      ? { event_type: spec.classifiedAs, confidence: spec.classifierConfidence, method: spec.method }
      : null,
    run_id: spec.run_id,
    linked_news_count: spec.kind === "propose" ? 2 : 0,
    note_count: 0,
  };
}

/** First sentence of the disclosure body (after the title block): a verbatim, meaningful quote. */
export function firstSentence(text: string): string {
  const body = text.split("\n\n")[1] ?? text;
  const line = body.split("\n")[0] ?? body;
  const end = line.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? line.slice(0, end + 1) : line;
  return sentence.length > 160 ? sentence.slice(0, sentence.lastIndexOf(" ", 160)) : sentence;
}

/** Character ranges of verbatim phrases in the TR text; phrases not found are dropped. */
export function spansOf(text: string, phrases: ReadonlyArray<{ field: string; quote: string }>): Explain["source_spans"] {
  return phrases.flatMap((p) => {
    const at = text.indexOf(p.quote);
    return at < 0 ? [] : [{ start: at, end: at + p.quote.length, field: p.field }];
  });
}

function classifierOf(spec: RunSpec): ClassifierOutput | null {
  if (!spec.classifiedAs || spec.kind === "pregate_veto" || spec.kind === "quarantine") return null;
  return {
    status: spec.classifierConfidence >= 0.8 ? "ok" : "abstain",
    event_type: spec.classifiedAs,
    sub_type: spec.sub_type,
    direction: spec.classifiedAs === "IGNORE" ? "neutral" : "positive",
    is_correction_or_update: false,
    refers_to_prior_disclosure_date: null,
    injection_suspected: false,
    confidence: spec.classifierConfidence,
    rationale_tr:
      spec.method === "subject_map"
        ? `KAP konu alanı (“${spec.subject}”) olayı doğrudan tipliyor; metin bunu doğruluyor.`
        : `Konu alanı genel; metin ${spec.sub_type_tr.toLocaleLowerCase("tr-TR")} anlatıyor.`,
    quotes: spec.classifierQuotes?.length ? spec.classifierQuotes.map((q) => ({ ...q })) : [{ field: "event_type", quote: firstSentence(spec.text_tr) }],
    abstain:
      spec.classifierConfidence >= 0.8 ? null : { reason: "ambiguous", detail_tr: "Metin iki farklı olay türüne de uyuyor." },
  };
}

function materialityOf(spec: RunSpec): MaterialityOutput | null {
  if (!spec.event || !spec.merge || spec.kind === "pregate_veto" || spec.kind === "quarantine") return null;
  const iss = issuer(spec.ticker);
  const mcap = round(iss.price * 120_000_000, 0);
  return {
    status: "ok",
    event_type: spec.event,
    denominator_kind: spec.merge.denominatorName === "market_cap" ? "market_cap" : "annual_revenue",
    denominator: spec.merge.denominator
      ? { name: spec.merge.denominatorName ?? "annual_revenue", value: spec.merge.denominator, ref_id: `fin:${spec.ticker}:2026-Q3` }
      : null,
    revenue_available_at_as_of: true,
    market_cap: { name: "market_cap", value: mcap, ref_id: `px:${spec.ticker}:mcap` },
    fx_rates: [],
    trade_day_close: { name: "close_prev", value: iss.price, ref_id: `px:${spec.ticker}:close` },
    secondary: [],
    e4_lines: [],
    financials_period_end: "2026-09-30",
    financials_stale_days: 103,
    data_gaps: [],
    confidence: 0.88,
    notes_tr: "Sayılar SQL aracıyla point-in-time tablolarından getirildi; oran hesaplanmadı.",
    abstain: null,
  };
}

/**
 * Exactly `up` of the returns end above zero: when the noisy draw has too many risers, the
 * smallest rises are turned into equally small falls (and the other way round). Pure; this is
 * what keeps "Benzer 12 olayın 7’sinde" true to the strip under it.
 */
export function withRisers(returns: readonly number[], up: number): number[] {
  const order = returns.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const risers = new Set(order.slice(0, up).map((x) => x.i));
  return returns.map((v, i) => {
    const size = Math.max(Math.abs(v), 0.001);
    return risers.has(i) ? size : -size;
  });
}

function evidenceOf(spec: RunSpec): { card: EvidenceCard | null; events: EvidenceEvent[] } {
  if (!spec.evidence || !spec.event) return { card: null, events: [] };
  const ev = spec.evidence;
  const rng = createRng(spec.disclosure_index);
  const ids = Array.from({ length: ev.n }, (_, i) => `evt:${spec.event}-${2019 + (i % 7)}-${String(100 + i * 7).padStart(4, "0")}`);
  const pool = ["ORNCM", "DMOEN", "KRGCL", "MSLCM", "TMSMK", "FRZEN", "DMOKM", "MSLEL"];
  // Every selected event is on the strip, and the share that rose is the card's hit rate.
  const drawn = ids.map((ref_id, i) => {
    const t = pool[i % pool.length] ?? "ORNCM";
    const car5 = round(ev.mean5 + rng.normal(0, 0.028), 4);
    return { ref_id, t, i, car5, car1Noise: rng.normal(0, 0.006), car20: round(ev.mean20 + rng.normal(0, 0.05), 4), car60: round(ev.mean20 * 1.4 + rng.normal(0, 0.08), 4) };
  });
  const risers = Math.round(ev.hit5 * ev.n);
  const car5s = withRisers(drawn.map((d) => d.car5), risers);
  const events: EvidenceEvent[] = drawn.map((d, k) => {
    const car5 = round(car5s[k] ?? d.car5, 4);
    return {
      ref_id: d.ref_id,
      ticker: d.t,
      company_name: issuer(d.t).name,
      published_at: new Date(Date.UTC(2019 + (d.i % 7), (d.i * 5) % 12, 3 + (d.i % 25), 12)).toISOString(),
      title: `${issuer(d.t).name} — ${spec.sub_type_tr} (geçmiş olay)`,
      car_1d: round(car5 * 0.4 + d.car1Noise, 4),
      car_5d: car5,
      car_20d: d.car20,
      car_60d: d.i % 4 === 0 ? null : d.car60,
    };
  });
  const strength = strengthForN(ev.n);
  const card: EvidenceCard = {
    selection: {
      status: "ok",
      event_type: spec.event,
      search_queries: [`${spec.sub_type_tr} bağlayıcı`, `${spec.event} ${issuer(spec.ticker).sector}`],
      candidates_considered: ev.n + 17,
      selected: ids.map((ref_id, i) => ({
        ref_id,
        relevance: i < Math.ceil(ev.n / 2) ? "high" : "medium",
        why_similar_tr: "Aynı olay türü, benzer büyüklük ve sektör; karar anından önce yayımlanmış.",
      })),
      same_ticker_selected: ev.nSameTicker,
      exclusion_reasons: ["Karar anından sonra yayımlananlar filtrelendi", "Aynı şirketin düzeltme bildirimleri çıkarıldı"],
      already_announced_before: false,
      already_announced_ref: null,
      proposed_strength: strength,
      summary_tr: `Benzer ${ev.n} olay seçildi; getiriler bu seçim sırasında görülmedi.`,
      confidence: 0.84,
      abstain: null,
    },
    stats: {
      ref_id: `stats:${spec.run_id}`,
      n: ev.n,
      n_same_ticker: ev.nSameTicker,
      median_car_5d: ev.median5,
      mean_car_5d: ev.mean5,
      hit_rate_5d: round(risers / ev.n, 2),
      median_car_20d: ev.median20,
      mean_car_20d: ev.mean20,
      hit_rate_20d: ev.hit20,
      ci95_car_20d: ev.ci20,
      dispersion_iqr_20d: round(Math.abs(ev.ci20[1] - ev.ci20[0]) * 1.6, 4),
    },
    strength,
    retrieved_ids: [...ids, "evt:retrieved-not-selected-0001", "evt:retrieved-not-selected-0002"],
    card_id: spec.run_id.startsWith("run-demo-e3") ? "card-demo-e3-ornek" : `card-${spec.run_id}`,
  };
  return { card, events };
}

function skepticOf(spec: RunSpec): SkepticOutput | null {
  if (!spec.skeptic) return null;
  return {
    status: "ok",
    flags: spec.skeptic.flags.map((f) => ({ ...f, supporting_ref: null })),
    size_multiplier: spec.skeptic.multiplier,
    veto: spec.skeptic.veto ?? false,
    strongest_counterargument_tr: spec.skeptic.counter_tr,
    confidence: 0.77,
    abstain: null,
  };
}

/** What Uyum wants a person to look at, in one plain sentence per kind of event. */
const ESCALATE_REASON: Readonly<Record<string, string>> = {
  E1: "Geri alımı yapan aracı kurumun adı metinde yok; kaydın doğruluğuna bir insan baksın.",
  E2: "Alımı yapan yöneticinin adı metinde gizlenmiş; kim olduğunu bir insan doğrulasın.",
  E3: "Sözleşmenin karşı tarafı metinde adıyla geçmiyor; ilişkili taraf olup olmadığına bir insan baksın.",
  E4: "Kârın bir kısmı tek seferlik arsa satışından geliyor; yönetimin “kalıcı iyileşme” dili buna tam uymuyor.",
};

function complianceOf(spec: RunSpec): ComplianceReport | null {
  if (!spec.compliance) return null;
  const injection = spec.kind === "quarantine";
  const r = (ok: boolean): "pass" | "fail" => (ok ? "pass" : "fail");
  return {
    status: "ok",
    decision: spec.compliance,
    checks: [
      { code: "SPK_MEASURE", result: "pass", basis_ref: "rag:spk-tedbir-listesi", detail_tr: "Hissede SPK tedbiri yok." },
      { code: "VBTS_MEASURE", result: "pass", basis_ref: "rag:vbts", detail_tr: "VBTS tedbiri yok." },
      { code: "WATCHLIST_MARKET", result: "pass", basis_ref: "rag:pazar", detail_tr: "Hisse Yakın İzleme Pazarı'nda değil." },
      { code: "INFO_PUBLIC", result: "pass", basis_ref: "kap", detail_tr: "Bilgi KAP'ta kamuya açıklanmış." },
      {
        code: "PROMPT_INJECTION",
        result: r(!injection),
        basis_ref: injection ? "guard:prompt-guard" : null,
        detail_tr: injection ? "Bildirim metninde talimat içeriği var." : "Talimat kalıbı bulunmadı.",
      },
      {
        code: "RATIONALE_INTEGRITY",
        result: injection ? "fail" : spec.compliance === "escalate" ? "escalate" : "pass",
        basis_ref: null,
        detail_tr: injection
          ? "Gerekçe dış talimata dayanıyor."
          : spec.compliance === "escalate"
            ? (ESCALATE_REASON[spec.event ?? ""] ?? "Gerekçenin bir kısmı belirsiz; bir insan baksın.")
            : "Gerekçe alıntılarla destekleniyor.",
      },
      { code: "MARKET_ABUSE_RISK", result: "pass", basis_ref: "rag:spkn-106-107", detail_tr: "Piyasa bozucu eylem işareti yok." },
    ],
    regulation_refs: ["SPK II-15.1", "SPKn md. 106–107"],
    summary_tr: injection
      ? "RET: bildirim metninde modele yönelik talimat içeriği var."
      : spec.compliance === "escalate"
        ? "Tedbir yok; bir kontrol insan incelemesi istiyor."
        : "Tedbir yok, injection yok; uyum açısından engel yok.",
    confidence: 0.9,
    abstain: null,
  };
}

export function ruleDecisionOf(spec: RunSpec): RuleDecision | null {
  if (spec.kind === "pregate_veto" || spec.kind === "quarantine" || spec.kind === "archived") return null;
  const outcome = spec.kind === "propose" ? "PROPOSE" : spec.kind === "hold" ? "HOLD" : "NO_TRADE";
  return {
    outcome,
    reason_codes: spec.reasonCodes,
    rules_fired: spec.ruleTrace.filter((t) => t.passed).map((t) => t.rule),
    rules_hash: RULES_HASH,
    trace: spec.ruleTrace,
  };
}

function riskChecksOf(spec: RunSpec, proposalNotional: number): RiskCheck[] {
  if (spec.kind !== "propose") return [];
  const iss = issuer(spec.ticker);
  const pos = proposalNotional / PAPER_EQUITY_TRY;
  const adv = proposalNotional / iss.adv20Try;
  const defaults: Partial<Record<RiskCheck["rule_code"], { detail_tr: string; observed?: string; limit?: string }>> = {
    // Desk state on the demo day (mocks/pnl.ts liveEquity): −%1,1 from peak, +%0,2 today.
    R01: { detail_tr: "Kill switch kapalı; zirveden düşüş −%1,1.", observed: "−%1,1", limit: "−%5" },
    R02: { detail_tr: "Günlük K/Z +%0,2.", observed: "+%0,2", limit: "−%1" },
    R07: {
      detail_tr: `İşlem riski %0,5; pozisyon ${fmtPct(pos, 1)}; hacmin ${fmtPct(adv, 1)}'i.`,
      observed: fmtPct(pos, 1),
      limit: "%10",
    },
    R09: { detail_tr: "Limit fiyat son fiyatın ±%2 bandında; tavana uzak.", observed: "+%2,0", limit: "±%2" },
  };
  const checks: RiskCheck[] = RISK_GATE_ORDER.map((code) => {
    const o = spec.riskOverrides?.[code];
    const d = defaults[code];
    return {
      phase: "pre_trade",
      rule_code: code,
      outcome: o?.outcome ?? (code === "R15" ? "approval_required" : "pass"),
      reason_code: code === "R15" ? "APPROVAL_REQUIRED" : o && o.outcome !== "pass" ? `${code}_${o.outcome.toUpperCase()}` : null,
      detail_tr: o?.detail_tr ?? d?.detail_tr ?? RISK_RULES[code].summary_tr,
      observed: o?.observed ?? d?.observed ?? null,
      limit: o?.limit ?? d?.limit ?? null,
    };
  });
  if (spec.decision?.status === "approved") {
    checks.push({
      phase: "at_send",
      rule_code: "R16",
      outcome: "pass",
      reason_code: null,
      detail_tr: "Gönderim anında R01–R04, R09, R12, R13 yeniden geçti; onay süresi dolmamış.",
      observed: null,
      limit: null,
    });
  }
  return checks;
}

function proposalOf(spec: RunSpec, card: EvidenceCard | null): TradeProposal | null {
  const p = spec.proposal;
  if (!p || !spec.event) return null;
  // A sell (exit) limits 2% below the reference price; a buy 2% above it.
  const limit = round(p.refPrice * (spec.side === "sell" ? 0.98 : 1.02), 2);
  return {
    proposal_id: spec.run_id.replace(/^run-/, "prop-"),
    run_id: spec.run_id,
    strategy_version: spec.strategy_version,
    rules_hash: RULES_HASH,
    prompt_manifest_hash: PROMPT_MANIFEST_HASH,
    disclosure_index: spec.disclosure_index,
    ticker: spec.ticker,
    venue: "BIST",
    side: spec.side ?? "buy",
    event_type: spec.event,
    rule_ids: spec.ruleTrace.filter((t) => t.passed).map((t) => t.rule),
    entry: p.entry,
    limit_price: limit,
    ref_price: p.refPrice,
    ref_price_at: spec.publishedAtIso,
    requested_notional_try: p.requestedNotional,
    requested_qty: p.qty,
    stop_price: round(p.refPrice * (1 - p.stopPct), 2),
    holding_days_min: p.holding[0],
    holding_days_max: p.holding[1],
    exit_rules: ["X1 zaman çıkışı", "X2 kapanış bazlı ATR stop", "X6 stop yalnızca yukarı"],
    expected_edge_bps: p.edgeBps,
    est_cost_bps: p.costBps,
    multipliers: { evidence: 1, skeptic: spec.skeptic?.multiplier ?? 1, leakage: 1, regime: 1 },
    confidence: spec.classifierConfidence,
    evidence_card_id: card?.card_id ?? null,
    evidence_ids: card?.selection.selected.map((x) => x.ref_id) ?? [],
    retrieved_ids: card?.retrieved_ids ?? [],
    escalate_required: (p.escalate?.length ?? 0) > 0,
    degraded: false,
  };
}

function approvalOf(spec: RunSpec, proposal: TradeProposal, card: EvidenceCard | null): ApprovalCard {
  const d = spec.decision;
  const created = plusMs(spec.publishedAtIso, 48_000);
  const finalNotional = round(proposal.limit_price * proposal.requested_qty, 0);
  return {
    kind: "trade_approval",
    proposal_id: proposal.proposal_id,
    run_id: spec.run_id,
    ticker: spec.ticker,
    company_name: issuer(spec.ticker).name,
    side: spec.side ?? "buy",
    event_type: proposal.event_type,
    sub_type_tr: spec.sub_type_tr,
    headline_tr: spec.headline_tr,
    disclosure_index: spec.disclosure_index,
    disclosure_url: kapUrl(spec.disclosure_index),
    final_notional_try: finalNotional,
    requested_notional_try: proposal.requested_notional_try,
    limit_price: proposal.limit_price,
    qty: proposal.requested_qty,
    entry: proposal.entry,
    holding_days: [proposal.holding_days_min, proposal.holding_days_max],
    level: proposal.escalate_required ? "escalate" : "normal",
    escalation_reasons: spec.proposal?.escalate ?? [],
    evidence_summary: {
      n: card?.stats.n ?? 0,
      median_car_5d: card?.stats.median_car_5d ?? 0,
      median_car_20d: card?.stats.median_car_20d ?? 0,
      hit_rate_5d: card?.stats.hit_rate_5d ?? 0,
      strength: card?.strength ?? "insufficient",
      card_id: card?.card_id ?? "",
    },
    skeptic_flags: spec.skeptic?.flags ?? [],
    skeptic_note_tr: spec.skeptic?.counter_tr ?? "Şüpheci ek bir risk bulmadı.",
    size_multiplier: spec.skeptic?.multiplier ?? 1,
    compliance_summary_tr: spec.compliance === "escalate" ? "Tedbir yok; bir kontrol insan incelemesi istiyor." : "Tedbir yok, injection yok.",
    rule_trace_summary: spec.ruleTrace,
    degraded: false,
    prompt_manifest_hash: PROMPT_MANIFEST_HASH,
    created_at: created,
    expires_at: approvalExpiry(created),
    status: d?.status ?? "pending",
    decided_by: d?.by ?? null,
    decided_role: d?.by ? "risk_officer" : null,
    decided_at: d?.atIso ?? null,
    decision_comment: d?.comment ?? null,
    approved_notional_try: d?.approvedNotional ?? null,
    is_fixture: spec.is_fixture,
  };
}

function ordersOf(spec: RunSpec, proposal: TradeProposal): { orders: Order[]; fills: Fill[] } {
  const d = spec.decision;
  if (d?.status !== "approved" || !d.atIso || (!d.fill && !d.unfilledAtLimitUp)) return { orders: [], fills: [] };
  const id = spec.run_id.replace(/^run-/, "ord-");
  const qty = proposal.requested_qty;
  const fills: Fill[] = [];
  if (d.fill && !d.unfilledAtLimitUp) {
    const filledQty = Math.min(qty, d.fill.qty ?? qty);
    const commission = round(filledQty * d.fill.price * 0.0005, 2);
    fills.push({
      id: id.replace(/^ord-/, "fill-"),
      order_id: id,
      qty: filledQty,
      price: d.fill.price,
      commission,
      bsmv: round(commission * 0.05, 2),
      slippage_bps: d.fill.slippageBps,
      filled_at: d.fill.atIso,
      source: "simbist",
    });
  }
  const filled = fills.reduce((a, f) => a + f.qty, 0);
  const order: Order = {
    id,
    client_order_id: `kaptan-${sha256Hex(id).slice(0, 12)}`,
    proposal_id: proposal.proposal_id,
    run_id: spec.run_id,
    ticker: spec.ticker,
    company_name: issuer(spec.ticker).name,
    side: spec.side ?? "buy",
    order_type: "limit",
    tif: proposal.entry === "next_open_auction" ? "opg" : "day",
    qty,
    limit_price: proposal.limit_price,
    // Tavanda açıldı, dolmadı → the OPG order lapses (canceled, no fill); a short fill stays partial.
    status: filled === 0 ? "canceled" : filled < qty ? "partially_filled" : "filled",
    cancel_reason: filled === 0 ? "limit_up_open" : null,
    broker: "simbist",
    created_at: d.atIso,
    fills,
    is_fixture: spec.is_fixture,
  };
  return { orders: [order], fills };
}

function mergedOf(spec: RunSpec, card: EvidenceCard | null): MergedFeatures | null {
  if (!spec.merge || !spec.event) return null;
  const iss = issuer(spec.ticker);
  const m = spec.merge;
  return {
    run_id: spec.run_id,
    disclosure_index: spec.disclosure_index,
    ticker: spec.ticker,
    as_of: spec.publishedAtIso,
    event_type: spec.event,
    sub_type: spec.sub_type,
    agent_status: { classifier: "ok", reader: "ok", materiality: "ok", evidence: card ? "ok" : "skipped" },
    agent_confidence: { classifier: spec.classifierConfidence, reader: 0.9, materiality: 0.88, evidence: 0.84 },
    any_injection_flag: false,
    degraded: false,
    e1_nature: spec.event === "E1" ? "execution" : null,
    new_buyback_rows: spec.event === "E1" ? 3 : null,
    buyback_10d_capital_pct: spec.event === "E1" ? (m.ratio ?? null) : null,
    buyback_10d_notice_count: spec.event === "E1" ? 4 : null,
    buyback_sale_within_20d: spec.event === "E1" ? false : null,
    insider_role_class: spec.event === "E2" ? "board_member" : null,
    insider_open_market: spec.event === "E2" ? true : null,
    insider_net_buy_value_try: spec.event === "E2" ? (m.amountTry ?? null) : null,
    insider_buy_to_ff_mcap: spec.event === "E2" ? (m.ratio ?? null) : null,
    insider_cluster_30d: spec.event === "E2" ? 2 : null,
    ret_3m: spec.event === "E2" ? -0.084 : null,
    reader_amount: m.amountTry ?? null,
    regex_amounts: m.amountTry ? [m.amountTry, round(m.amountTry / 12, 0)] : [],
    amount_in_text: m.amountInText ?? null,
    binding: spec.event === "E3" ? spec.kind === "propose" : null,
    related_party: spec.event === "E3" ? false : null,
    renewal: spec.event === "E3" ? false : null,
    amount_try: m.amountTry ?? null,
    amount_to_revenue_annualized: spec.event === "E3" && m.denominatorName !== "market_cap" ? (m.ratio ?? null) : null,
    amount_to_mcap: spec.event === "E3" && m.denominatorName === "market_cap" ? (m.ratio ?? null) : null,
    e3_denominator: spec.event === "E3" ? (m.denominatorName === "market_cap" ? "market_cap" : "annual_revenue") : null,
    e4: spec.event === "E4" ? { e4_sue: m.ratio ?? null, e4_cfo_quality: "iyi", e4_tms29: true } : {},
    last_price: iss.price,
    price_at: spec.publishedAtIso,
    upper_limit: round(iss.price * 1.1, 2),
    lower_limit: round(iss.price * 0.9, 2),
    adv20_try: iss.adv20Try,
    free_float_pct: iss.freeFloat,
    leakage_5d_mkt_adj: spec.leakage5d,
    ret_10d_mkt_adj: round(spec.leakage5d * 1.3, 4),
    evidence_card_id: card?.card_id ?? null,
    evidence_strength: card?.strength ?? null,
    evidence_n: card?.stats.n ?? null,
    evidence_median_car_5d: card?.stats.median_car_5d ?? null,
    evidence_median_car_20d: card?.stats.median_car_20d ?? null,
    evidence_ids: card?.selection.selected.map((s) => s.ref_id) ?? [],
    retrieved_ids: card?.retrieved_ids ?? [],
    flags: spec.skeptic?.flags.map((f) => f.code) ?? [],
  };
}

function guardOf(spec: RunSpec): GuardResult | null {
  if (spec.kind === "pregate_veto") return null;
  return {
    quarantined: spec.guardScore >= 0.9,
    injection_score: spec.guardScore,
    regex_hits: spec.regexHits ?? [],
    chunks_scored: 3,
    masked_names_n: spec.event === "E2" ? 1 : 0,
  };
}

function preGateOf(spec: RunSpec): PreGateResult {
  return { passed: spec.kind !== "pregate_veto", reasons: spec.preGateReasons ?? ["R03 evren ✓", "R04 tedbir yok ✓", "R13 engel listesi dışı ✓"] };
}

export function runSummaryOf(spec: RunSpec): RunSummary {
  const latency = spec.kind === "pregate_veto" ? 140 : spec.kind === "quarantine" ? 2_300 : 18_000 + (spec.disclosure_index % 40) * 900;
  const finishedAt = spec.status === "running" ? null : plusMs(spec.publishedAtIso, 21_000 + latency);
  return {
    run_id: spec.run_id,
    disclosure_index: spec.disclosure_index,
    ticker: spec.ticker,
    company_name: issuer(spec.ticker).name,
    event_type: spec.classifiedAs,
    status: spec.status,
    outcome: spec.outcome,
    mode: spec.is_fixture ? "demo" : "paper",
    started_at: plusMs(spec.publishedAtIso, 21_000),
    finished_at: finishedAt,
    llm_calls: spec.llmCalls,
    tokens_in: spec.tokens[0],
    tokens_out: spec.tokens[1],
    latency_ms: latency,
    strategy_version: spec.strategy_version,
    is_fixture: spec.is_fixture,
  };
}

/** Build the full "Neden bu işlem?" payload for a spec (deterministic). */
export function buildExplain(spec: RunSpec): Explain {
  const { card, events } = evidenceOf(spec);
  const proposal = spec.kind === "propose" ? proposalOf(spec, card) : null;
  const approval = proposal ? approvalOf(spec, proposal, card) : null;
  const { orders, fills } = proposal ? ordersOf(spec, proposal) : { orders: [], fills: [] };
  const finalNotional = approval?.final_notional_try ?? 0;
  return {
    run: runSummaryOf(spec),
    disclosure: disclosureOf(spec),
    texts: [
      { lang: "tr", body: spec.text_tr },
      ...(spec.text_en ? [{ lang: "en" as const, body: spec.text_en }] : []),
    ],
    source_spans: spansOf(spec.text_tr, spec.sourceSpans ?? []),
    route: { route: String(spec.route), sub_type_hint: spec.sub_type, table_version: "subject_map.v1" },
    pre_gate: preGateOf(spec),
    guard: guardOf(spec),
    classifier: classifierOf(spec),
    reader: spec.kind === "propose" || spec.kind === "no_trade" || spec.kind === "hold" ? spec.reader : null,
    materiality: materialityOf(spec),
    evidence_card: card,
    evidence_events: events,
    merged: mergedOf(spec, card),
    skeptic: skepticOf(spec),
    rule_decision: ruleDecisionOf(spec),
    compliance: complianceOf(spec),
    risk_checks: riskChecksOf(spec, finalNotional),
    proposal,
    approval,
    orders,
    fills,
    ticket: null,
    audit_positions: [],
    trace: buildTrace(spec, { modelLite: MODEL_FLASH_LITE, modelOss: MODEL_GPT_OSS }),
  };
}
