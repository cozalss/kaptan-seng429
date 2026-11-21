import type { AlertPrefs, AlertTopic, QuietHours } from "@/lib/domain";

/** Minutes since midnight on the Istanbul clock. */
export function istanbulMinuteOfDay(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

const minutesOf = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Is `ms` inside the quiet hours (Istanbul time; a window may cross midnight; equal times = no window)? Mirrors the backend. */
export function inQuiet(quiet: QuietHours, ms: number): boolean {
  if (!quiet.on) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) return false;
  const now = istanbulMinuteOfDay(ms);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** May this computer show a notification of this topic now? */
export function desktopAllowed(
  prefs: AlertPrefs,
  topic: AlertTopic,
  ms: number,
): boolean {
  if (!prefs.kinds[topic].desktop) return false;
  return !inQuiet(prefs.quiet, ms);
}
