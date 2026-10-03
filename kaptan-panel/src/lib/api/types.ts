import type {
  AdminUserView,
} from "./admin-types";
import type {
  ApprovalCard,
  ApprovalDecision,
  AuditEntry,
  AuditQuery,
  AuditStatus,
  ChainVerifyResult,
  ConfigView,
  DayCounters,
  DisclosureDetail,
  DisclosureListItem,
  EvalSummary,
  Explain,
  KillResetRequest,
  LimitDecisionInput,
  LimitProposalInput,
  LimitVersion,
  LiveArmState,
  Me,
  MorningBrief,
  Note,
  Order,
  OrderTicket,
  Page,
  PnlPoint,
  Position,
  RestrictedSecurity,
  RiskStatus,
  RunSummary,
  UniverseEntry,
} from "@/lib/domain";
import type { DemoScenario } from "@/mocks/ids";

/**
 * The one typed client every screen uses (FRONTEND-SPEC §5). Two implementations:
 * `mock` (default, in-browser session state) and `http` (FastAPI /api/v1).
 * Screens never import an implementation directly — use `useApi()`.
 */
export interface DisclosureQuery {
  date?: string;
  ticker?: string;
  event_code?: string;
  /** "hide" (default) hides circuit-breaker noise; "only" shows only noise; "all". */
  noise?: "hide" | "only" | "all";
  page?: number;
  page_size?: number;
}

export interface RunQuery {
  status?: RunSummary["status"];
  from?: string;
}

export interface KaptanApi {
  readonly mode: "mock" | "http";

  // session
  me(): Promise<Me>;

  // feed
  listDisclosures(q?: DisclosureQuery): Promise<Page<DisclosureListItem> & { counters: DayCounters }>;
  getDisclosure(index: number): Promise<DisclosureDetail>;
  addNote(index: number, body: string): Promise<Note>;
  counters(): Promise<DayCounters>;

  // runs
  listRuns(q?: RunQuery): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary>;
  explain(runId: string): Promise<Explain>;

  // approvals
  listApprovals(status?: ApprovalCard["status"] | "all"): Promise<ApprovalCard[]>;
  decideApproval(proposalId: string, decision: ApprovalDecision): Promise<ApprovalCard>;

  // orders & portfolio
  listOrders(): Promise<Order[]>;
  listTickets(): Promise<OrderTicket[]>;
  manualFill(orderId: string, input: { qty: number; price: number; filled_at: string }): Promise<Order>;
  positions(): Promise<Position[]>;
  pnl(from?: string, to?: string): Promise<PnlPoint[]>;

  // risk
  riskStatus(): Promise<RiskStatus>;
  killSwitch(reason: string): Promise<RiskStatus>;
  requestKillReset(input: { reason: string; totp: string }): Promise<KillResetRequest>;
  confirmKillReset(input: { request_id: string; comment: string; totp: string }): Promise<RiskStatus>;

  // limits
  limits(): Promise<LimitVersion>;
  limitsHistory(): Promise<LimitVersion[]>;
  proposeLimits(input: LimitProposalInput): Promise<LimitVersion>;
  decideLimits(version: number, input: LimitDecisionInput): Promise<LimitVersion>;

  // audit
  audit(q?: AuditQuery): Promise<Page<AuditEntry>>;
  verifyAudit(): Promise<ChainVerifyResult>;
  auditStatus(): Promise<AuditStatus>;

  // eval & brief
  evalSummary(): Promise<EvalSummary>;
  brief(date?: string): Promise<MorningBrief>;

  // admin (D)
  adminUsers(): Promise<AdminUserView[]>;
  adminConfig(): Promise<ConfigView>;
  universe(): Promise<UniverseEntry[]>;
  restricted(): Promise<RestrictedSecurity[]>;
  addRestricted(input: { ticker: string; kind: RestrictedSecurity["kind"]; source_ref: string | null }): Promise<RestrictedSecurity>;
  requestRestrictedRemoval(id: string): Promise<RestrictedSecurity>;
  confirmRestrictedRemoval(id: string): Promise<void>;
  liveArm(): Promise<LiveArmState>;
  armLive(totp: string): Promise<LiveArmState>;
  confirmLive(totp: string): Promise<LiveArmState>;

  // demo mode (D, DEMO_MODE only)
  injectDemo(scenario: DemoScenario): Promise<{ disclosure_index: number | null; run_id: string | null }>;
  setTamper(on: boolean): Promise<void>;
  resetDemo(): Promise<void>;
}

/** Errors carry an HTTP-like status and a Turkish, user-safe message. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, messageTr: string) {
    super(messageTr);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** User-facing message for any thrown value (never leaks internals). */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Beklenmeyen bir hata oluştu. Lütfen yeniden deneyin.";
}
