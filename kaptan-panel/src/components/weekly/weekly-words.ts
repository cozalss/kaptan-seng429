import type { WeeklySummary } from "@/lib/domain/weekly";
import { fmtInt } from "@/lib/format";
import { fmtLira, fmtSignedLira } from "@/lib/solo/words";

/** The week's one big sentence: what the money did, or why we cannot say. `label_tr` is "16–22 Kasım 2026". */
export function weeklySentence(w: WeeklySummary): string {
  const when = w.is_current ? "Bu hafta" : w.label_tr;
  if (!w.started) return `${when} için henüz başlangıç paran yok.`;
  if (w.gain_try === null)
    return `${when} paranın ne kadar değiştiğini hesaplayamadım.`;
  const r = Math.round(w.gain_try);
  if (r === 0) return `${when} paran değişmedi.`;
  return `${when} paran ${fmtLira(Math.abs(r))} ${r > 0 ? "arttı" : "azaldı"}.`;
}

export interface WeekRow {
  key: string;
  label: string;
  meaning: string;
  value: string;
  tone?: "gain" | "loss";
}

const toneOf = (n: number) =>
  Math.round(n) > 0
    ? ("gain" as const)
    : Math.round(n) < 0
      ? ("loss" as const)
      : undefined;

/** Plain rows with what each means; a figure that is unknown leaves its row out. */
export function weekRows(w: WeeklySummary): WeekRow[] {
  const rows: WeekRow[] = [];
  if (w.started)
    rows.push({
      key: "put-in",
      label: "Koyduğun para",
      meaning:
        "Bu hafta eklediğin eksi çektiğin para. Gelir ya da zarar sayılmaz.",
      value: fmtSignedLira(w.put_in_net),
    });
  if (w.value_end !== null)
    rows.push({
      key: "end",
      label: w.is_current ? "Şu an paran" : "Haftanın sonunda paran",
      meaning: "Nakit ile hisselerin son bilinen fiyatla değeri.",
      value: fmtLira(w.value_end),
    });
  if (w.gain_try !== null)
    rows.push({
      key: "gain",
      label: "Kazanç ya da kayıp",
      meaning: "Sonundaki değer eksi başındaki değer eksi koyduğun para.",
      value: fmtSignedLira(w.gain_try),
      tone: toneOf(w.gain_try),
    });
  if (w.dividends_try !== null)
    rows.push({
      key: "dividends",
      label: "Temettü",
      meaning: "Hisselerinin sana ödediği nakit. Gerçek bir kazançtır.",
      value: fmtSignedLira(w.dividends_try),
      tone: toneOf(w.dividends_try),
    });
  return rows;
}

/** What KAPtan did this week, in one or two plain sentences. */
export function doneSentence(w: WeeklySummary): string {
  const s = w.suggestions;
  const read = `KAPtan ${fmtInt(w.read)} bildirim okudu.`;
  if (s.made === 0) return `${read} Sana öneri gelmedi.`;
  return `${read} ${fmtInt(s.made)} öneri geldi: ${fmtInt(s.took)} aldın, ${fmtInt(s.skipped)} geçtin, ${fmtInt(s.declined)} reddettin.${s.expired ? ` ${fmtInt(s.expired)} tanesinin süresi doldu.` : ""}${s.waiting ? ` ${fmtInt(s.waiting)} tanesi seni bekliyor.` : ""}`;
}

export function alertsSentence(w: WeeklySummary): string {
  if (w.alerts_sent === 0)
    return "Bu hafta telefonuna ya da e-postana bildirim gitmedi.";
  return `Bu hafta telefonuna ya da e-postana ${fmtInt(w.alerts_sent)} bildirim gitti.`;
}
