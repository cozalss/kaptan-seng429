/** Istanbul market-calendar helpers (UTC+3, no DST since 2016). Pure functions. */
export const ISTANBUL_OFFSET_H = 3;

/** UTC ISO for an Istanbul wall-clock time on a given date ("2027-01-11", "09:50"). */
export function istanbulIso(date: string, hhmm: string, seconds = 0): string {
  const [h, m] = hhmm.split(":").map(Number);
  const utc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    (h ?? 0) - ISTANBUL_OFFSET_H,
    m ?? 0,
    seconds,
  );
  return new Date(utc).toISOString();
}

/** Minutes since Istanbul midnight for a UTC ISO time. */
export function istanbulMinutes(iso: string): number {
  const d = new Date(iso);
  return ((d.getUTCHours() + ISTANBUL_OFFSET_H) % 24) * 60 + d.getUTCMinutes();
}

const HOLIDAYS = new Set(["2026-10-29", "2027-01-01"]);

export function isTradingDay(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !HOLIDAYS.has(date);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextTradingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

export function prevTradingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

export function tradingDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) out.push(d);
  return out;
}

/** Approvals expire at 09:50 of the next session (R15). */
export function approvalExpiry(createdIso: string): string {
  const istanbulDate = new Date(Date.parse(createdIso) + ISTANBUL_OFFSET_H * 3600_000).toISOString().slice(0, 10);
  return istanbulIso(nextTradingDay(istanbulDate), "09:50");
}
