import type {
  ApprovalCard,
  ApprovalDecision,
  AuditListQuery,
  AuditPage,
  ChainVerifyResult,
  DayCounters,
  Explain,
  LimitDecisionInput,
  LimitProposalInput,
  LimitsView,
  Me,
  OrderTicket,
  PnlPoint,
  Position,
  ProposalNote,
  RiskStatus,
  TeamMember,
  TicketMarkInput,
} from "@/lib/domain";
import type { Role } from "@/lib/domain/user";
import type { DemoScenario } from "@/mocks/ids";

/**
 * The one typed client every screen uses (API.md is the contract for the backend). One login,
 * four roles: every write is checked against `can(role, action)` and refused with a typed 403
 * that carries the plain reason ("Bunu Risk Sorumlusu yapar."). Two implementations: `mock`
 * (default, in-browser state) and `http` (FastAPI /api/v1). Screens use `useApi()`.
 */
export interface KaptanApi {
  readonly mode: "mock" | "http";

  // session and roles
  me(): Promise<Me>;
  /** Look through another role's eyes (one login; the role is kept in the session). */
  setRole(role: Role): Promise<Me>;
  /** The team: four members and the read-only Denetçi seat. */
  users(): Promise<TeamMember[]>;

  /** Today's counters for the one quiet line on Bugün ("212 bildirim okundu, 5 öneri"). */
  counters(): Promise<DayCounters>;

  // proposals — the Risk Sorumlusu signs; an approval yields an order ticket
  listApprovals(status?: ApprovalCard["status"] | "all"): Promise<ApprovalCard[]>;
  decideApproval(proposalId: string, decision: ApprovalDecision): Promise<ApprovalCard>;
  /** Everything the crew did for one run (the Öneri story reads from it). */
  explain(runId: string): Promise<Explain>;
  listNotes(proposalId: string): Promise<ProposalNote[]>;
  addNote(proposalId: string, body: string): Promise<ProposalNote>;

  // order tickets (emir fişi) — entered by hand at the broker, then marked here
  listTickets(): Promise<OrderTicket[]>;
  markTicket(ticketNo: string, input: TicketMarkInput): Promise<OrderTicket>;

  // portfolio
  positions(): Promise<Position[]>;
  pnl(from?: string, to?: string): Promise<PnlPoint[]>;

  // risk & kill switch: stop = Risk Sorumlusu or Yönetici; restart = Yönetici starts, Risk Sorumlusu confirms
  riskStatus(): Promise<RiskStatus>;
  killSwitch(reason: string): Promise<RiskStatus>;
  startKillReset(input: { reason: string }): Promise<RiskStatus>;
  confirmKillReset(input: { reason: string }): Promise<RiskStatus>;

  // limits: Yönetici proposes (1/2), Risk Sorumlusu approves (2/2)
  limits(): Promise<LimitsView>;
  proposeLimit(input: LimitProposalInput): Promise<LimitsView>;
  decideLimit(version: number, input: LimitDecisionInput): Promise<LimitsView>;

  // the audit ledger (hash chain)
  auditList(query?: AuditListQuery): Promise<AuditPage>;
  verifyAudit(): Promise<ChainVerifyResult>;

  // demo / test (Yönetici; mock, or http with the backend's DEMO_MODE)
  injectDemo(scenario: DemoScenario): Promise<{ disclosure_index: number | null; run_id: string | null }>;
  /** Tamper test: change one ledger record behind the chain's back (or undo it). */
  setTamper(on: boolean): Promise<{ tamper_on: boolean }>;
  resetDemo(): Promise<void>;
}

/** Errors carry an HTTP-like status, a machine code and a Turkish, user-safe message. */
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
