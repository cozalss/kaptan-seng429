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

const MINUTE_MS = 60_000;

/**
 * A countdown in full words, never "sa"/"dk": "45 dakika", "1 saat 5 dakika", "20 saat",
 * "2 gün 3 saat". Under a minute: "1 dakikadan az"; at or past zero: "süresi doldu".
 */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "süresi doldu";
  const totalMin = Math.floor(ms / MINUTE_MS);
  if (totalMin < 1) return "1 dakikadan az";
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts: ReadonlyArray<readonly [number, string]> =
    days > 0
      ? [
          [days, "gün"],
          [hours, "saat"],
        ]
      : [
          [hours, "saat"],
          [minutes, "dakika"],
        ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n} ${unit}`)
    .join(" ");
}

/** The Istanbul calendar date (YYYY-MM-DD) of a UTC ISO time. */
function istanbulDate(iso: string): string {
  return new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

const SHORT_DATE = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });

/** "bugün", "yarın", or a short date ("14 Eki") for `iso`, seen from `nowIso`, in Istanbul time. */
export function dayWordTr(iso: string, nowIso: string): string {
  const day = istanbulDate(iso);
  const today = istanbulDate(nowIso);
  if (day === today) return "bugün";
  if (day === addDays(today, 1)) return "yarın";
  return SHORT_DATE.format(new Date(iso));
}
