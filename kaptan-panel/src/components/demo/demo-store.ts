import { clampIndex, DEMO_STEPS } from "./demo-steps";

/**
 * Guided demo state, shared by the overlay, the ⌘K palette and /admin. Lives in
 * sessionStorage so a role switch, a refresh or "Demo verisini sıfırla" (full reload)
 * keeps the presenter on the same step. Immutable: every change makes a new object.
 */
export interface DemoState {
  active: boolean;
  index: number;
  startedAt: number;
  autoplay: boolean;
  minimized: boolean;
  /** Bumped on every step entry so the runner re-plays the step's role/route/action. */
  nonce: number;
}

export const DEMO_STORAGE_KEY = "kaptan-guided-demo";

export const IDLE: DemoState = { active: false, index: 0, startedAt: 0, autoplay: false, minimized: false, nonce: 0 };

let state: DemoState = IDLE;
let loaded = false;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function parseDemoState(raw: string | null): DemoState {
  if (!raw) return IDLE;
  try {
    const p = JSON.parse(raw) as Partial<DemoState>;
    if (typeof p.active !== "boolean" || typeof p.index !== "number" || typeof p.startedAt !== "number") return IDLE;
    return {
      active: p.active,
      index: clampIndex(Math.trunc(p.index)),
      startedAt: p.startedAt,
      autoplay: p.autoplay === true,
      minimized: p.minimized === true,
      nonce: typeof p.nonce === "number" ? p.nonce : 0,
    };
  } catch {
    return IDLE;
  }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  state = parseDemoState(storage()?.getItem(DEMO_STORAGE_KEY) ?? null);
}

function set(next: DemoState): void {
  state = next;
  try {
    storage()?.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the demo still runs, it just won't survive a reload.
  }
  for (const l of listeners) l();
}

export const demoStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): DemoState {
    ensureLoaded();
    return state;
  },
  server(): DemoState {
    return IDLE;
  },
};

export function startGuidedDemo(now: number = Date.now()): void {
  ensureLoaded();
  set({ active: true, index: 0, startedAt: now, autoplay: false, minimized: false, nonce: state.nonce + 1 });
}

export function stopGuidedDemo(): void {
  ensureLoaded();
  set({ ...IDLE, nonce: state.nonce + 1 });
}

export function goToStep(index: number): void {
  ensureLoaded();
  if (!state.active) return;
  set({ ...state, index: clampIndex(index), minimized: false, nonce: state.nonce + 1 });
}

export function nextStep(): boolean {
  ensureLoaded();
  if (!state.active || state.index >= DEMO_STEPS.length - 1) return false;
  goToStep(state.index + 1);
  return true;
}

export function prevStep(): void {
  ensureLoaded();
  if (state.active && state.index > 0) goToStep(state.index - 1);
}

export function setAutoplay(on: boolean): void {
  ensureLoaded();
  if (state.active) set({ ...state, autoplay: on });
}

export function setMinimized(on: boolean): void {
  ensureLoaded();
  if (state.active) set({ ...state, minimized: on });
}

/** Test helper. */
export function __resetDemoStore(): void {
  loaded = false;
  state = IDLE;
  try {
    storage()?.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}
