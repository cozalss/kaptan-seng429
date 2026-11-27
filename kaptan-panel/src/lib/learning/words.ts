import type { LearningCalibration, LearningChange, LearningFold, LearningReport } from "@/lib/domain/learning";
import { fmtDec, fmtFigurePct, fmtInt, fmtPct, fmtTry } from "@/lib/format";

/** "Ne öğrendim" in plain words. Pure: every sentence is built from the report alone. */

/** The page's one big sentence: the latest takeaway, or the honest empty state. */
export function learningSentence(r: LearningReport | null): string {
  if (!r) return "Öğrendiklerimi topluyorum…";
  return r.takeaway_tr ?? "Henüz yeterince karar olgunlaşmadı.";
}

/** Basis points as percentage points with a sign: 41 → "+0,4 puan", −12 → "−0,1 puan", 0 → "0 puan". */
export function pointsWords(bps: number): string {
  const p = Math.round(bps / 10) / 10;
  if (p === 0) return "0 puan";
  return `${p > 0 ? "+" : "−"}${fmtDec(Math.abs(p), 1)} puan`;
}

/** The 95 % range of a gain: "+0,1 ile +0,8 puan arası". */
export function rangeWords(lowBps: number, highBps: number): string {
  return `${pointsWords(lowBps).replace(" puan", "")} ile ${pointsWords(highBps)} arası`;
}

/** A threshold as the rules write it: a share of capital ("%0,25") or an amount ("1.000.000 TL"). */
export function thresholdWords(value: number, unit: "pct" | "try"): string {
  return unit === "pct" ? fmtFigurePct(value) : fmtTry(value);
}

/** "%0,25 → %0,20". */
export function stepWords(c: Pick<LearningChange, "from_value" | "to_value" | "unit">): string {
  return `${thresholdWords(c.from_value, c.unit)} → ${thresholdWords(c.to_value, c.unit)}`;
}

/** How KAPtan's own guesses compared with what happened, in one sentence. */
export function calibrationWords(c: LearningCalibration): string {
  if (!c.active) {
    const start = `Sonucu belli olan karar: ${fmtInt(c.n_matured)} / ${fmtInt(c.needed)}.`;
    return `${start} Tahminler ${fmtInt(c.needed)} karardan sonra düzeltilmeye başlar.`;
  }
  const bias = c.bias_bps === null ? "" : ` Ortalamada gerçek sonuç tahminden ${pointsWords(c.bias_bps)} farklı çıktı.`;
  return `Sonucu belli olan ${fmtInt(c.n_matured)} karar var.${bias} Bu türdeki tahminler ${fmtDec(c.factor, 2)} ile çarpılıyor.`;
}

const YEARS = /^(\d{4})(?:[–-](\d{2}))?\s*→\s*(\d{4})$/;

/** "2022 → 2023" → "2022'den öğrendi, 2023'te denedi"; "2022–23 → 2024" → "2022–2023'ten öğrendi, 2024'te denedi". */
export function foldWords(fold: string): string {
  const m = YEARS.exec(fold.trim());
  if (!m) return fold;
  const [, from, toShort, test] = m;
  const learned = toShort ? `${from}–20${toShort}'ten` : `${from}'den`;
  return `${learned} öğrendi, ${test}'te denedi`;
}

/** Error of the chosen estimate against the plain average: below 1 is better. */
export function errorWords(f: Pick<LearningFold, "error_ratio" | "n_val">): string {
  if (f.error_ratio === null || f.n_val === 0) return "veri yok";
  const diff = Math.round((1 - f.error_ratio) * 1000) / 10;
  if (diff > 0) return `düz ortalamadan %${fmtDec(diff, 1)} daha az yanıldı`;
  if (diff < 0) return `düz ortalamadan %${fmtDec(-diff, 1)} daha çok yanıldı`;
  return "düz ortalama kadar yanıldı";
}

/** One kind in one test: how many examples, and how it went ("452 olayda düz ortalamadan %2,0 daha az yanıldı."). */
export function foldResultWords(f: Pick<LearningFold, "error_ratio" | "n_val" | "n_train">): string {
  if (f.n_val === 0) return "Bu yıl olay yok.";
  if (f.n_train === 0) return `${fmtInt(f.n_val)} olay var ama öğrenecek daha eski olay yoktu.`;
  if (f.error_ratio === null) return `${fmtInt(f.n_val)} olay; ölçülemedi.`;
  return `${fmtInt(f.n_val)} olayda ${errorWords(f)}.`;
}

/** A share 0..1 as "%41"; null as "—". */
export function shareWords(x: number | null): string {
  return x === null ? "—" : fmtPct(x, 0);
}
