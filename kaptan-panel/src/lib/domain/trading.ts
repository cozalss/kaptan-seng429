import { z } from "zod";
import { Confidence, EventCode, IsoDate, IsoDateTime, Ticker } from "./common";
import { EvidenceStrength, FlagCode } from "./agents";
import { RuleTraceEntry } from "./rules";
import { StageId } from "./personal";
import { Role, Signature } from "./user";

/* ── TradeProposal (05) ───────────────────────────────────────────────── */
export const TradeProposal = z.object({
  proposal_id: z.string(),
  run_id: z.string(),
  strategy_version: z.string(),
  rules_hash: z.string(),
  prompt_manifest_hash: z.string(),
  disclosure_index: z.number().int().positive(),
  ticker: Ticker,
  venue: z.literal("BIST"),
  /** sell = exit only (no short selling). */
  side: z.enum(["buy", "sell"]),
  event_type: z.union([EventCode, z.literal("EXIT")]),
  rule_ids: z.array(z.string()),
  entry: z.enum(["next_open_auction", "intraday_limit"]),
  limit_price: z.number().positive(),
  ref_price: z.number().positive(),
  ref_price_at: IsoDateTime,
  requested_notional_try: z.number().nonnegative(),
  requested_qty: z.number().int().nonnegative(),
  stop_price: z.number().positive(),
  holding_days_min: z.number().int().positive(),
  holding_days_max: z.number().int().positive(),
  exit_rules: z.array(z.string()),
  expected_edge_bps: z.number(),
  est_cost_bps: z.number().nonnegative(),
  multipliers: z.object({
    evidence: z.number(),
    skeptic: z.number(),
    leakage: z.number(),
    regime: z.number(),
  }),
  confidence: Confidence,
  evidence_card_id: z.string().nullable(),
  evidence_ids: z.array(z.string()),
  retrieved_ids: z.array(z.string()),
  escalate_required: z.boolean(),
  degraded: z.boolean(),
});
export type TradeProposal = z.infer<typeof TradeProposal>;

/* ── Approval (05 ApprovalCard / ApprovalDecision; 07 approvals) ──────── */
export const EscalationReason = z.enum([
  "COMPLIANCE_ESCALATE",
  "DEGRADED",
  "NEAR_MAX_POSITIONS",
  "RESTRICTED_SELL",
  "RESIZED",
]);
export const ApprovalStatus = z.enum(["pending", "claimed", "approved", "rejected", "expired", "cancelled"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalCard = z.object({
  kind: z.literal("trade_approval"),
  proposal_id: z.string(),
  run_id: z.string(),
  ticker: Ticker,
  company_name: z.string(),
  side: z.enum(["buy", "sell"]),
  event_type: z.union([EventCode, z.literal("EXIT")]),
  sub_type_tr: z.string(),
  headline_tr: z.string(),
  disclosure_index: z.number().int().positive(),
  disclosure_url: z.string().url(),
  final_notional_try: z.number().nonnegative(),
  requested_notional_try: z.number().nonnegative(),
  limit_price: z.number().positive(),
  qty: z.number().int().nonnegative(),
  entry: z.enum(["next_open_auction", "intraday_limit"]),
  holding_days: z.tuple([z.number().int(), z.number().int()]),
  level: z.enum(["normal", "escalate"]),
  escalation_reasons: z.array(EscalationReason),
  evidence_summary: z.object({
    n: z.number().int().nonnegative(),
    median_car_5d: z.number(),
    median_car_20d: z.number(),
    hit_rate_5d: z.number().min(0).max(1),
    strength: EvidenceStrength,
    card_id: z.string(),
  }),
  skeptic_flags: z.array(z.object({ code: FlagCode, severity: z.enum(["info", "reduce", "veto"]), detail_tr: z.string() })),
  skeptic_note_tr: z.string(),
  size_multiplier: z.number(),
  compliance_summary_tr: z.string(),
  rule_trace_summary: z.array(RuleTraceEntry),
  degraded: z.boolean(),
  prompt_manifest_hash: z.string(),
  created_at: IsoDateTime,
  expires_at: IsoDateTime,
  status: ApprovalStatus,
  decided_by: z.string().nullable(),
  /** The role the signer acted in (only Risk Sorumlusu may sign; 04 §11). */
  decided_role: Role.nullable(),
  decided_at: IsoDateTime.nullable(),
  decision_comment: z.string().nullable(),
  approved_notional_try: z.number().nullable(),
  is_fixture: z.boolean(),
});
export type ApprovalCard = z.infer<typeof ApprovalCard>;

/**
 * Your decision on a proposal (personal mode). Shrink = approve with a smaller amount; growing
 * is never allowed (FR-24). The note is optional ("" = none); 12 §5 asks for a reason on
 * reject, which the UI encourages but does not force. No TOTP: there is no second person to
 * step up against (SPEC §3).
 */
export const ApprovalDecision = z.object({
  decision: z.enum(["approve", "reject"]),
  approved_notional_try: z.number().positive().nullable(),
  comment: z.string().trim().max(500, "En çok 500 karakter"),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/* ── Orders, fills, positions (07 §9) ─────────────────────────────────── */
export const OrderStatus = z.enum([
  "pending_open",
  "accepted",
  "awaiting_manual_entry",
  "partially_filled",
  "filled",
  "canceled",
  "rejected",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const Fill = z.object({
  id: z.string(),
  order_id: z.string(),
  qty: z.number().int().positive(),
  price: z.number().positive(),
  commission: z.number().nonnegative(),
  bsmv: z.number().nonnegative(),
  slippage_bps: z.number(),
  filled_at: IsoDateTime,
  source: z.enum(["simbist", "alpaca", "manual"]),
});
export type Fill = z.infer<typeof Fill>;

export const Order = z.object({
  id: z.string(),
  client_order_id: z.string(),
  proposal_id: z.string(),
  run_id: z.string(),
  ticker: Ticker,
  company_name: z.string(),
  side: z.enum(["buy", "sell"]),
  order_type: z.enum(["market", "limit"]),
  tif: z.enum(["day", "opg"]),
  qty: z.number().int().positive(),
  limit_price: z.number().positive().nullable(),
  status: OrderStatus,
  broker: z.enum(["simbist", "order_ticket"]),
  created_at: IsoDateTime,
  fills: z.array(Fill),
  /**
   * Why a canceled order ended (panel addition, optional): the opening auction printed at the
   * upper limit above the buy limit ("tavanda açıldı, dolmadı"), the kill switch, or the
   * unfilled remainder dropped at the close.
   */
  cancel_reason: z.enum(["limit_up_open", "kill_switch", "day_end", "ticket_unfilled", "ticket_canceled", "ticket_expired"]).nullish(),
  is_fixture: z.boolean(),
});
export type Order = z.infer<typeof Order>;

export const Position = z.object({
  ticker: Ticker,
  company_name: z.string(),
  qty: z.number().int().positive(),
  avg_cost: z.number().positive(),
  last_price: z.number().positive(),
  opened_at: IsoDateTime,
  planned_exit_date: IsoDate,
  holding_days: z.number().int().nonnegative(),
  source_proposal: z.string(),
  run_id: z.string(),
  event_type: EventCode,
  strategy_version: z.string(),
  unrealized_pnl: z.number(),
  realized_pnl: z.number(),
  /** Set once the kill switch fires: positions are not sold, they exit by their own rules. */
  managed_by_exit_rule: z.boolean(),
  /** paper = SimBIST ledger; personal = a ticket you entered at your own broker (12 §2). */
  book: z.enum(["paper", "personal"]),
});
export type Position = z.infer<typeof Position>;

/**
 * What you did with a ticket at your broker (12 §2 "GERİ BİLDİRİM"): entered (with the fill you
 * saw), did not fill (never chase the price), or canceled. `awaiting` until you mark it;
 * `expired` once the 30-minute TTL or the session passed without a mark (R16).
 */
export const TicketEntryStatus = z.enum(["awaiting", "entered", "unfilled", "canceled", "expired"]);
export type TicketEntryStatus = z.infer<typeof TicketEntryStatus>;

export const TicketEntry = z.object({
  status: TicketEntryStatus,
  filled_qty: z.number().int().positive().nullable(),
  avg_price: z.number().positive().nullable(),
  filled_at: IsoDateTime.nullable(),
  note: z.string().nullable(),
  marked_at: IsoDateTime.nullable(),
});
export type TicketEntry = z.infer<typeof TicketEntry>;

/** POST /tickets/{ticket_no}/mark — "girildi / dolmadı / iptal". */
export const TicketMarkInput = z.discriminatedUnion("mark", [
  z.object({
    mark: z.literal("entered"),
    filled_qty: z.number().int().positive("Adet pozitif olmalı"),
    avg_price: z.number().positive("Fiyat pozitif olmalı"),
    filled_at: IsoDateTime,
    note: z.string().trim().max(500).optional(),
  }),
  z.object({ mark: z.literal("unfilled"), note: z.string().trim().max(500).optional() }),
  z.object({ mark: z.literal("canceled"), note: z.string().trim().max(500).optional() }),
]);
export type TicketMarkInput = z.infer<typeof TicketMarkInput>;

/** Personal-mode order ticket (12 §2). No sharing, no export (FR-27). */
export const OrderTicket = z.object({
  ticket_no: z.string(),
  order_id: z.string(),
  proposal_id: z.string(),
  run_id: z.string(),
  rules_version: z.string(),
  approved_at: IsoDateTime,
  approval_deadline: IsoDateTime,
  created_at: IsoDateTime,
  valid_until: IsoDateTime,
  mode_keys: z.object({ config: z.boolean(), env: z.boolean(), ui: z.boolean() }),
  side: z.literal("buy"),
  ticker: Ticker,
  company_name: z.string(),
  market: z.string(),
  order_type: z.literal("limit"),
  session_tr: z.string(),
  qty: z.number().int().positive(),
  limit_price: z.number().positive(),
  ref_price: z.number().positive(),
  upper_limit: z.number().positive(),
  est_notional_try: z.number().positive(),
  account_equity_try: z.number().positive(),
  event_line_tr: z.string(),
  kap_line_tr: z.string(),
  materiality_line_tr: z.string(),
  leakage_line_tr: z.string(),
  evidence_line_tr: z.string(),
  cost_line_tr: z.string(),
  edge_cost_line_tr: z.string(),
  skeptic_line_tr: z.string(),
  amount_check_line_tr: z.string(),
  stop_line_tr: z.string(),
  planned_exit_tr: z.string(),
  gate_results: z.array(z.object({ code: z.string(), passed: z.boolean() })),
  approval_level: z.enum(["normal", "escalate"]),
  /** The personal stage the ticket was issued in (paper = rehearsal, shadow = no real money, small_real = enter it). */
  stage: StageId,
  audit_hash: z.string(),
  prev_hash: z.string(),
  entry: TicketEntry,
  is_fixture: z.boolean(),
});
export type OrderTicket = z.infer<typeof OrderTicket>;

export const PnlStrategy = z.union([
  z.enum(["kaptan:v1.0-fwd", "kaptan:v1.1-fwd", "baseline:xu100_bh", "baseline:ew_universe"]),
  z.string().regex(/^ablation:[a-z0-9_]+$/),
]);
export type PnlStrategy = z.infer<typeof PnlStrategy>;

export const PnlPoint = z.object({
  d: IsoDate,
  strategy: PnlStrategy,
  equity: z.number(),
  daily_return: z.number(),
  peak_equity: z.number(),
  drawdown: z.number().max(0),
  n_positions: z.number().int().nonnegative(),
  n_trades: z.number().int().nonnegative(),
});
export type PnlPoint = z.infer<typeof PnlPoint>;

/* ── Risk status, kill switch (06 §11; _KANONIK "Enterprise": reset = Yönetici + Risk Sorumlusu) ── */
/**
 * Restarting after Durdur takes two people: the Yönetici starts it (1/2) and the Risk
 * Sorumlusu confirms it (2/2). Present while the kill switch is on; `null` when it is off.
 */
export const KillReset = z.object({
  /** The Yönetici's start (1/2), or null before anyone asked. */
  started: Signature.nullable(),
});
export type KillReset = z.infer<typeof KillReset>;

export const RiskStatus = z.object({
  kill_switch: z.enum(["off", "on"]),
  kill_reason: z.string().nullable(),
  kill_at: IsoDateTime.nullable(),
  /** "user:<uid>" (someone pressed it) or "system:risk_monitor" (−5% from the peak, R01). */
  kill_by: z.string().nullable(),
  halted_today: z.boolean(),
  daily_pnl_pct: z.number(),
  drawdown_pct: z.number().max(0),
  peak_equity: z.number().positive(),
  equity: z.number().positive(),
  regime: z.enum(["normal", "crisis"]),
  live_armed: z.boolean(),
  quota: z.array(z.object({ provider: z.string(), used: z.number().int().nonnegative(), limit: z.number().int().positive() })),
  reset: KillReset.nullable(),
  as_of: IsoDateTime,
});
export type RiskStatus = z.infer<typeof RiskStatus>;
