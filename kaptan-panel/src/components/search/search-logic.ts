import type { SearchResult } from "@/lib/company/company";
import { foldTr } from "@/lib/company/fold";
import { href, ROUTES } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";

/** One line of the results, in the order shown: companies first, then disclosures. */
export interface SearchRow {
  key: string;
  to: string;
  title: string;
  sub: string;
  kind: "page" | "company" | "disclosure";
}

/** The screens, so a word like "önemli", "takvim" or "yardım" finds a page too. Shown before companies. */
const PAGES: readonly { to: string; title: string; sub: string; words: string }[] = [
  { to: ROUTES.benim, title: "Ana sayfa", sub: "Bugünkü kararların ve paran", words: "ana sayfa bugün öneri karar" },
  { to: ROUTES.oneriler, title: "Öneriye düşenler", sub: "Her öneri, ne yaptığın ve sonucu", words: "öneriler öneri sonuç uysaydın onay" },
  { to: ROUTES.portfoy, title: "Param", sub: "Elindekiler, nakit, para ekle ve çek", words: "param portföy elindekiler nakit para ekle çek döküm" },
  { to: ROUTES.bildirimler, title: "Okunanlar", sub: "Şirketlerinin KAP duyuruları", words: "okunanlar bildirim duyuru kap okunmamış" },
  { to: ROUTES.onemli, title: "Önemli duyurular", sub: "Günün açık ve önemli KAP duyuruları", words: "önemli duyurular günün kap özet" },
  { to: ROUTES.takvim, title: "Takvim", sub: "Bilanço ve genel kurul günleri", words: "takvim bilanço genel kurul temettü tarih" },
  { to: ROUTES.gecmis, title: "Geçmiş", sub: "Verdiğin kararlar", words: "geçmiş karar onay geç kayıt" },
  { to: ROUTES.karne, title: "Aylık karne", sub: "Ayın parası ve kararları", words: "karne aylık ay sonuç" },
  { to: ROUTES.hafta, title: "Haftalık özet", sub: "Bu haftanın parası", words: "haftalık hafta özet" },
  { to: ROUTES.ayarlar, title: "Ayarlar", sub: "Sınırlar, bildirimler, görünüm", words: "ayarlar sınır limit bildirim sustur görünüm tema" },
  { to: ROUTES.yardim, title: "Yardım", sub: "Sözlük, sık sorulanlar, kısayollar", words: "yardım sözlük soru kısayol nasıl" },
];

/** The screens whose name or words start with the query (any word). Pure. */
export function pageRows(query: string): SearchRow[] {
  const q = foldTr(query.trim());
  if (q.length < MIN_QUERY) return [];
  return PAGES.filter((p) => foldTr(`${p.title} ${p.words}`).split(/\s+/).some((w) => w.startsWith(q)) || foldTr(p.title).startsWith(q)).map((p) => ({
    key: `p-${p.to}`,
    to: p.to,
    title: p.title,
    sub: p.sub,
    kind: "page",
  }));
}

/** Every screen, for the palette before anything is typed. Pure. */
export function allPageRows(): SearchRow[] {
  return PAGES.map((p) => ({ key: `p-${p.to}`, to: p.to, title: p.title, sub: p.sub, kind: "page" }));
}

/** Ctrl or Cmd + K, anywhere: the command palette. Checked before `opensSearch`. Pure. */
export function opensPalette(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
}

export const MIN_QUERY = 2;
/** Wait this long after the last key before asking (ms). */
export const TYPING_PAUSE_MS = 180;

/** Where a disclosure hit leads: that day in Okunanlar with the reading open. Pure. */
export function disclosureTarget(index: number, publishedAt: string): string {
  return `/bildirimler?gun=${istanbulDay(Date.parse(publishedAt))}&bildirim=${index}`;
}

export function rowsOf(result: SearchResult | null): SearchRow[] {
  if (!result) return [];
  const companies: SearchRow[] = result.companies.map((c) => ({ key: `c-${c.ticker}`, to: href.company(c.ticker), title: c.name, sub: [c.ticker, c.sector].filter(Boolean).join(" · "), kind: "company" }));
  const disclosures: SearchRow[] = result.disclosures.map((d) => ({
    key: `d-${d.disclosure_index}`,
    to: disclosureTarget(d.disclosure_index, d.published_at),
    title: d.subject,
    sub: d.company_name,
    kind: "disclosure",
  }));
  return [...companies, ...disclosures];
}

/** Does a key press open the search? "/" outside a field, Ctrl or Cmd + K anywhere. Pure. */
export function opensSearch(e: { key: string; ctrlKey: boolean; metaKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): boolean {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") return true;
  const tag = e.target?.tagName?.toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable === true;
  return e.key === "/" && !typing && !e.ctrlKey && !e.metaKey;
}
