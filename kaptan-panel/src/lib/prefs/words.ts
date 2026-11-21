import { istanbulMinuteOfDay } from "./quiet";

const TZ = "Europe/Istanbul";
const dayFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  weekday: "long",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "25 Kasım Çarşamba" (a pause that ends at midnight is told by its day) or "25 Kasım Çarşamba 14:30". */
export function pauseEndWords(untilIso: string): string {
  const at = new Date(untilIso);
  const day = dayFmt.format(at);
  return istanbulMinuteOfDay(at.getTime()) === 0
    ? day
    : `${day} ${timeFmt.format(at)}`;
}

/** The home's one line while paused. */
export function pauseNoticeSentence(untilIso: string): string {
  return `KAPtan ara verdi: bildirimleri okuyor, öneri getirmiyor. Bitiş: ${pauseEndWords(untilIso)}.`;
}

/** Tomorrow's date (YYYY-MM-DD) on the Istanbul calendar: the earliest "devam etsin" date. */
export function tomorrowIso(nowMs: number): string {
  const next = new Date(nowMs + 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
  return parts;
}

export const QUICK_PAUSE_DAYS: readonly number[] = [3, 7, 14];
