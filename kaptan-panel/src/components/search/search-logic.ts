import type { SearchResult } from "@/lib/company/company";
import { href } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";

/** One line of the results, in the order shown: companies first, then disclosures. */
export interface SearchRow {
  key: string;
  to: string;
  title: string;
  sub: string;
  kind: "company" | "disclosure";
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
