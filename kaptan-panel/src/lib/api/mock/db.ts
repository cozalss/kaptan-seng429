import type { ChainFields } from "@/lib/audit-chain";
import type { AuditEntry } from "@/lib/domain";
import { EventBus } from "@/lib/sse/bus";
import { initialState, loadState, saveState, type MockState } from "./state";
import { auditChain, nowMs } from "./selectors";

/**
 * The mock "database": one MockState plus the event bus. Every write goes through
 * `update()` (immutable: a new state object each time), is persisted, and may emit events.
 */
/** The signed-in person. */
export interface Actor {
  uid: string;
  name: string;
}

export class MockDb {
  private state: MockState;
  readonly bus = new EventBus();
  private readonly storage: Storage | null;
  /** The last chain built and what it was built from (appends + tamper flag). */
  private chain: { appends: MockState["auditAppends"]; tamperOn: boolean; entries: readonly AuditEntry[] } | null = null;

  /** `fresh`: start as a new install with no starting money (tests of the first-run screen). */
  constructor(storage: Storage | null, realNow: number = Date.now(), fresh = false) {
    this.storage = storage;
    this.state = loadState(storage, realNow, fresh);
  }

  get snapshot(): MockState {
    return this.state;
  }

  nowIso(realNow: number = Date.now()): string {
    return new Date(nowMs(this.state, realNow)).toISOString();
  }

  update(fn: (s: MockState) => MockState): MockState {
    this.state = fn(this.state);
    saveState(this.storage, this.state);
    return this.state;
  }

  /**
   * The audit chain, built lazily and only again when an entry was appended or the tamper
   * test flipped. Only the ledger list, verify, tamper and append paths read it; every other
   * screen never pays for 4.812 hashes.
   */
  auditChain(): readonly AuditEntry[] {
    const { auditAppends, tamperOn } = this.state;
    const memo = this.chain;
    if (memo && memo.appends === auditAppends && memo.tamperOn === tamperOn) return memo.entries;
    const entries = auditChain(this.state);
    this.chain = { appends: auditAppends, tamperOn, entries };
    return entries;
  }

  /** Re-read from storage (another tab may have written it). */
  reload(realNow: number = Date.now()): void {
    this.state = loadState(this.storage, realNow);
  }

  reset(realNow: number = Date.now(), fresh = false): void {
    this.state = initialState(realNow, fresh);
    saveState(this.storage, this.state);
  }

  audit(actor: string, action: string, entity_type: string, entity_id: string, payload: Record<string, unknown>, run_id: string | null = null): void {
    const entry: Omit<ChainFields, "chain_pos"> = {
      occurred_at: this.nowIso(),
      actor,
      action,
      entity_type,
      entity_id,
      run_id,
      strategy_version: run_id ? "v1.1-fwd" : null,
      payload,
    };
    this.update((s) => ({ ...s, auditAppends: [...s.auditAppends, entry] }));
  }
}

let singleton: MockDb | null = null;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A browser test sets this key to "1" before the first load to begin as a new install (no starting money yet). */
export const FRESH_KEY = "kaptan-mock-fresh";

function wantsFresh(storage: Storage | null): boolean {
  try {
    return storage?.getItem(FRESH_KEY) === "1";
  } catch {
    return false;
  }
}

/** One MockDb per browser tab. On the server a throwaway instance is returned. */
export function getMockDb(): MockDb {
  if (typeof window === "undefined") return new MockDb(null);
  const storage = browserStorage();
  singleton ??= new MockDb(storage, Date.now(), wantsFresh(storage));
  return singleton;
}

/** Test helper: replace the singleton. */
export function __setMockDb(db: MockDb | null): void {
  singleton = db;
}
