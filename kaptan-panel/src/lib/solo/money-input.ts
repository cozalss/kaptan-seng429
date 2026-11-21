import { MAX_MONEY_TRY } from "./money";

/**
 * Money as a person types it. Turkish writing: dots group the lira, a comma starts the kuruş
 * ("1.250,50"). A pasted "1250.5" or "1,250.50" is understood too. The figure is read once, from
 * its digits, so no arithmetic ever touches it on the way in; anything that is not one plain
 * positive amount is `null`, never NaN.
 */
const JUNK = /[\s  ₺]|TL/gi;

/** "1.250.000" style: one to three digits, then groups of exactly three. */
const GROUPED = /^\d{1,3}(\.\d{3})+$/;

function normalise(raw: string): string | null {
  const t = raw.replace(JUNK, "");
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  if (dots && commas) {
    // Whichever comes last is the decimal mark; the other one groups thousands.
    const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    const group = decimal === "," ? "." : ",";
    const [whole = "", frac = "", ...rest] = t.split(decimal);
    if (rest.length) return null;
    const wholeDotted = whole.split(group).join(".");
    if (!GROUPED.test(wholeDotted)) return null;
    return `${whole.split(group).join("")}.${frac}`;
  }
  if (commas === 1) return t.replace(",", ".");
  if (commas > 1) return GROUPED.test(t.replace(/,/g, ".")) ? t.replace(/,/g, "") : null;
  if (dots === 0) return t;
  // Only dots: "1.250" and "1.250.000" are thousands; a lone dot before 1, 2 or 4+ digits is a decimal mark.
  if (GROUPED.test(t) && !t.startsWith("0")) return t.replace(/\./g, "");
  return dots === 1 ? t : null;
}

/** The amount in a typed or pasted text; null when it is not one plain, non-negative figure. */
export function parseMoney(raw: string, maxDecimals = 2): number | null {
  const n = normalise(raw);
  if (n === null) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(n);
  if (!m || (m[2]?.length ?? 0) > maxDecimals) return null;
  const value = Number(n);
  return Number.isFinite(value) ? value : null;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * What the field shows while the person types: the lira grouped with dots, the comma and the
 * kuruş as typed (at most `maxDecimals`). Dots in the input are only grouping here; a typed dot
 * that means "kuruş" is turned into a comma by the field before this runs.
 */
export function formatMoneyDraft(raw: string, maxDecimals = 2): string {
  // A leading minus is kept (as "−") so the field can refuse it with words instead of silently dropping it.
  const sign = /^\s*[-−]/.test(raw) ? "−" : "";
  const kept = raw.replace(/[^\d,]/g, "");
  const at = kept.indexOf(",");
  const whole = (at < 0 ? kept : kept.slice(0, at)).replace(/^0+(?=\d)/, "");
  if (at < 0) return `${sign}${group(whole)}`;
  const frac = kept.slice(at + 1).replace(/,/g, "").slice(0, maxDecimals);
  return `${sign}${group(whole || "0")},${frac}`;
}

/** A number as the field writes it: "1.250,50", "5.000" (no kuruş when there is none). */
export function moneyDraftOf(n: number, maxDecimals = 2): string {
  const fixed = n.toFixed(maxDecimals);
  const [whole = "0", frac = ""] = fixed.split(".");
  const kurus = maxDecimals > 2 ? frac.replace(/0+$/, "").padEnd(2, "0") : frac;
  return /^0*$/.test(kurus) ? group(whole) : `${group(whole)},${kurus}`;
}

/** Where the caret belongs after formatting: behind the same number of typed characters (digits and the comma). */
export function caretAfterFormat(before: string, caret: number, after: string): number {
  const typed = (s: string) => s.replace(/[^\d,]/g, "").length;
  const want = typed(before.slice(0, caret));
  if (want === 0) return 0;
  let seen = 0;
  for (let i = 0; i < after.length; i += 1) {
    if (/[\d,]/.test(after[i] ?? "")) seen += 1;
    if (seen === want) return i + 1;
  }
  return after.length;
}

const lira0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/** The field's own error, in plain words; null when the text is a usable amount. */
/** A typed minus: refused with words, never silently dropped (a "−5" must not become "5 ₺ ekledin"). */
export const NEGATIVE_MONEY = "Tutarı eksi işareti olmadan yaz.";

export function moneyError(raw: string, opts: { max?: number; maxDecimals?: number } = {}): string | null {
  const max = opts.max ?? MAX_MONEY_TRY;
  if (!raw.trim()) return "Bir tutar yaz.";
  if (/^\s*[-−]/.test(raw)) return NEGATIVE_MONEY;
  const n = parseMoney(raw, opts.maxDecimals ?? 2);
  if (n === null) return "Tutarı rakamla yaz. Örneğin 1.250,50";
  if (n <= 0) return "Tutar sıfırdan büyük olmalı.";
  if (n > max) return `Bu kadar büyük bir tutar girilemiyor. En çok ${lira0.format(max)} ₺ yazabilirsin.`;
  return null;
}

const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"] as const;
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"] as const;
const SCALES = ["", "bin", "milyon", "milyar", "trilyon"] as const;

function underThousand(n: number): string[] {
  const h = Math.floor(n / 100);
  const words: string[] = [];
  if (h > 0) words.push(...(h === 1 ? ["yüz"] : [ONES[h] ?? "", "yüz"]));
  const t = TENS[Math.floor((n % 100) / 10)];
  if (t) words.push(t);
  const o = ONES[n % 10];
  if (o) words.push(o);
  return words;
}

function wholeInWords(n: number): string {
  if (n === 0) return "sıfır";
  const words: string[] = [];
  let rest = n;
  for (let scale = SCALES.length - 1; scale >= 0; scale -= 1) {
    const unit = 1000 ** scale;
    const part = Math.floor(rest / unit);
    rest -= part * unit;
    if (part === 0) continue;
    // "bin", never "bir bin"; every other scale says its one ("bir milyon").
    if (!(scale === 1 && part === 1)) words.push(...underThousand(part));
    if (SCALES[scale]) words.push(SCALES[scale] ?? "");
  }
  return words.join(" ");
}

/** "bin iki yüz elli lira elli kuruş": the amount read out, so a slipped zero is heard before it is sent. */
export function liraInWords(n: number): string {
  const kurusTotal = Math.round(Math.abs(n) * 100);
  const lira = Math.floor(kurusTotal / 100);
  const kurus = kurusTotal % 100;
  if (lira === 0 && kurus > 0) return `${wholeInWords(kurus)} kuruş`;
  return kurus > 0 ? `${wholeInWords(lira)} lira ${wholeInWords(kurus)} kuruş` : `${wholeInWords(lira)} lira`;
}
