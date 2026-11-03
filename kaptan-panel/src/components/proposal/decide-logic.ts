import { fmtInt } from "@/lib/format";
import type { Suggestion, SuggestionAction } from "@/lib/solo/overview";

/**
 * The pure rules behind deciding on a suggestion. The screen answers at once (optimistically) and
 * can be wrong: every answer is a "flight" until the server has spoken. A failed flight comes
 * back to the front of the queue with its error. Nothing here touches React or the API.
 */
export type Answer = "approve" | "skip";

export interface Flight {
  id: string;
  symbol: string;
  action: SuggestionAction;
  answer: Answer;
  /** "sending": the server has not spoken yet. "done": it said yes. */
  phase: "sending" | "done";
}

export interface DecideState {
  flights: readonly Flight[];
  /** The plain error of an answer that came back, by suggestion id. */
  errors: Readonly<Record<string, string>>;
  /** The suggestion the person picked from the queue (or the one that just came back). */
  front: string | null;
}

export const EMPTY_DECIDE: DecideState = { flights: [], errors: {}, front: null };

/** How long the ink seal takes to land. With the 180 ms reveal after it, the moment stays under 600 ms. */
export const SEAL_MS = 380;
/** Geç: how long the quiet slide away is on screen. It never holds up the next object. */
export const LEAVE_MS = 200;

/** How long the object waits for the press to land before it may turn into the next step. */
export function holdMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : SEAL_MS;
}

const without = (errors: DecideState["errors"], id: string) => Object.fromEntries(Object.entries(errors).filter(([key]) => key !== id));

export function pressAnswer(state: DecideState, s: Suggestion, answer: Answer): DecideState {
  if (state.flights.some((f) => f.id === s.id)) return state;
  const flight: Flight = { id: s.id, symbol: s.symbol, action: s.action, answer, phase: "sending" };
  return { flights: [...state.flights, flight], errors: without(state.errors, s.id), front: state.front === s.id ? null : state.front };
}

export function settleAnswer(state: DecideState, id: string): DecideState {
  return { ...state, flights: state.flights.map((f) => (f.id === id ? { ...f, phase: "done" } : f)) };
}

export function failAnswer(state: DecideState, id: string, message: string): DecideState {
  return { flights: state.flights.filter((f) => f.id !== id), errors: { ...state.errors, [id]: message }, front: id };
}

export function bringToFront(state: DecideState, id: string): DecideState {
  return { ...state, front: id };
}

/** Who is being decided on now and who waits behind it. Answered ones have left both. */
export function splitDecisions(list: readonly Suggestion[], state: DecideState): { front: Suggestion | null; queue: Suggestion[] } {
  const flying = new Set(state.flights.map((f) => f.id));
  const open = list.filter((s) => !flying.has(s.id));
  const front = open.find((s) => s.id === state.front) ?? open[0] ?? null;
  return { front, queue: open.filter((s) => s !== front) };
}

export type NextStep<T> = { kind: "gone" } | { kind: "sealing" } | { kind: "line" } | { kind: "preparing" } | { kind: "enter"; ticket: T };

/** What an answered object has become. A skip leaves nothing behind; an approval never ends in silence. */
export function stepFor<T>(flight: Pick<Flight, "action" | "answer" | "phase">, at: { landed: boolean; ticket: T | null }): NextStep<T> {
  if (flight.answer === "skip") return { kind: "gone" };
  if (flight.phase === "sending" || !at.landed) return { kind: "sealing" };
  if (flight.action === "tut") return { kind: "line" };
  return at.ticket ? { kind: "enter", ticket: at.ticket } : { kind: "preparing" };
}

/** Which buttons are open, and the plain reason when one is not. */
export function closedFor({ stopped, halted }: { stopped: boolean; halted: boolean }): { canApprove: boolean; canSkip: boolean; reason: string | null } {
  if (stopped) return { canApprove: false, canSkip: false, reason: "İşlemler durduruldu. Yeniden başlatana kadar öneri onaylanamaz; elindeki hisseler yerinde duruyor." };
  if (halted) return { canApprove: false, canSkip: true, reason: "Paran bugün %1'den fazla düştüğü için bugün yeni işlem yok. Yarın kendiliğinden açılır; istersen geçebilirsin." };
  return { canApprove: true, canSkip: true, reason: null };
}

/** The sentence over the decisions: what to do now. The bank goes first because it has a clock. */
export function sectionSentence({ decisions, steps, stopped }: { decisions: number; steps: number; stopped: boolean }): string {
  if (stopped) return "İşlemler durdu; şimdilik karar yok.";
  if (steps > 0 && decisions > 0) return `Önce ${steps > 1 ? `bu ${fmtInt(steps)} işlemi` : "bu işlemi"} bankana gir, sonra ${fmtInt(decisions)} kararın var.`;
  if (steps > 0) return steps > 1 ? `Bankana girmen gereken ${fmtInt(steps)} işlem var.` : "Bankana girmen gereken bir işlem var.";
  if (decisions > 0) return `Bugün ${fmtInt(decisions)} kararın var.`;
  return "Bugün karar vermen gereken bir şey yok.";
}
