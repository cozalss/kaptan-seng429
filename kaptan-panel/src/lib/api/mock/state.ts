import type { ApprovalCard, LimitVersion, LiveArmState, Note, Order, RestrictedSecurity, TicketEntry } from "@/lib/domain";
import type { ChainFields } from "@/lib/audit-chain";
import type { DemoScenario } from "@/mocks/ids";
import { SEED_LIMIT_VERSIONS, SEED_LIVE_ARM, SEED_RESTRICTED, SEED_WATCHLIST } from "@/mocks/governance";
import { liveEquity } from "@/mocks/pnl";

/** Live strategy's P&L at 13:40 on the demo day (örnek değer). */
const OPENING_DAILY_PNL = 0.0021;

/**
 * Serializable mock session state. Base fixtures (day, runs, chain, P&L) are rebuilt
 * deterministically; only what the session changed lives here and in localStorage, so a
 * reload keeps the story. "Demo verisini sıfırla" clears it.
 */
export const STORAGE_KEY = "kaptan-mock-state";
export const STATE_VERSION = 5;

export type ApprovalPatch = Pick<
  ApprovalCard,
  "status" | "decided_by" | "decided_at" | "decision_comment" | "approved_notional_try"
>;

export interface Injection {
  scenario: DemoScenario;
  atMs: number;
}

export interface MockRisk {
  kill_switch: "off" | "on";
  kill_reason: string | null;
  kill_at: string | null;
  kill_by: string | null;
  halted_today: boolean;
  /** Daily P&L and drawdown overrides set by the loss simulation. */
  daily_pnl_pct: number;
  drawdown_pct: number;
  /** Your first reset confirmation (personal reset, step 1 of 2). */
  reset_first: { at: string; reason: string } | null;
}

export interface MockState {
  v: number;
  startedAtReal: number;
  /** Real-time ms at which each post-13:40 row was released by the live ticker. */
  releasedLate: number[];
  injections: Injection[];
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
  /** Demo: hours the kill-switch reset clock was fast-forwarded (Ayarlar → "zamanı ileri sar"). */
  clockOffsetH: number;
}

export function initialState(nowReal: number): MockState {
  return {
    v: STATE_VERSION,
    startedAtReal: nowReal,
    releasedLate: [],
    injections: [],
    approvals: {},
    orders: [],
    canceledOrderIds: [],
    notes: [],
    risk: {
      kill_switch: "off",
      kill_reason: null,
      kill_at: null,
      kill_by: null,
      halted_today: false,
      daily_pnl_pct: OPENING_DAILY_PNL,
      drawdown_pct: liveEquity(OPENING_DAILY_PNL).drawdown,
      reset_first: null,
    },
    positionsManagedByExit: false,
    limitVersions: [...SEED_LIMIT_VERSIONS],
    auditAppends: [],
    restricted: [...SEED_RESTRICTED],
    watchlist: [...SEED_WATCHLIST],
    liveArm: { ...SEED_LIVE_ARM },
    verifiedAt: null,
    ticketMarks: {},
    clockOffsetH: 0,
  };
}

/** Read persisted state; anything missing, stale or malformed starts fresh. */
export function loadState(storage: Pick<Storage, "getItem"> | null, nowReal: number): MockState {
  if (!storage) return initialState(nowReal);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState(nowReal);
    const parsed = JSON.parse(raw) as Partial<MockState>;
    if (parsed.v !== STATE_VERSION || typeof parsed.startedAtReal !== "number") return initialState(nowReal);
    return { ...initialState(nowReal), ...parsed } as MockState;
  } catch {
    return initialState(nowReal);
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
