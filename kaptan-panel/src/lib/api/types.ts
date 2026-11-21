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
  Benchmark,
  Karne,
  KarnePeriod,
  LimitsView,
  Me,
  MorningBrief,
  OrderTicket,
  PnlPoint,
  Position,
  ProposalNote,
  QuietDay,
  RiskStatus,
  TicketCorrectInput,
  TicketMarkInput,
  TrackRecord,
} from "@/lib/domain";
import type { AlertSettings, SystemStatus } from "@/lib/domain/system";
import type { BonusInput, CorporateBook, DividendInput, NoticeAnswer, RightsInput } from "@/lib/domain/corporate";
import type { AlertPrefs, BackupStatus, PasswordChanged, PauseInput, Preferences } from "@/lib/domain/preferences";
import type { Company, DisclosureReading, Period, SearchResult, WatchItem } from "@/lib/company/company";
import type { BookResetInput, BookResetOut, BrokerFee, BrokerFeeInput, HoldingInput, HoldingSellInput, MoneyBook, MoneyInput, MovementCorrectInput, PreviousBook } from "@/lib/solo/money";
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

  /** GET /disclosures/{index}: one disclosure in full (text, numbers KAPtan read, what it did). */
  disclosureReading(index: number): Promise<DisclosureReading>;
  /** GET /companies/{ticker}?period=: the page of one company. 404 for a code nobody knows. */
  company(ticker: string, period?: Period): Promise<Company>;
  /** GET /search?q=: companies by ticker or name, disclosures by words (nothing under 2 letters). */
  search(q: string): Promise<SearchResult>;
  /** GET /watchlist: the starred companies with today's quiet numbers. */
  watchlist(): Promise<WatchItem[]>;
  /** PUT /watchlist/{ticker}: star a company (audited; at most 50). Returns the list. */
  watch(ticker: string): Promise<WatchItem[]>;
  /** DELETE /watchlist/{ticker}: un-star. Returns the list. */
  unwatch(ticker: string): Promise<WatchItem[]>;

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

  // the person's own book: the money they put in and the shares they already held
  /** GET /me/money: free cash, money put in so far, and every movement of it, newest first. */
  money(): Promise<MoneyBook>;
  /** POST /me/money: the starting money (once), a deposit or a withdrawal. Never a gain or a loss. */
  moveMoney(input: MoneyInput): Promise<MoneyBook>;
  /** POST /me/holdings: a share already owned before KAPtan joins the book at its cost; cash is untouched. */
  addHolding(input: HoldingInput): Promise<Position>;
  /** POST /me/holdings/{id}/sell: a hand-entered holding was sold at the bank; null when nothing is left. */
  sellHolding(positionId: string, input: HoldingSellInput): Promise<Position | null>;
  /** POST /me/money/{id}/correct: the amount of a movement was typed wrong. Never a gain or a loss; the old amount stays on the row. */
  correctMovement(movementId: string, input: MovementCorrectInput): Promise<MoneyBook>;
  /** POST /me/money/{id}/undo: "Bunu yanlış girdim". The row stays, marked "geri alındı". */
  undoMovement(movementId: string): Promise<MoneyBook>;
  // company actions: dividends received, bonus and rights issues, and the KAP notices about them
  /** GET /me/corporate: dividends this year and in all (per share too) and every record, newest first. */
  corporateBook(): Promise<CorporateBook>;
  /** POST /me/corporate/dividends: cash the bank paid in. Income, never a deposit. */
  recordDividend(input: DividendInput): Promise<CorporateBook>;
  /** POST /me/corporate/bonus: a bonus issue or split. More shares, same total cost, no cash, no gain. */
  recordBonus(input: BonusInput): Promise<CorporateBook>;
  /** POST /me/corporate/rights: new shares bought at the subscription price, paid from cash. */
  recordRights(input: RightsInput): Promise<CorporateBook>;
  /** POST /me/corporate/{id}/undo: a correction row that reverses a record. Nothing is deleted. */
  undoCorporate(recordId: string): Promise<CorporateBook>;
  /** GET /me/corporate/notices: KAP notices about an action on a share held now. They only ask; they change nothing. */
  corporateNotices(): Promise<NoticeAnswer>;
  /** POST /me/corporate/notices/{id}/dismiss: the person does not want this prompt. */
  dismissNotice(noticeId: string): Promise<NoticeAnswer>;
  /** POST /tickets/{no}/correct: fix the fill recorded on an entered ticket (adet, price, commission). */
  correctFill(ticketNo: string, input: TicketCorrectInput): Promise<OrderTicket>;
  /** GET /me/fee: the commission rate in force (yours, or KAPtan's built-in one). */
  brokerFee(): Promise<BrokerFee>;
  /** PUT /me/fee: your bank's commission rate (a fraction, 0 to 0.01); null goes back to the built-in rate. */
  setBrokerFee(input: BrokerFeeInput): Promise<BrokerFee>;
  /** POST /me/book/reset: "Baştan başla". Closes the book, keeps its history, back to the first question. */
  startOver(input: BookResetInput): Promise<BookResetOut>;
  /** GET /me/books: the books closed by starting over, newest first. */
  previousBooks(): Promise<PreviousBook[]>;
  /** GET /me/export.csv: money movements and recorded fills as a spreadsheet file. */
  exportRecords(): Promise<{ filename: string; blob: Blob }>;

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

  /** GET /system/status: is KAPtan actually working (the shell's one line, and Ayarlar · Sistem). */
  systemStatus(): Promise<SystemStatus>;
  // reports: how KAPtan's suggestions did, your money against BIST 100, the monthly/yearly Karne, why a day is quiet
  /** GET /reports/track: every buy suggestion, what you did with it and what the price did after (optional days). */
  trackRecord(range?: { from?: string; to?: string }): Promise<TrackRecord>;
  /** GET /reports/benchmark: your result over the stored days against BIST 100; `available` false = say nothing. */
  benchmark(range?: { from?: string; to?: string }): Promise<Benchmark>;
  /** GET /reports/karne: a month ("2026-11") or a year ("2026"); default the current month. */
  karne(period?: KarnePeriod, at?: string): Promise<Karne>;
  /** GET /reports/quiet: why the day has (no) suggestions, from its real counts. */
  quietDay(day?: string): Promise<QuietDay>;
  /** GET /brief/today: this morning's brief; null (404) when none was built yet. */
  briefToday(): Promise<MorningBrief | null>;

  /** GET /me/alerts: which phone and e-mail channels are set up on this computer. */
  alertSettings(): Promise<AlertSettings>;
  /** POST /me/alerts/test: one test message through every channel that is set up (one a minute). */
  testAlerts(): Promise<AlertSettings>;

  // personal settings
  /** GET /me/preferences: Tatil modu and which alert goes where, with the quiet hours. */
  preferences(): Promise<Preferences>;
  /** PUT /me/alerts/preferences: the whole alert document. */
  saveAlertPrefs(prefs: AlertPrefs): Promise<Preferences>;
  /** POST /me/pause: for N days from now, or until a date (the first day KAPtan works again). */
  startPause(input: PauseInput): Promise<Preferences>;
  /** POST /me/pause/resume: "Şimdi devam et". */
  endPause(): Promise<Preferences>;
  /** GET /me/backup: the last backup and whether one is being taken. */
  backupStatus(): Promise<BackupStatus>;
  /** POST /me/backup/run: "Şimdi yedek al". */
  runBackup(): Promise<BackupStatus>;
  /** POST /auth/password: the other devices are signed out; this one stays in. */
  changePassword(input: { current: string; next: string }): Promise<PasswordChanged>;
  /** POST /auth/logout-all: every device, this one too (the caller then goes to /login). */
  signOutEverywhere(): Promise<void>;
}

export interface DisclosureQuery {
  day?: string;
  limit?: number;
  ticker?: string;
  /** What KAPtan thought it was: E1..E4 or IGNORE. */
  type?: string;
  /** Only the ones a suggestion came of. */
  acted?: boolean;
  /** "watchlist": the starred companies; "mine": starred or held. */
  scope?: "watchlist" | "mine";
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
