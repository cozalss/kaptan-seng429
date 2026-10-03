import type { ApprovalCard, ApprovalDecision, DayCounters, Explain, Me, OrderTicket, PnlPoint, Position, RiskStatus, TicketMarkInput } from "@/lib/domain";
import type { DemoScenario } from "@/mocks/ids";

/**
 * The one typed client the three screens use (API.md is the contract for the backend).
 * Personal mode: one user, no roles. Two implementations: `mock` (default, in-browser state)
 * and `http` (FastAPI /api/v1). Screens never import an implementation directly — use `useApi()`.
 */
export interface KaptanApi {
  readonly mode: "mock" | "http";

  // session
  me(): Promise<Me>;

  /** Today's counters for the one quiet line on Bugün ("212 bildirim okundu, 5 öneri"). */
  counters(): Promise<DayCounters>;

  // proposals — your decision; an approval yields an order ticket
  listApprovals(status?: ApprovalCard["status"] | "all"): Promise<ApprovalCard[]>;
  decideApproval(proposalId: string, decision: ApprovalDecision): Promise<ApprovalCard>;
  /** Everything the crew did for one run (the Öneri story reads from it). */
  explain(runId: string): Promise<Explain>;

  // order tickets (emir fişi) — you enter them by hand at your broker, then mark them
  listTickets(): Promise<OrderTicket[]>;
  markTicket(ticketNo: string, input: TicketMarkInput): Promise<OrderTicket>;

  // portfolio
  positions(): Promise<Position[]>;
  pnl(from?: string, to?: string): Promise<PnlPoint[]>;

  // risk & kill switch (personal reset: two confirmations ≥ 24 h apart + 5 sessions)
  riskStatus(): Promise<RiskStatus>;
  killSwitch(reason: string): Promise<RiskStatus>;
  confirmKillReset(input: { reason: string }): Promise<RiskStatus>;

  // demo / test (mock; http only with the backend's DEMO_MODE)
  injectDemo(scenario: DemoScenario): Promise<{ disclosure_index: number | null; run_id: string | null }>;
  /** Fast-forward the kill-switch reset clock (hours). Demo only; the demo day itself stays put. */
  advanceDemoClock(hours: number): Promise<RiskStatus>;
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
