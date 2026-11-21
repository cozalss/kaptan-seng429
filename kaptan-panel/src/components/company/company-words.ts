import type { Company, Decision, Following } from "@/lib/company/company";
import { dayLabel, daysBetween } from "@/lib/agenda/agenda";
import { fmtSignedFigurePct } from "@/lib/format";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";

/**
 * The words of a company's page, pure. One plain sentence first: what the company is, which
 * sector, and whether KAPtan follows it (and why not, in plain words).
 */
export function companyName(name: string): string {
  return titleTr(shortName(name));
}

/**
 * `watched` is the person's own star (İzlediklerim), which can change on the page: the sentence follows it,
 * so the button and the words never say opposite things.
 */
export function followingSentence(f: Following, watched?: boolean): string {
  if (!f.known) return "KAPtan bu şirketi henüz tanımıyor; bildirimlerini okur ama alım satım önermez.";
  if (f.in_universe && watched === false)
    return "Bu şirket izleme listende değil. KAPtan yine de haberine bakar, gerekirse sana öneri çıkarır.";
  if (f.in_universe) return "KAPtan bu şirketi izliyor: haberine bakar, gerekirse sana öneri çıkarır.";
  const why = f.reasons_tr[0];
  return `KAPtan bu şirket için öneri çıkarmaz.${why ? ` ${why}` : ""}`;
}

export function introSentence(c: Pick<Company, "name" | "sector" | "following">): string {
  const sector = c.sector ? `${c.sector} alanında çalışan` : "borsada işlem gören";
  return `${companyName(c.name)}, ${sector} bir şirket. ${followingSentence(c.following)}`;
}

/** The headline of the page: the price in one phrase, or an honest "no price yet". */
export function priceHeadline(price: Company["price"]): string {
  if (price.last_close === null) return "Bu şirket için henüz fiyat kaydım yok.";
  const change = price.change_pct === null ? "" : `, bir önceki güne göre ${fmtSignedFigurePct(price.change_pct / 100)}`;
  return `Son kapanış ${price.last_close.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺${change}.`;
}

export const DECISION_LABEL: Readonly<Record<Decision, string>> = {
  suggested: "Öneri çıkardım",
  held: "Tutmanı önerdim",
  no_trade: "İşlem önermedim",
  vetoed: "Uzak durdum",
};

/** Period summary for a screen reader: first and last close of the drawn line. */
export function lineSummary(points: ReadonlyArray<{ d: string; close: number }>): string {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return "Çizecek kadar fiyat kaydı yok.";
  const change = first.close > 0 ? (last.close / first.close - 1) * 100 : 0;
  return `${first.d} ile ${last.d} arası ${points.length} günlük kapanış; ${fmtSignedFigurePct(change / 100)}.`;
}

/**
 * Which close the page's prices are: the company page reads daily closes, Param reads the latest price of the day, so
 * this line names the day and never a clock time ("Fiyatlar 8 Ocak Cuma kapanışından."). Pure.
 */
export function closeAgeSentence(lastDay: string, today: string): string {
  const n = daysBetween(lastDay, today);
  const which = n <= 0 ? "bugünün" : n === 1 ? "dünün" : dayLabel(lastDay, today);
  return `Fiyatlar ${which} kapanışından. Param, gün içinde daha yeni bir fiyat gösterebilir.`;
}
