import type { CorporateNotice, CorporateRecord, NoticeKind } from "@/lib/domain/corporate";
import { fmtLira } from "@/lib/solo/words";

/**
 * Plain Turkish for company actions: the sentence a KAP notice becomes (the same words the backend
 * writes in `portfolio/corporate_notices.py`), and one line per thing the person recorded.
 */
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

/** "2026-12-03" -> "3 Aralık". */
export function dayWords(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** "12,50" with the kuruş only when there is one. */
const liraAmount = (x: number) => fmtLira(x, !Number.isInteger(x)).replace(/\s*₺$/, "");

export interface NoticeFacts {
  kind: NoticeKind;
  per_share_gross_try: number | null;
  pay_date: string | null;
  bonus_pct: number | null;
}

/** One calm sentence; only facts that were read appear in it. */
export function noticeHeadline(ticker: string, f: NoticeFacts): string {
  if (f.kind === "dividend") {
    const parts: string[] = [];
    if (f.per_share_gross_try !== null) parts.push(`hisse başı ${liraAmount(f.per_share_gross_try)} ₺ brüt`);
    if (f.pay_date !== null) parts.push(`ödeme ${dayWords(f.pay_date)}`);
    const detail = parts.length ? `: ${parts.join(", ")}` : "";
    return `${ticker} kâr payı dağıtacağını açıkladı${detail}. Hesabına geçince buraya yaz.`;
  }
  if (f.kind === "bonus") {
    const pct = f.bonus_pct === null ? "" : `: her 100 paya ${liraAmount(f.bonus_pct)} yeni pay`;
    return `${ticker} bedelsiz pay dağıtacağını açıkladı${pct}. Paylar hesabına geçince yeni adedini buraya yaz.`;
  }
  if (f.kind === "rights") return `${ticker} bedelli sermaye artırımı duyurdu. Katılırsan aldığın payları buraya yaz.`;
  return `${ticker} payını bölüyor. Yeni adedin hesabına geçince buraya yaz.`;
}

export const KIND_WORDS = { dividend: "Kâr payı", bonus: "Bedelsiz pay", rights: "Bedelli pay" } as const;

/** One record as a sentence: "KRGCL: 850 ₺ kâr payı geldi." */
export function recordSentence(r: CorporateRecord): string {
  const who = r.ticker;
  const undo = r.corrects !== null;
  if (r.kind === "dividend") return undo ? `${who}: kâr payı kaydını geri aldın.` : `${who}: ${fmtLira(r.net_try ?? 0, true)} kâr payı geldi.`;
  if (r.kind === "bonus") return undo ? `${who}: bedelsiz pay kaydını geri aldın.` : `${who}: ${r.qty_added} yeni pay geldi, toplam ${r.qty_after} adet. Maliyetin aynı kaldı.`;
  return undo ? `${who}: bedelli pay kaydını geri aldın.` : `${who}: ${r.qty_added} pay aldın, ${fmtLira(r.net_try ?? 0, true)} ödedin.`;
}

export const noticeSource = (n: Pick<CorporateNotice, "url">) => n.url;
