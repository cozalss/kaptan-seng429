/**
 * Turkish formatting. Every number in the UI goes through these (tr-TR: 1.240 lot,
 * 48,32 TL, %18). Times are shown in Europe/Istanbul.
 */
const TZ = "Europe/Istanbul";

/** No-break space: "48,32 TL" never breaks between the figure and its unit. */
export const NBSP = "\u00a0";

const intFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

export function fmtInt(n: number): string {
  return intFmt.format(n);
}

export function fmtDec(n: number, digits = 2): string {
  if (digits === 2) return dec2.format(n);
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** 48,32 TL (no-break space before the unit) */
export function fmtPrice(n: number): string {
  return `${dec2.format(n)}${NBSP}TL`;
}

/** 59.917 TL (no decimals for notional amounts). */
export function fmtTry(n: number): string {
  return `${intFmt.format(Math.round(n))}${NBSP}TL`;
}

/** 0,4M · 1,2 mn style compact counts. */
export function fmtCompact(n: number): string {
  return compactFmt.format(n);
}

/** Ratio → "%18" / "%4,2" / "−%1,1". Turkish puts % before the number. */
export function fmtPct(ratio: number, digits = 1): string {
  const value = Math.abs(ratio * 100);
  const body = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
  // Sign only when the printed number is not zero ("−%0" would be noise).
  const sign = ratio < 0 && Math.round(value * 10 ** digits) > 0 ? "−" : "";
  return `${sign}%${body}`;
}

/** Signed percent: "+%1,4" / "−%3,6" / "%0". */
export function fmtSignedPct(ratio: number, digits = 1): string {
  if (ratio > 0) return `+${fmtPct(ratio, digits)}`;
  return fmtPct(ratio, digits);
}

/**
 * THE rule for a percent that is a figure (a return, a day's change, a share of the money), on every screen:
 * one decimal, always printed ("%5,0" next to "%5,1", never "%5"), and two under one percent so a small move
 * does not read as nothing ("%0,84", "%0,31"). Zero is "%0". Limits and settings keep `fmtPct`.
 */
export function fmtFigurePct(ratio: number, fixed?: 1 | 2): string {
  const v = Math.abs(ratio * 100);
  const digits = fixed ?? (v < 1 ? 2 : 1);
  const rounded = Math.round(v * 10 ** digits) / 10 ** digits;
  if (rounded === 0) return "%0";
  const body = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rounded);
  return `${ratio < 0 ? "−" : ""}%${body}`;
}

/**
 * The figure rule with its sign: "+%1,9" / "−%1,9" / "+%0,84" / "%0". A row of small moves read side by side
 * (daily returns) passes `fixed = 2` so every figure in the row has the same decimals ("+%0,85" next to "−%1,04").
 */
export function fmtSignedFigurePct(ratio: number, fixed?: 1 | 2): string {
  const s = fmtFigurePct(ratio, fixed);
  return ratio > 0 && s !== "%0" ? `+${s}` : s;
}

/** Basis points → "38 bp". */
export function fmtBps(bps: number): string {
  return `${intFmt.format(Math.round(bps))} bp`;
}

const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const timeSecFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
// One date style on every screen: "11 Ocak 2027" (and "11 Oca" on chart axes), never "11.01.2027".
const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const dateLongFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric", weekday: "long" });
const shortDateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short" });

export function fmtTime(iso: string, withSeconds = false): string {
  return (withSeconds ? timeSecFmt : timeFmt).format(new Date(iso));
}

export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtDateLong(iso: string): string {
  return dateLongFmt.format(new Date(iso));
}

/** "11 Oca" — chart axes. Accepts YYYY-MM-DD too. */
export function fmtShortDate(isoOrDate: string): string {
  const iso = isoOrDate.length === 10 ? `${isoOrDate}T09:00:00Z` : isoOrDate;
  return shortDateFmt.format(new Date(iso));
}

const yearOf = (isoOrDate: string) => isoOrDate.slice(0, 4);

/** "11 Oca" or, with `withYear`, "11 Oca 2027": a chart's day. Accepts YYYY-MM-DD too. */
export function fmtChartDay(isoOrDate: string, withYear: boolean): string {
  return withYear ? `${fmtShortDate(isoOrDate)} ${yearOf(isoOrDate)}` : fmtShortDate(isoOrDate);
}

/** True when a chart's days run across a new year: then every day it prints carries its year. */
export function crossesYear(first: string, last: string): boolean {
  return yearOf(first) !== yearOf(last);
}

/** The two ends of a chart's time axis: "15 Eki" / "11 Oca", with the year when the span crosses one. */
export function axisEnds(first: string, last: string): [string, string] {
  const y = crossesYear(first, last);
  return [fmtChartDay(first, y), fmtChartDay(last, y)];
}

/** "2 sa 14 dk" / "14 dk 05 sn" / "süresi doldu". */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return "süresi doldu";
  const totalS = Math.floor(ms / 1000);
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${String(m).padStart(2, "0")} dk`;
  return `${m} dk ${String(s).padStart(2, "0")} sn`;
}

/** Latency: "820 ms" / "2,4 sn". */
export function fmtLatency(ms: number): string {
  if (ms < 1000) return `${intFmt.format(ms)} ms`;
  return `${fmtDec(ms / 1000, 1)} sn`;
}

/** Shorten a hash for chips: "9f3c…e71a". */
export function shortHash(hash: string, head = 4, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** Turkish-aware uppercase for JS strings (CSS text-transform covers markup). */
export function upperTr(text: string): string {
  return text.toLocaleUpperCase("tr-TR");
}
