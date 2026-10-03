import type {
  ApprovalStatus,
  EventCode,
  EventType,
  FlagCode,
  ReaderOutput,
  RiskCheck,
  RuleTraceEntry,
  RunOutcome,
  RunStatus,
  SubjectRoute,
} from "@/lib/domain";

/**
 * Declarative description of one graph run. `buildExplain()` turns a spec into a complete,
 * internally consistent `Explain` payload (FRONTEND-SPEC §6.10).
 */
export type RunKind = "propose" | "no_trade" | "hold" | "quarantine" | "pregate_veto" | "archived";

export interface EvidenceSpec {
  n: number;
  nSameTicker: number;
  mean5: number;
  median5: number;
  hit5: number;
  mean20: number;
  median20: number;
  hit20: number;
  ci20: [number, number];
}

export interface SkepticSpec {
  multiplier: 1 | 0.75 | 0.5 | 0.25;
  flags: Array<{ code: FlagCode; severity: "info" | "reduce" | "veto"; detail_tr: string }>;
  counter_tr: string;
  veto?: boolean;
}

export interface ProposalSpec {
  refPrice: number;
  qty: number;
  stopPct: number;
  holding: [number, number];
  edgeBps: number;
  costBps: number;
  requestedNotional: number;
  entry: "next_open_auction" | "intraday_limit";
  escalate?: Array<"COMPLIANCE_ESCALATE" | "DEGRADED" | "NEAR_MAX_POSITIONS" | "RESTRICTED_SELL" | "RESIZED">;
}

export interface DecisionSpec {
  status: Extract<ApprovalStatus, "pending" | "approved" | "rejected" | "expired" | "cancelled">;
  by?: string;
  atIso?: string;
  comment?: string;
  approvedNotional?: number | null;
  /** SimBIST fill; `qty` below the order size leaves the order partially filled. */
  fill?: { price: number; atIso: string; slippageBps: number; qty?: number };
  /** Opening auction printed at the upper limit, above the buy limit: the OPG order lapsed unfilled. */
  unfilledAtLimitUp?: boolean;
}

export interface RunSpec {
  run_id: string;
  disclosure_index: number;
  ticker: string;
  event: EventCode | null;
  classifiedAs: EventType | null;
  classifierConfidence: number;
  method: "subject_map" | "llm";
  route: SubjectRoute;
  subject: string;
  kind: RunKind;
  status: RunStatus;
  outcome: RunOutcome | null;
  publishedAtIso: string;
  headline_tr: string;
  text_tr: string;
  text_en: string | null;
  sub_type: string;
  sub_type_tr: string;
  reader: ReaderOutput | null;
  /** Merge numbers worth showing (ratio, denominators). */
  merge?: { ratio?: number; denominatorName?: string; denominator?: number; amountTry?: number; amountInText?: boolean };
  leakage5d: number;
  evidence: EvidenceSpec | null;
  skeptic: SkepticSpec | null;
  ruleTrace: RuleTraceEntry[];
  reasonCodes: string[];
  compliance: "pass" | "escalate" | "veto" | null;
  guardScore: number;
  regexHits?: string[];
  preGateReasons?: string[];
  riskOverrides?: Partial<Record<RiskCheck["rule_code"], Pick<RiskCheck, "outcome" | "detail_tr"> & { observed?: string; limit?: string }>>;
  proposal: ProposalSpec | null;
  decision: DecisionSpec | null;
  strategy_version: string;
  is_fixture: boolean;
  llmCalls: number;
  tokens: [number, number];
  /** Verbatim phrases the Classifier quotes (default: the body's first sentence). */
  classifierQuotes?: ReadonlyArray<{ field: string; quote: string }>;
  /** Verbatim phrases to mark as source spans in the TR text (field → phrase). */
  sourceSpans?: ReadonlyArray<{ field: string; quote: string }>;
}
