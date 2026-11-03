import type {
  ApprovalCard,
  ApprovalDecision,
  AuditListQuery,
  AuditPage,
  ChainVerifyResult,
  DayCounters,
  DisclosureListItem,
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
  TicketMarkInput,
} from "@/lib/domain";
import type { HoldInput, HoldResult, Overview } from "@/lib/solo/overview";

/**
 * The one typed client every screen uses (API.md is the contract for the backend). One person:
 * signed in means allowed. The real one is `http` (FastAPI /api/v1); `mock` is the test double.
 * Screens use `useApi()`.
 */
export interface KaptanApi {
  readonly mode: "mock" | "http";

  me(): Promise<Me>;

  /**
   * GET /disclosures/counters?day=YYYY-MM-DD — one Istanbul day's exact counters ("796 bildirim
   * okundu, 5 öneri"); default today on the server clock. Unlike the capped /disclosures list
   * it counts every disclosure of the day.
   */
  counters(day?: string): Promise<DayCounters>;
  /**
   * GET /disclosures?day=YYYY-MM-DD&limit=&ticker= — one Istanbul day's disclosures, newest first
   * (default: today on the server clock; limit 1–500, default 200).
   */
  disclosures(query?: DisclosureQuery): Promise<DisclosureListItem[]>;

  // proposals: an approval yields an order ticket
  listApprovals(status?: ApprovalCard["status"] | "all"): Promise<ApprovalCard[]>;
  decideApproval(proposalId: string, decision: ApprovalDecision): Promise<ApprovalCard>;
  /** Everything the crew did for one run (the Öneri story reads from it). */
  explain(runId: string): Promise<Explain>;
  listNotes(proposalId: string): Promise<ProposalNote[]>;
  addNote(proposalId: string, body: string): Promise<ProposalNote>;

  // order tickets — entered by hand at the broker, then marked here
  listTickets(): Promise<OrderTicket[]>;
  markTicket(ticketNo: string, input: TicketMarkInput): Promise<OrderTicket>;

  /** The single-user home in one call (GET /me/overview): money, where it sits, suggestions. */
  overview(): Promise<Overview>;
  /** "Tut" / "Geç" on a suggestion (POST /me/suggestions/{id}/hold): audited; the card itself stays open. */
  holdSuggestion(id: string, input: HoldInput): Promise<HoldResult>;

  // portfolio
  positions(): Promise<Position[]>;
  pnl(from?: string, to?: string): Promise<PnlPoint[]>;

  // stop and restart: start asks; confirm opens at reset.ready_at (null = now)
  riskStatus(): Promise<RiskStatus>;
  killSwitch(reason: string): Promise<RiskStatus>;
  startKillReset(input: { reason: string }): Promise<RiskStatus>;
  confirmKillReset(input: { reason: string }): Promise<RiskStatus>;

  // limits: propose, then decide (the screens do both as one action)
  limits(): Promise<LimitsView>;
  proposeLimit(input: LimitProposalInput): Promise<LimitsView>;
  decideLimit(version: number, input: LimitDecisionInput): Promise<LimitsView>;

  // the audit ledger (hash chain)
  auditList(query?: AuditListQuery): Promise<AuditPage>;
  verifyAudit(): Promise<ChainVerifyResult>;
}

export interface DisclosureQuery {
  day?: string;
  limit?: number;
  ticker?: string;
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

/** What the person reads when the KAPtan on their computer does not answer. */
export const MSG_UNREACHABLE = "KAPtan’a ulaşılamıyor. Bilgisayarında çalışıyor mu?";

/** Thrown when the API does not answer at all (a refused connection, or the proxy's own error page). */
export function unreachableError(): ApiError {
  return new ApiError(0, "unreachable", MSG_UNREACHABLE);
}

export function isUnreachable(e: unknown): boolean {
  return isApiError(e) && e.code === "unreachable";
}

/** User-facing message for any thrown value (never leaks internals). */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Beklenmeyen bir hata oluştu. Yeniden dene.";
}
