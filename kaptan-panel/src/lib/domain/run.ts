import { z } from "zod";
import { EventType, IsoDateTime } from "./common";
import { DisclosureListItem, DisclosureText } from "./disclosure";
import {
  ClassifierOutput,
  ComplianceReport,
  EvidenceCard,
  EvidenceEvent,
  GuardResult,
  MaterialityOutput,
  PreGateResult,
  ReaderOutput,
  RouteResult,
  SkepticOutput,
} from "./agents";
import { MergedFeatures, RiskCheck, RuleDecision } from "./rules";
import { ApprovalCard, Fill, Order, OrderTicket, TradeProposal } from "./trading";

/* ── Graph nodes (05 code names; Turkish labels for the UI) ───────────── */
export const NodeName = z.enum([
  "route",
  "pre_gate",
  "guard",
  "classifier",
  "reader",
  "materiality",
  "evidence",
  "merge",
  "skeptic",
  "rule_engine",
  "compliance",
  "risk_gate",
  "request_approval",
  "approval",
  "execute",
  "record",
  "filter_action",
]);
export type NodeName = z.infer<typeof NodeName>;

export const NODE_LABELS: Readonly<Record<NodeName, { tr: string; kind: "llm" | "code" | "human" }>> = {
  route: { tr: "Yönlendirme", kind: "code" },
  pre_gate: { tr: "Ön eleme", kind: "code" },
  guard: { tr: "Koruma", kind: "code" },
  classifier: { tr: "Sınıflandırıcı", kind: "llm" },
  reader: { tr: "Okuyucu", kind: "llm" },
  materiality: { tr: "Önemlilik", kind: "llm" },
  evidence: { tr: "Kanıt", kind: "llm" },
  merge: { tr: "Birleştirme", kind: "code" },
  skeptic: { tr: "Şüpheci", kind: "llm" },
  rule_engine: { tr: "Kural motoru", kind: "code" },
  compliance: { tr: "Uyum", kind: "llm" },
  risk_gate: { tr: "Risk kapısı", kind: "code" },
  request_approval: { tr: "Onay talebi", kind: "code" },
  approval: { tr: "Onay", kind: "human" },
  execute: { tr: "Yürüt", kind: "code" },
  record: { tr: "Kaydet", kind: "code" },
  filter_action: { tr: "Filtre eylemi", kind: "code" },
};

export const RunStatus = z.enum(["running", "interrupted", "completed", "failed", "hold_quota", "skipped"]);
export type RunStatus = z.infer<typeof RunStatus>;
export const RunOutcome = z.enum(["PROPOSE", "NO_TRADE", "HOLD", "QUARANTINED", "PREGATE_VETO"]);
export type RunOutcome = z.infer<typeof RunOutcome>;
export const RunMode = z.enum(["paper", "personal", "live", "backtest", "replay", "demo"]);

export const RunSummary = z.object({
  run_id: z.string(),
  disclosure_index: z.number().int().positive(),
  ticker: z.string(),
  company_name: z.string(),
  event_type: EventType.nullable(),
  status: RunStatus,
  outcome: RunOutcome.nullable(),
  mode: RunMode,
  started_at: IsoDateTime,
  finished_at: IsoDateTime.nullable(),
  llm_calls: z.number().int().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  strategy_version: z.string(),
  is_fixture: z.boolean(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const TraceNode = z.object({
  node: NodeName,
  status: z.enum(["done", "skipped", "failed", "waiting", "running"]),
  started_at: IsoDateTime.nullable(),
  latency_ms: z.number().int().nonnegative().nullable(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  model_id: z.string().nullable(),
  prompt_version: z.string().nullable(),
  cached: z.boolean(),
  /** Nodes sharing a group ran in parallel (Send fan-out). */
  parallel_group: z.string().nullable(),
  note_tr: z.string().nullable(),
});
export type TraceNode = z.infer<typeof TraceNode>;

export const RunTrace = z.object({
  nodes: z.array(TraceNode),
  langsmith_url: z.string().url().nullable(),
});
export type RunTrace = z.infer<typeof RunTrace>;

/** GET /runs/{run_id}/explain — every field null when its node did not run (04 §11, FR-31). */
export const Explain = z.object({
  run: RunSummary,
  disclosure: DisclosureListItem,
  texts: z.array(DisclosureText),
  /** Character ranges to highlight in the TR text (source_spans). */
  source_spans: z.array(z.object({ start: z.number().int(), end: z.number().int(), field: z.string() })),
  route: RouteResult.nullable(),
  pre_gate: PreGateResult.nullable(),
  guard: GuardResult.nullable(),
  classifier: ClassifierOutput.nullable(),
  reader: ReaderOutput.nullable(),
  materiality: MaterialityOutput.nullable(),
  evidence_card: EvidenceCard.nullable(),
  evidence_events: z.array(EvidenceEvent),
  merged: MergedFeatures.nullable(),
  skeptic: SkepticOutput.nullable(),
  rule_decision: RuleDecision.nullable(),
  compliance: ComplianceReport.nullable(),
  risk_checks: z.array(RiskCheck),
  proposal: TradeProposal.nullable(),
  approval: ApprovalCard.nullable(),
  orders: z.array(Order),
  fills: z.array(Fill),
  ticket: OrderTicket.nullable(),
  audit_positions: z.array(z.object({ chain_pos: z.number().int().positive(), action: z.string(), hash: z.string() })),
  trace: RunTrace,
});
export type Explain = z.infer<typeof Explain>;
