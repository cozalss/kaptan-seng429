import { ROUTES } from "@/lib/nav";

/**
 * The keyboard shortcuts, as data and as a tiny state machine (no DOM here). "g" then a letter goes to a screen;
 * "?" lists them. "/" and Ctrl+K belong to the search and are never bound here.
 */
export interface Shortcut {
  keys: readonly string[];
  label: string;
}

export const GO_KEYS: Readonly<
  Record<string, { path: string; label: string }>
> = {
  a: { path: ROUTES.benim, label: "Ana sayfaya git" },
  p: { path: ROUTES.portfoy, label: "Param’a git" },
  o: { path: ROUTES.bildirimler, label: "Okunanlar’a git" },
  g: { path: ROUTES.gecmis, label: "Geçmiş’e git" },
  y: { path: ROUTES.ayarlar, label: "Ayarlar’a git" },
};

export const SHORTCUTS: readonly Shortcut[] = [
  ...Object.entries(GO_KEYS).map(([key, v]) => ({
    keys: ["g", key],
    label: v.label,
  })),
  { keys: ["j"], label: "Duyuru listesinde sonrakine geç (Okunanlar, ana sayfa)" },
  { keys: ["k"], label: "Duyuru listesinde öncekine geç" },
  { keys: ["a"], label: "Seçili duyuru: Yapılacak" },
  { keys: ["s"], label: "Seçili duyuru: Sonra oku" },
  { keys: ["d"], label: "Seçili duyuru: Tamam" },
  { keys: ["?"], label: "Bu listeyi göster" },
];

/** How long "g" waits for its second key. */
export const CHORD_MS = 1500;

export type KeyAction = { kind: "go"; path: string } | { kind: "help" } | null;
export interface ChordState {
  /** When "g" was pressed (ms); null = not waiting. */
  armedAt: number | null;
}
export const IDLE: ChordState = { armedAt: null };

export interface KeyInput {
  key: string;
  /** Ctrl, Alt or Meta held: never ours. */
  modified: boolean;
  /** The focus is in a field, or a dialog is open: typing is not a shortcut. */
  typing: boolean;
  now: number;
}

/** One key press: the next state and what to do. Pure. */
export function step(
  state: ChordState,
  input: KeyInput,
): { state: ChordState; action: KeyAction } {
  if (input.modified || input.typing) return { state: IDLE, action: null };
  const armed = state.armedAt !== null && input.now - state.armedAt <= CHORD_MS;
  if (armed) {
    const target = GO_KEYS[input.key.toLowerCase()];
    return {
      state: IDLE,
      action: target ? { kind: "go", path: target.path } : null,
    };
  }
  if (input.key === "g") return { state: { armedAt: input.now }, action: null };
  if (input.key === "?") return { state: IDLE, action: { kind: "help" } };
  return { state: IDLE, action: null };
}
