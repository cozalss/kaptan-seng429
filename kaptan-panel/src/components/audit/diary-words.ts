import type { AuditEntry } from "@/lib/domain";
import { isPerson } from "@/lib/actors";
import { fmtInt } from "@/lib/format";
import { dayLabel, istanbulDay } from "@/lib/session-day";
import { addDays } from "@/lib/time";

/** The words and the cuts of the diary (/gecmis), as pure functions. */
export type Scope = "today" | "all";

/** The screen's one sentence, from the count of the view on screen. */
export function historySentence({ scope, total, searching }: { scope: Scope; total: number; searching: boolean }): string {
  if (searching) return total === 0 ? "Aramana uyan kayıt yok." : `Aramana uyan ${fmtInt(total)} kayıt var.`;
  if (scope === "all") return total === 0 ? "Henüz bir şey olmadı." : `Başından beri ${fmtInt(total)} şey oldu; hepsi burada.`;
  if (total === 0) return "Bugün henüz bir şey olmadı.";
  if (total === 1) return "Bugün tek bir şey oldu; o da burada.";
  return `Bugün ${fmtInt(total)} şey oldu; hepsi burada.`;
}

export interface DayGroup<T> {
  /** The Istanbul day, YYYY-MM-DD. */
  day: string;
  rows: T[];
}

/** Consecutive entries of one Istanbul day, in the order given (newest first). Never mutates. */
export function dayGroups<T extends Pick<AuditEntry, "occurred_at">>(rows: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const r of rows) {
    const day = istanbulDay(Date.parse(r.occurred_at));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else groups.push({ day, rows: [r] });
  }
  return groups;
}

/** "Bugün", "Dün" or "8 Ocak Cuma". */
export function dayHeading(day: string, today: string | null): string {
  if (today && day === today) return "Bugün";
  if (today && day === addDays(today, -1)) return "Dün";
  return dayLabel(day);
}

/** The diary has two voices. */
export type Voice = "sen" | "kaptan";

export function voiceOf(actor: string): Voice {
  return isPerson(actor) ? "sen" : "kaptan";
}

/** Under KAPtan's own name a sentence need not name it again: "KAPtan 3 duyuru okudu." → "3 duyuru okudu." */
export function inVoice(sentence: string): string {
  if (!sentence.startsWith("KAPtan ")) return sentence;
  const rest = sentence.slice("KAPtan ".length);
  return `${rest.charAt(0).toLocaleUpperCase("tr-TR")}${rest.slice(1)}`;
}
