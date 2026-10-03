import type { ReaderOutput, RuleTraceEntry } from "@/lib/domain";

/** Small factories for Reader outputs and rule-trace rows used by the run fixtures. */
const base = (quote: string, confidence = 0.9) => ({
  status: "ok" as const,
  confidence,
  injection_suspected: false,
  quotes: [{ field: "amount", quote }],
  notes_tr: "Alanlar bildirim metninden çıkarıldı; kişi adları maskelendi.",
  abstain: null,
});

export function e1Reader(quote: string, cumulativePct: number, nominal: number): ReaderOutput {
  return {
    ...base(quote),
    kind: "E1",
    nature: "execution",
    in_programme: true,
    board_decision_date: "2026-09-24",
    programme_max_nominal_tl: 12_000_000,
    transactions: [
      { trade_date: "2027-01-06", nominal_tl: nominal * 0.3, capital_pct: cumulativePct * 0.3, price_tl: 33.1, price_raw: "33,10 TL", prior_nominal_in_program_tl: nominal * 0.4 },
      { trade_date: "2027-01-07", nominal_tl: nominal * 0.3, capital_pct: cumulativePct * 0.3, price_tl: 33.4, price_raw: "33,40 TL", prior_nominal_in_program_tl: nominal * 0.7 },
      { trade_date: "2027-01-08", nominal_tl: nominal * 0.4, capital_pct: cumulativePct * 0.4, price_tl: 33.5, price_raw: "33,50 TL", prior_nominal_in_program_tl: nominal },
    ],
    cumulative_nominal_tl: nominal,
    cumulative_capital_pct: cumulativePct,
    venue: "BIST",
  };
}

export function e2Reader(quote: string, valueTl: number, role: "board_member" | "investment_fund" = "board_member"): ReaderOutput {
  return {
    ...base(quote),
    kind: "E2",
    filer_kind: role === "investment_fund" ? "entity" : "person",
    person_or_entity: role === "investment_fund" ? "KURUM_1" : "KİŞİ_1",
    role,
    legal_basis: "SPK II-15.1 md. 12",
    direction: "buy",
    trades: [{ trade_date: "2027-01-08", qty: Math.round(valueTl / 100), price_tl: 100, value_tl: valueTl }],
    holding_before_pct: role === "investment_fund" ? 4.92 : 0.8,
    holding_after_pct: role === "investment_fund" ? 5.07 : 0.86,
    open_market: role !== "investment_fund",
    non_market_reason: null,
  };
}

export function e3Reader(opts: {
  quote: string;
  amount: number;
  amountRaw: string;
  months: number | null;
  binding: "signed_contract" | "mou_or_loi" | "tender_award_final";
  publicSector: boolean;
  subject: string;
  /** Share of revenue the issuer itself states (%), cross-checked by Merge; null when silent. */
  statedSharePct?: number;
}): ReaderOutput {
  return {
    ...base(opts.quote, 0.92),
    kind: "E3",
    counterparty_role: "customer",
    counterparty_name: null,
    counterparty_disclosed: false,
    counterparty_domestic: true,
    counterparty_public_sector: opts.publicSector,
    subject_tr: opts.subject,
    amount: opts.amount,
    currency: "TRY",
    amount_raw: opts.amountRaw,
    amount_try_stated: opts.amount,
    vat: "excluded",
    amount_is_estimate: false,
    duration_months: opts.months,
    start_date: "2027-02-01",
    binding_status: opts.binding,
    related_party: false,
    is_renewal_or_extension: false,
    stated_share_of_revenue_pct: opts.statedSharePct ?? null,
    stated_effect: null,
  };
}

export function e4Reader(quote: string, tone: "positive" | "mixed" = "positive"): ReaderOutput {
  return {
    ...base(quote, 0.86),
    kind: "E4",
    period: "2026-FY",
    report_kind: "Konsolide finansal tablolar (bağımsız denetimden geçmiş)",
    consolidated: true,
    tms29_applied: true,
    audit_opinion: "Olumlu görüş",
    going_concern_emphasis: false,
    guidance_direction: tone === "positive" ? "up" : "flat",
    guidance_statements_tr: ["2027 için hacim artışı bekleniyor (yönetim beyanı)."],
    one_off_items: ["Arsa satış kârı"],
    management_tone: tone,
    risk_mentions_tr: ["Kur riski", "Talep yavaşlaması"],
  };
}

export function trace(rule: string, passed: boolean, observed: string | null, threshold: string | null, detail_tr: string): RuleTraceEntry {
  return { rule, passed, observed, threshold, detail_tr };
}

/** Rows every proposal shares: leakage, edge/cost, evidence count. */
export function commonTrace(leak: string, leakOk: boolean, edge: string, edgeOk: boolean, n: number): RuleTraceEntry[] {
  return [
    trace("LEAK.ret5d", leakOk, leak, "< %8", leakOk ? "Son 5 seansta önceden fiyatlanma eşiği aşılmadı." : "Son 5 seansta %8'i aşan yükseliş: atla."),
    trace("EDGE.edge_cost", edgeOk, edge, "≥ 2,0×", edgeOk ? "Beklenen avantaj maliyetin en az iki katı." : "Avantaj maliyeti karşılamıyor."),
    trace("EVIDENCE.n_min", n >= 5, String(n), "≥ 5", n >= 5 ? "Yeterli sayıda benzer olay var." : "Benzer olay sayısı yetersiz."),
  ];
}
