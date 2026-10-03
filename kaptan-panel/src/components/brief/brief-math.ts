import type { MorningBrief } from "@/lib/domain";
import { addDays, isTradingDay } from "@/lib/time";

/** ?tarih=YYYY-MM-DD, accepted only when it is a real calendar date (else today). */
export function parseBriefDate(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** The last `n` sessions up to and including `today` (newest first) for the date picker. */
export function recentSessions(today: string, n = 5): string[] {
  const out: string[] = [];
  for (let d = today; out.length < n; d = addDays(d, -1)) if (isTradingDay(d)) out.push(d);
  return out;
}

export type WarningLevel = MorningBrief["risk_warnings"][number]["level"];

const LEVEL_ORDER: Readonly<Record<WarningLevel, number>> = { critical: 0, warn: 1, info: 2 };

/** Critical first, then warnings, then information (stable within a level). */
export function sortWarnings<T extends { level: WarningLevel }>(ws: readonly T[]): T[] {
  return ws
    .map((w, i) => ({ w, i }))
    .sort((a, b) => LEVEL_ORDER[a.w.level] - LEVEL_ORDER[b.w.level] || a.i - b.i)
    .map((x) => x.w);
}

/** Section counts for the masthead index line. */
export function briefIndex(b: MorningBrief): Array<{ n: number; label: string }> {
  return [
    { n: b.important_disclosures.length, label: "önemli bildirim" },
    { n: b.orders_for_open.length, label: "açılış emri" },
    { n: b.pending_approvals.length, label: "bekleyen onay" },
    { n: b.expiring_today.length, label: "bugün çıkış" },
    { n: b.restriction_changes.length, label: "tedbir değişikliği" },
  ];
}

export const RESTRICTION_KIND_TR: Readonly<Record<string, string>> = {
  vbts_brut_takas: "VBTS brüt takas",
  vbts_aciga_satis: "VBTS açığa satış yasağı",
  vbts_kredili_islem: "VBTS kredili işlem yasağı",
  vbts_tek_fiyat: "VBTS tek fiyat",
  spk_tedbir: "SPK tedbiri",
  trading_halt: "İşlem durdurma",
  team_insider: "Ekip engel listesi",
  other: "Diğer kısıt",
};
