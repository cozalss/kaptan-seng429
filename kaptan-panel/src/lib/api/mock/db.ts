import type { ChainFields } from "@/lib/audit-chain";
import { EventBus } from "@/lib/sse/bus";
import { initialState, loadState, saveState, type MockState } from "./state";
import { nowMs } from "./selectors";

/**
 * The mock "database": one MockState plus the event bus. Every write goes through
 * `update()` (immutable: a new state object each time), is persisted, and may emit events.
 */
export interface Actor {
  uid: string;
  name: string;
  role: "analyst" | "risk_officer" | "admin" | "auditor";
}

export class MockDb {
  private state: MockState;
  readonly bus = new EventBus();
  private readonly storage: Storage | null;

  constructor(storage: Storage | null, realNow: number = Date.now()) {
    this.storage = storage;
    this.state = loadState(storage, realNow);
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

  /** Re-read from storage (another tab or a role switch may have written it). */
  reload(realNow: number = Date.now()): void {
    this.state = loadState(this.storage, realNow);
  }

  reset(realNow: number = Date.now()): void {
    this.state = initialState(realNow);
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

/** One MockDb per browser tab. On the server a throwaway instance is returned. */
export function getMockDb(): MockDb {
  if (typeof window === "undefined") return new MockDb(null);
  singleton ??= new MockDb(browserStorage());
  return singleton;
}

/** Test helper: replace the singleton. */
export function __setMockDb(db: MockDb | null): void {
  singleton = db;
}
