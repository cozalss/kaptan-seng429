import { fmtShortDate, NBSP } from "@/lib/format";
import type { SuggestionAction } from "./overview";

/**
 * Plain Turkish for the home: money as "1.250,00 ₺" / "3.000 ₺", a signed change as
 * "+18.612 ₺", confidence as one word. No jargon on this screen.
 */
const lira0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const lira2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "3.000 ₺" (default) or "1.250,00 ₺" with `decimals`. */
export function fmtLira(n: number, decimals = false): string {
  const body = decimals ? lira2.format(n) : lira0.format(Math.round(n));
  return `${body.replace("-", "−")}${NBSP}₺`;
}

/** The headline figure split so the kuruş can be set smaller: { whole: "1.018.612", cents: "40" }. */
export function liraParts(n: number): { whole: string; cents: string } {
  const [whole = "0", cents = "00"] = lira2.format(Math.abs(n)).split(",");
  return { whole: n < 0 ? `−${whole}` : whole, cents };
}

/** "+18.612 ₺" / "−2.300 ₺" / "0 ₺". */
export function fmtSignedLira(n: number): string {
  const r = Math.round(n);
  if (r === 0) return `0${NBSP}₺`;
  return `${r > 0 ? "+" : "−"}${lira0.format(Math.abs(r))}${NBSP}₺`;
}

/** "1,02 mn ₺" / "850 bin ₺" — chart axis ticks. */
export function fmtLiraShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1_000_000)}${NBSP}mn${NBSP}₺`;
  if (abs >= 1_000) return `${lira0.format(Math.round(n / 1_000))}${NBSP}bin${NBSP}₺`;
  return fmtLira(n);
}

export type ConfidenceWord = "Güçlü" | "Orta" | "Zayıf";

/** 0–1 → one word: ≥ 0,7 Güçlü · ≥ 0,45 Orta · else Zayıf. */
export function confidenceWord(c: number): ConfidenceWord {
  if (c >= 0.7) return "Güçlü";
  if (c >= 0.45) return "Orta";
  return "Zayıf";
}

/** How sure KAPtan is, as a sentence anyone reads the same way. Even the strongest is not a promise. */
export function confidenceSentence(c: number): string {
  const word = confidenceWord(c);
  if (word === "Güçlü") return "KAPtan buna güveniyor, ama garanti değil.";
  return word === "Orta" ? "KAPtan orta derecede emin." : "KAPtan pek emin değil.";
}

/** The verb on a suggestion card. */
export const ACTION_WORD: Readonly<Record<SuggestionAction, string>> = { al: "AL", tut: "TUT", sat: "SAT" };

/** What approving says, quietly: "THYAO alımını onayladın." */
export function approvedSentence(action: SuggestionAction, symbol: string): string {
  if (action === "al") return `${symbol} alımını onayladın.`;
  if (action === "sat") return `${symbol} satışını onayladın.`;
  return `${symbol} elinde kalıyor.`;
}

/** What "Geç" says: "THYAO önerisini geçtin." */
export function skippedSentence(symbol: string): string {
  return `${symbol} önerisini geçtin.`;
}

/** "11 Oca" for an ISO time or a YYYY-MM-DD date. */
export function dayLabel(isoOrDate: string): string {
  return fmtShortDate(isoOrDate);
}

/** "FARAZİ ENERJİ DAĞITIM A.Ş." → "Farazi Enerji Dağıtım A.Ş." (Turkish casing; A.Ş. stays). */
export function titleTr(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[A-ZÇĞİÖŞÜ]\.[A-ZÇĞİÖŞÜ]\.?$/u.test(w) ? w : w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1).toLocaleLowerCase("tr-TR")))
    .join(" ");
}
