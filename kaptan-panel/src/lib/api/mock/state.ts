import type { ApprovalCard, LimitVersion, LiveArmState, Note, Order, ProposalNote, RestrictedSecurity, TicketEntry } from "@/lib/domain";
import type { ChainFields } from "@/lib/audit-chain";
import { SEED_LIMIT_VERSIONS, SEED_LIVE_ARM, SEED_RESTRICTED, SEED_WATCHLIST } from "@/mocks/governance";
import { liveEquity } from "@/mocks/pnl";
import { initialBook, type MockBook } from "./ledger";
import { initialAlertsMore, type MockAlertsMore } from "./alerts-more";
import { initialComfort, type MockComfort } from "./comfort";
import type { MockReading } from "./reading";
import type { MockTelegram } from "./telegram";
import { initialStatus, type MockStatus } from "./status";

/** Live strategy's P&L at 13:40 on the fixture day. */
const OPENING_DAILY_PNL = 0.0021;

/**
 * Serializable mock session state. Base fixtures (day, runs, chain, P&L) are rebuilt
 * deterministically; only what the session changed lives here and in localStorage, so a
 * reload keeps the story. Tests clear it with `db.reset()`.
 */
export const STORAGE_KEY = "kaptan-mock-state";
export const STATE_VERSION = 10;

export type ApprovalPatch = Pick<
  ApprovalCard,
  "status" | "decided_by" | "decided_at" | "decision_comment" | "approved_notional_try"
>;

export interface MockRisk {
  /** Daily P&L and drawdown overrides set by the loss simulation. */
  daily_pnl_pct: number;
  drawdown_pct: number;
}

export interface MockState {
  v: number;
  startedAtReal: number;
  /** Real-time ms at which each post-13:40 row was released by the live ticker. */
  releasedLate: number[];
  approvals: Record<string, ApprovalPatch>;
  orders: Order[];
  canceledOrderIds: string[];
  notes: Note[];
  risk: MockRisk;
  positionsManagedByExit: boolean;
  limitVersions: LimitVersion[];
  auditAppends: Array<Omit<ChainFields, "chain_pos">>;
  restricted: RestrictedSecurity[];
  watchlist: string[];
  liveArm: LiveArmState;
  verifiedAt: string | null;
  /** Your marks on order tickets, by ticket number (girildi / dolmadı / iptal). */
  ticketMarks: Record<string, TicketEntry>;
  /** Your notes on proposals. */
  proposalNotes: ProposalNote[];
  /** Tests of the chain walk: one audit record changed behind the chain's back. */
  tamperOn: boolean;
  /** The person's own book: money moved by hand and shares added by hand (ledger.ts). */
  book: MockBook;
  /** What the system says about itself: problems, disclosures waiting for a turn, alert channels (status.ts). */
  status: MockStatus;
  /** Personal settings: pause, alert preferences, backup box, password (comfort.ts). */
  comfort: MockComfort;
  /** Price alerts and the history of what went out (alerts-more.ts). */
  alertsMore: MockAlertsMore;
  /** Saved and opened disclosures (reading.ts); absent in states saved before it existed. */
  reading?: MockReading;
  /** Telegram pairing and level (telegram.ts); absent in states saved before it existed. */
  telegram?: MockTelegram;
}

/** `fresh`: a new install with no starting money yet (the home asks for it); default is the seeded book. */
export function initialState(nowReal: number, fresh = false): MockState {
  return {
    v: STATE_VERSION,
    startedAtReal: nowReal,
    releasedLate: [],
    approvals: {},
    orders: [],
    canceledOrderIds: [],
    notes: [],
    risk: {
      daily_pnl_pct: OPENING_DAILY_PNL,
      drawdown_pct: liveEquity(OPENING_DAILY_PNL).drawdown,
    },
    positionsManagedByExit: false,
    limitVersions: [...SEED_LIMIT_VERSIONS],
    auditAppends: [],
    restricted: [...SEED_RESTRICTED],
    watchlist: [...SEED_WATCHLIST],
    liveArm: { ...SEED_LIVE_ARM },
    verifiedAt: null,
    ticketMarks: {},
    proposalNotes: [],
    tamperOn: false,
    book: initialBook(fresh),
    status: initialStatus(),
    comfort: initialComfort(),
    alertsMore: initialAlertsMore(),
  };
}

/** Read persisted state; anything missing, stale or malformed starts fresh. */
export function loadState(storage: Pick<Storage, "getItem"> | null, nowReal: number, fresh = false): MockState {
  if (!storage) return initialState(nowReal, fresh);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState(nowReal, fresh);
    const parsed = JSON.parse(raw) as Partial<MockState>;
    if (parsed.v !== STATE_VERSION || typeof parsed.startedAtReal !== "number") return initialState(nowReal, fresh);
    return { ...initialState(nowReal, fresh), ...parsed } as MockState;
  } catch {
    return initialState(nowReal, fresh);
  }
}

export function saveState(storage: Pick<Storage, "setItem"> | null, state: MockState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): the session simply won't persist.
  }
}
