import type { TriageStateName } from "@/lib/domain/reading";
import type { SignalItem, SignalList, SignalTone } from "@/lib/domain/signal";
import { ROUTES } from "@/lib/nav";

/** The small words and rules of the "important" screens (home strip, Okunanlar, brief, alerts). Pure. */
export const TONE_LABEL: Readonly<Record<SignalTone, string>> = {
  olumlu: "Olumlu",
  olumsuz: "Olumsuz",
  notr: "Nötr",
  belirsiz: "Belirsiz",
};

export const TRIAGE_LABEL: Readonly<Record<TriageStateName, string>> = {
  yapilacak: "Yapılacak",
  sonra: "Sonra oku",
  tamam: "Tamam",
};
export const TRIAGE_ORDER: readonly TriageStateName[] = ["yapilacak", "sonra", "tamam"];

/** Keyboard shortcuts of the list (desktop): j / k move, a / s / d set the state of the row in focus. */
export const TRIAGE_KEYS: Readonly<Record<string, TriageStateName>> = { a: "yapilacak", s: "sonra", d: "tamam" };
export const SHORTCUT_HELP: readonly { keys: string; does: string }[] = [
  { keys: "j / k", does: "Sonraki / önceki duyuruya geç" },
  { keys: "Enter", does: "Duyuruyu aç" },
  { keys: "a", does: "Yapılacak" },
  { keys: "s", does: "Sonra oku" },
  { keys: "d", does: "Tamam" },
];

/** The state a key asks for, or null when the key is not one of ours (or a modifier is held). */
export function triageForKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): TriageStateName | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return TRIAGE_KEYS[e.key.toLowerCase()] ?? null;
}

/** j / k: the next index in a list of `length`, staying inside it. -1 = nothing focused yet. */
export function moveFocus(current: number, length: number, key: string): number {
  if (length === 0) return -1;
  if (key === "j") return Math.min(current + 1, length - 1);
  if (key === "k") return Math.max(current <= 0 ? 0 : current - 1, 0);
  return current;
}

/** Swipe on a phone: right = Tamam, left = Sonra oku, once the finger went far enough sideways. */
export const SWIPE_PX = 72;
export function swipeState(dx: number, dy: number): TriageStateName | null {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? "tamam" : "sonra";
}

/** "Senin hisselerinde bugün": mine, important, not already done. */
export function stripItems(list: SignalList | null): SignalItem[] {
  return (list?.items ?? []).filter((i) => i.mine !== null && i.triage !== "tamam");
}

/** The ones the strip does not show, for the card under it (no duplicates between the two). */
export function withoutStrip<T extends { disclosure_index: number }>(items: readonly T[], strip: readonly SignalItem[]): T[] {
  const shown = new Set(strip.map((s) => s.disclosure_index));
  return items.filter((i) => !shown.has(i.disclosure_index));
}

/** How many important ones are not mine, for "N başka önemli duyuru var". */
export function otherCount(list: SignalList | null): number {
  return list?.other_count ?? 0;
}

/** The sentence under an empty strip. */
export const NOTHING_MINE = "Bugün senin hisselerinde önemli bir şey yok.";

/** What a desktop notification says: the company and its line (it stays on this computer). */
export function signalAlertBody(s: Pick<SignalItem, "ticker" | "company_name" | "line_tr">): string {
  return `${s.ticker ?? s.company_name}: ${s.line_tr}`;
}

export interface BurstAlert {
  body: string;
  /** One disclosure: opens it in the drawer. Several: the list of important ones. */
  path: string;
}

/** One alert for a burst: "THYAO ve 2 şirket daha" with a link to the list; one item opens that disclosure. */
export function burstAlert(items: readonly SignalItem[]): BurstAlert | null {
  const first = items[0];
  if (!first) return null;
  if (items.length === 1) return { body: signalAlertBody(first), path: first.panel_path };
  const names = new Set(items.map((i) => i.ticker ?? i.company_name));
  const lead = first.ticker ?? first.company_name;
  const more = names.size - 1;
  return { body: more > 0 ? `${lead} ve ${more} şirket daha` : `${lead}: ${items.length} yeni önemli duyuru`, path: ROUTES.bildirimler };
}

/** What the "Dinle" button reads aloud: each item as one short sentence, mine first. */
export function listenLines(items: readonly SignalItem[], lead: string | null = null): string[] {
  const lines = items.map((i) => {
    const who = i.company_name.replace(/\s+(A\.?Ş\.?|ANONİM ŞİRKETİ)$/i, "").trim();
    const parts = [`${who}. ${i.line_tr}`, i.so_what_tr, i.suggestion_tr];
    return parts.filter((p): p is string => Boolean(p)).join(" ");
  });
  return lead ? [lead, ...lines] : lines;
}
