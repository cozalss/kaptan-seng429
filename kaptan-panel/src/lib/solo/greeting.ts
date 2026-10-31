import { istanbulDay } from "@/lib/session-day";
import { isTradingDay } from "@/lib/time";

/** Borsa İstanbul's continuous session, in Istanbul minutes (10:00–18:00). */
const OPEN_MIN = 10 * 60;
const CLOSE_MIN = 18 * 60;

/** Istanbul clock minutes of an instant (UTC+3 all year). */
function minutesOf(ms: number): number {
  const d = new Date(ms + 3 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Is the market open at this instant (a session day, inside the session hours)? */
export function marketOpen(ms: number): boolean {
  const m = minutesOf(ms);
  return isTradingDay(istanbulDay(ms)) && m >= OPEN_MIN && m < CLOSE_MIN;
}

/** "Günaydın" / "İyi günler" / "İyi akşamlar" / "İyi geceler" on the Istanbul clock. */
export function greeting(ms: number): string {
  const h = Math.floor(minutesOf(ms) / 60);
  if (h >= 5 && h < 12) return "Günaydın";
  if (h >= 12 && h < 18) return "İyi günler";
  if (h >= 18 && h < 23) return "İyi akşamlar";
  return "İyi geceler";
}
