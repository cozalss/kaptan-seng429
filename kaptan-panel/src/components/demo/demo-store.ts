import { clampIndex, DEMO_STEPS } from "./demo-steps";

/**
 * Guided demo state, shared by the bar and Ayarlar. Lives in sessionStorage so a reload keeps
 * the presenter on the same step. Immutable: every change makes a new object.
 */
export interface DemoState {
  active: boolean;
  index: number;
  /** Bumped on every step entry so the runner plays the step again. */
  nonce: number;
}

export const DEMO_STORAGE_KEY = "kaptan-guided-demo";
export const IDLE: DemoState = { active: false, index: 0, nonce: 0 };

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
    if (typeof p.active !== "boolean" || typeof p.index !== "number") return IDLE;
    return { active: p.active, index: clampIndex(p.index), nonce: typeof p.nonce === "number" ? p.nonce : 0 };
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

export function startGuidedDemo(): void {
  ensureLoaded();
  set({ active: true, index: 0, nonce: state.nonce + 1 });
}

export function stopGuidedDemo(): void {
  ensureLoaded();
  set({ ...IDLE, nonce: state.nonce + 1 });
}

export function goToStep(index: number): void {
  ensureLoaded();
  if (!state.active) return;
  set({ active: true, index: clampIndex(index), nonce: state.nonce + 1 });
}

export function nextStep(): boolean {
  ensureLoaded();
  if (!state.active || state.index >= DEMO_STEPS.length - 1) return false;
  goToStep(state.index + 1);
  return true;
}

export function prevStep(): boolean {
  ensureLoaded();
  if (!state.active || state.index === 0) return false;
  goToStep(state.index - 1);
  return true;
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
