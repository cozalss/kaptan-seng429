import calendarData from "./generated/calendar.json";

/** Istanbul has been UTC+3 all year since 2016. */
const IST_MS = 3 * 3600_000;
const DAY_MS = 86_400_000;

export interface Local {
  /** YYYY-MM-DD in Istanbul. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
}

export function local(nowMs: number): Local {
  const d = new Date(nowMs + IST_MS);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/** Epoch ms of HH:MM Istanbul time on the given Istanbul date. */
export function at(date: string, hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Date.parse(`${date}T00:00:00Z`) + (Number(h) * 60 + Number(m)) * 60_000 - IST_MS;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const HOLIDAYS = new Set<string>(calendarData.holidays);

/** The BIST calendar (generated from backend/src/kaptan/prices/calendar.py). Outside its years: weekdays only. */
export function isTradingDay(date: string): boolean {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const year = Number(date.slice(0, 4));
  if (year < calendarData.first_year || year > calendarData.last_year) return true;
  return !HOLIDAYS.has(date);
}

export function previousTradingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

/** "dd.MM.yyyy" for the KAP list request. */
export function kapDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** "08:45"/"22:00" -> minutes, or null when it is not a clock. */
export function clockMinutes(value: unknown): number | null {
  const m = typeof value === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export interface Quiet {
  on: boolean;
  start: string;
  end: string;
}

/** Same rule as backend alerts/prefs.in_quiet: a window across midnight is fine; start == end is never quiet. */
export function inQuiet(quiet: Quiet, nowMs: number): boolean {
  if (!quiet.on) return false;
  const s = clockMinutes(quiet.start);
  const e = clockMinutes(quiet.end);
  if (s === null || e === null || s === e) return false;
  const cur = local(nowMs).minutes;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function clock(ms: number): string {
  const l = local(ms).minutes;
  return `${String(Math.floor(l / 60)).padStart(2, "0")}:${String(l % 60).padStart(2, "0")}`;
}
