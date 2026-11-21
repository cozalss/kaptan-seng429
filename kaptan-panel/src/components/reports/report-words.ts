import type { Karne, KarnePeriod, TrackItem } from "@/lib/domain";
import { fmtSignedPct } from "@/lib/format";
import { fmtLira, fmtSignedLira } from "@/lib/solo/words";

/** "2026-11" / "2026" one step back or forward. */
export function shiftPeriod(kind: KarnePeriod, at: string, delta: number): string {
  if (kind === "year") return String(Number(at) + delta);
  const [y = 0, m = 1] = at.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The period the clock is in: "2026-11" or "2026". */
export function currentPeriod(kind: KarnePeriod, today: string): string {
  return kind === "year" ? today.slice(0, 4) : today.slice(0, 7);
}

/** The Karne's one big sentence: what the money did in the period, or why we cannot say. */
export function karneSentence(k: Karne): string {
  if (!k.started) return `${k.label_tr} döneminde henüz başlangıç paran yok.`;
  if (k.gain_try === null) return `${k.label_tr} döneminde paranın ne kadar değiştiğini hesaplayamadım.`;
  const r = Math.round(k.gain_try);
  if (r === 0) return `${k.label_tr} döneminde paran değişmedi.`;
  return `${k.label_tr} döneminde paran ${fmtLira(Math.abs(r))} ${r > 0 ? "arttı" : "azaldı"}.`;
}

/** Plain row labels with what they mean, in reading order; a null figure leaves its row out. */
export function moneyRows(k: Karne): Array<{ key: string; label: string; meaning: string; value: string; tone?: "gain" | "loss" }> {
  const tone = (n: number) => (Math.round(n) > 0 ? ("gain" as const) : Math.round(n) < 0 ? ("loss" as const) : undefined);
  const rows: Array<{ key: string; label: string; meaning: string; value: string; tone?: "gain" | "loss" }> = [
    { key: "put-in", label: "Koyduğun para", meaning: "Bu dönemde eklediğin eksi çektiğin para. Gelir ya da zarar sayılmaz.", value: fmtSignedLira(k.put_in_net) },
  ];
  if (k.value_start !== null) rows.push({ key: "start", label: "Dönem başında paran", meaning: "Önceki günün kapanışındaki toplam değer.", value: fmtLira(k.value_start) });
  if (k.value_end !== null) rows.push({ key: "end", label: k.is_current ? "Şu an paran" : "Dönem sonunda paran", meaning: "Nakit ile hisselerin son bilinen fiyatla değeri.", value: fmtLira(k.value_end) });
  if (k.gain_try !== null) rows.push({ key: "gain", label: "Kazanç ya da kayıp", meaning: "Sonundaki değer eksi başındaki değer eksi koyduğun para.", value: fmtSignedLira(k.gain_try), tone: tone(k.gain_try) });
  rows.push({ key: "realized", label: "Sattıklarından kalan", meaning: "Bu dönemde sattığın hisselerin maliyetinin üstünde ne bıraktığı (komisyon düşülmüş).", value: fmtSignedLira(k.realized_try), tone: tone(k.realized_try) });
  if (k.unrealized_try !== null) rows.push({ key: "unrealized", label: "Hâlâ elindekilerde duran fark", meaning: "Satmadığın hisselerin şu anki değeri eksi maliyeti, aldığın günden beri (yalnız bu dönem değil). Param'daki rakamın aynısı; satana kadar kesinleşmez. Bu yüzden satırlar toplanınca yukarıdaki kazancı vermeyebilir.", value: fmtSignedLira(k.unrealized_try), tone: tone(k.unrealized_try) });
  rows.push({ key: "commission", label: "Ödediğin komisyon", meaning: "Bu dönemdeki alım ve satımlarda bankana ödediklerin.", value: fmtLira(k.commissions_try, true) });
  if (k.dividends_try !== null) rows.push({ key: "dividends", label: "Temettü", meaning: "Hisselerinin sana ödediği nakit. Gerçek bir kazançtır.", value: fmtSignedLira(k.dividends_try), tone: tone(k.dividends_try) });
  return rows;
}

export const signedRatio = (r: number | null): string => (r === null ? "–" : fmtSignedPct(r, 1));

const DECISION_TONE: Record<TrackItem["decision"], string> = {
  took: "took",
  approved_open: "wait",
  not_bought: "skip",
  declined: "skip",
  skipped: "skip",
  expired: "skip",
  waiting: "wait",
  cancelled: "skip",
};
export const decisionTone = (d: TrackItem["decision"]): string => DECISION_TONE[d];
