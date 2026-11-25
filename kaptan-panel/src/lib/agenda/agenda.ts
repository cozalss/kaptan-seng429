import type { CalendarEvent, EventKind } from "@/lib/domain/agenda";

/** The small words the calendar screens use. Pure, so they can be tested. */
export const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  dividend_pay: "Kâr payı ödemesi",
  dividend_ex: "Kâr payı hakkı",
  general_meeting: "Genel kurul",
  report_window: "Finansal rapor",
  rate_decision: "Faiz kararı",
};

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

function parts(day: string): { y: number; m: number; d: number; wd: number } {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** "Bugün", "Yarın" or "23 Kasım Pazartesi". */
export function dayLabel(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n === 0) return "Bugün";
  if (n === 1) return "Yarın";
  const p = parts(day);
  return `${p.d} ${MONTHS[p.m - 1]} ${WEEKDAYS[p.wd]}`;
}

/** "bugün", "yarın", "3 gün sonra". */
export function inWords(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n <= 0) return "bugün";
  return n === 1 ? "yarın" : `${n} gün sonra`;
}

export interface DayGroup {
  day: string;
  events: CalendarEvent[];
}

export function groupByDay(events: readonly CalendarEvent[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.day === e.day) last.events.push(e);
    else out.push({ day: e.day, events: [e] });
  }
  return out;
}
