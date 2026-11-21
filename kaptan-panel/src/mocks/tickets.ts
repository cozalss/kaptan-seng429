import type { ApprovalCard, Explain, OrderTicket, StageId, TicketEntry } from "@/lib/domain";
import { fmtDec, fmtInt, fmtPct, fmtPrice } from "@/lib/format";
import { sha256Hex } from "@/lib/hash";
import { istanbulIso, ISTANBUL_OFFSET_H, istanbulMinutes, nextTradingDay } from "@/lib/time";

/**
 * The order to enter at the bank (12 §2) for any approved proposal, built from its card and
 * "Neden" payload. It carries the amount that was approved, measured against the person's own
 * book, and is valid for 30 minutes (R16, ticket_ttl): from 09:40 if issued before the opening
 * auction, never past the session close.
 */
export const TICKET_TTL_MS = 30 * 60_000;

export const EMPTY_ENTRY: TicketEntry = Object.freeze({
  status: "awaiting",
  filled_qty: null,
  avg_price: null,
  filled_at: null,
  note: null,
  marked_at: null,
  commission_try: 0,
  commission_estimated: false,
  late: false,
  commission_rate: null,
  commission_rate_own: false,
  corrected: false,
}) as TicketEntry;

const istDate = (iso: string) => new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3_600_000).toISOString().slice(0, 10);

/** Valid-until for a ticket created at `createdIso` (12 §2: 30 min; pre-open → from 09:40; session end caps it). */
export function ticketValidUntil(createdIso: string): string {
  const m = istanbulMinutes(createdIso);
  const day = istDate(createdIso);
  if (m < 9 * 60 + 40) return new Date(Date.parse(istanbulIso(day, "09:40")) + TICKET_TTL_MS).toISOString();
  if (m >= 18 * 60) return new Date(Date.parse(istanbulIso(nextTradingDay(day), "09:40")) + TICKET_TTL_MS).toISOString();
  const end = Date.parse(istanbulIso(day, "18:00"));
  return new Date(Math.min(Date.parse(createdIso) + TICKET_TTL_MS, end)).toISOString();
}

export function ticketNumber(createdIso: string, seq: number): string {
  const d = istDate(createdIso);
  return `T-${d.slice(0, 4)}-${d.slice(5, 7)}${d.slice(8, 10)}-${String(seq).padStart(3, "0")}`;
}

/** How many whole shares the approved amount buys at the order's price (a shrunk approval buys fewer). */
export function approvedQty(card: ApprovalCard): number {
  if (card.approved_notional_try === null) return Math.max(1, card.qty);
  return Math.max(1, Math.floor(card.approved_notional_try / card.limit_price));
}

export function buildTicket(card: ApprovalCard, e: Explain, opts: { seq: number; decidedAt: string; stage: StageId; accountEquity: number }): OrderTicket {
  const created = new Date(Date.parse(opts.decidedAt) + 20_000).toISOString();
  // A sell (an exit) sells the lots held, never more (no short selling).
  const qty = card.side === "sell" ? Math.max(1, card.qty) : approvedQty(card);
  const p = e.proposal;
  const gate = e.risk_checks.map((c) => ({ code: c.rule_code, passed: c.outcome === "pass" || c.outcome === "resize" || c.outcome === "approval_required" }));
  const edge = p ? p.expected_edge_bps / 100 / 100 : null;
  const cost = p ? p.est_cost_bps / 100 / 100 : null;
  const ratio = edge !== null && cost ? edge / cost : null;
  const ticket_no = ticketNumber(created, opts.seq);
  const hash = sha256Hex(`ticket:${ticket_no}:${card.proposal_id}`);
  return {
    ticket_no,
    order_id: `ord-fis-${card.run_id.replace(/^run-/, "")}`,
    proposal_id: card.proposal_id,
    run_id: card.run_id,
    rules_version: "rules-v1.0 / fwd",
    approved_at: opts.decidedAt,
    approval_deadline: card.expires_at,
    created_at: created,
    valid_until: ticketValidUntil(created),
    mode_keys: { config: false, env: false, ui: false },
    side: card.side,
    ticker: card.ticker,
    company_name: card.company_name,
    market: "Ana Pazar",
    order_type: "limit",
    session_tr: card.entry === "next_open_auction" ? "AÇILIŞTA (09:40–09:55) · GÜNLÜK" : "SÜREKLİ İŞLEM (10:00–18:00) · GÜNLÜK",
    qty,
    limit_price: card.limit_price,
    ref_price: p?.ref_price ?? card.limit_price,
    upper_limit: Math.round(card.limit_price * 1.1 * 100) / 100,
    est_notional_try: Math.round(qty * card.limit_price),
    account_equity_try: opts.accountEquity,
    event_line_tr: `${card.event_type} — ${card.sub_type_tr}`,
    kap_line_tr: `idx ${card.disclosure_index} · ${card.headline_tr}`,
    materiality_line_tr: card.rule_trace_summary.find((r) => r.passed)?.detail_tr ?? "Kural izi: Neden ekranında",
    leakage_line_tr: card.rule_trace_summary.find((r) => r.rule.startsWith("LEAK"))?.detail_tr ?? "Sızıntı kontrolü geçti ✓",
    evidence_line_tr: `Benzer ${fmtInt(card.evidence_summary.n)} olay · medyan 5 günlük anormal getiri ${fmtPct(card.evidence_summary.median_car_5d)} · isabet ${fmtPct(card.evidence_summary.hit_rate_5d, 0)}`,
    cost_line_tr: cost !== null ? `Gidiş-dönüş maliyet ${fmtPct(cost, 2)} (komisyon + yarı-spread + etki + manuel kayma)` : "Maliyet: Neden ekranında",
    edge_cost_line_tr: ratio !== null && edge !== null && cost !== null ? `Avantaj / maliyet = ${fmtPct(edge, 2)} / ${fmtPct(cost, 2)} = ${fmtDec(ratio, 1)}× (eşik 2,0)` : "Avantaj / maliyet: Neden ekranında",
    skeptic_line_tr: `“${card.skeptic_note_tr}”`,
    amount_check_line_tr: e.risk_checks.some((c) => c.rule_code === "R14" && c.outcome === "pass") ? "Okuyucu tutarı metindeki regex tutarıyla eşleşti (R14) ✓" : "Tutar kontrolü (R14): uygulanmadı",
    stop_line_tr: p ? `Kapanış bazlı stop ${fmtPrice(p.stop_price)} TL` : "Stop: Neden ekranında",
    planned_exit_tr: `${card.holding_days[0]}. borsa günü kapanışı (en çok ${card.holding_days[1]} borsa günü)`,
    gate_results: gate,
    approval_level: card.level,
    stage: opts.stage,
    audit_hash: hash,
    prev_hash: sha256Hex(`prev:${hash}`),
    entry: EMPTY_ENTRY,
    is_fixture: card.is_fixture,
  };
}

/** The entry as of `nowMs`: an unmarked ticket past its valid-until reads as expired (still markable). */
export function effectiveEntry(t: Pick<OrderTicket, "valid_until">, mark: TicketEntry | undefined, nowMs: number): TicketEntry {
  if (mark) return mark;
  return Date.parse(t.valid_until) <= nowMs ? { ...EMPTY_ENTRY, status: "expired" } : EMPTY_ENTRY;
}
