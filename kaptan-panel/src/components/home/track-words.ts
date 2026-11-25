import type { TrackDecision, TrackItem } from "@/lib/domain/reports";
import { fmtInt } from "@/lib/format";

/** "KAPtan'ın önerdikleri" on the home, from the track record the panel already reads. Pure. */

export const RECENT_SHOWN = 5;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

/** What the person did, in one or two words. */
export const DID_WORD: Readonly<Record<TrackDecision, string>> = {
  took: "Aldın",
  approved_open: "Onayladın",
  not_bought: "Onayladın, almadın",
  declined: "Reddettin",
  skipped: "Geçtin",
  expired: "Cevap vermedin",
  waiting: "Bekliyor",
  cancelled: "İptal oldu",
};

/** Bought: the result is what happened. Otherwise it is what would have happened if the person had followed it. */
export function isIfFollowed(d: TrackDecision): boolean {
  return d !== "took" && d !== "approved_open";
}

/** Newest first, at most `n`. */
export function recentTrack(items: readonly TrackItem[], n = RECENT_SHOWN): TrackItem[] {
  return [...items].sort((a, b) => b.suggested_at.localeCompare(a.suggested_at)).slice(0, n);
}

/** One plain sentence over the last 30 days; only results that are known are counted as wins. */
export function trackSentence(items: readonly TrackItem[], nowMs: number): string {
  const recent = items.filter((i) => nowMs - Date.parse(i.suggested_at) <= WINDOW_DAYS * DAY_MS);
  if (recent.length === 0) return items.length ? `Son 30 günde öneri yok; daha önce ${fmtInt(items.length)} öneri vardı.` : "Henüz öneri yok.";
  const known = recent.filter((i) => i.status === "done" && i.return_ratio !== null);
  const head = `Son 30 günde ${fmtInt(recent.length)} öneri`;
  if (known.length === 0) return `${head}; sonuçları henüz belli değil.`;
  const won = known.filter((i) => (i.return_ratio ?? 0) > 0).length;
  return `${head}; sonucu belli olan ${fmtInt(known.length)} önerinin ${fmtInt(won)} tanesi kazandırdı.`;
}

/** The biggest move among the shown rows, so their bars share one scale. 0 when none is known. */
export function barScale(items: readonly TrackItem[]): number {
  return items.reduce((m, i) => (i.return_ratio === null ? m : Math.max(m, Math.abs(i.return_ratio))), 0);
}
