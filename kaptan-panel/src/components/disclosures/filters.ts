/**
 * The filters of Okunanlar live in the address, so a view can be shared, reloaded and gone back to:
 *   ?gun=2026-11-20&sirket=THYAO&tur=E3&islem=1&kimler=izlediklerim&bildirim=123
 * Everything here is pure; the screen reads and writes the address with it.
 */
export const TYPES = ["E1", "E2", "E3", "E4", "IGNORE"] as const;
export type TypeFilter = (typeof TYPES)[number];

/** What KAPtan thought a disclosure was, in the words a person uses. */
export const TYPE_LABEL: Readonly<Record<TypeFilter, string>> = {
  E1: "Şirket kendi hissesini geri aldı",
  E2: "Yönetici ya da ana ortak hisse aldı",
  E3: "Yeni iş ya da ihale",
  E4: "Kâr ya da zarar açıkladı",
  IGNORE: "Önemsiz bulduklarım",
};

export type Whose = "izlediklerim" | "benim";

export interface Filters {
  day: string | null;
  company: string | null;
  type: TypeFilter | null;
  acted: boolean;
  whose: Whose | null;
  open: number | null;
}

export const NO_FILTERS: Filters = { day: null, company: null, type: null, acted: false, whose: null, open: null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z0-9]{3,6}$/;

/** Anything odd in the address is dropped, never trusted. */
export function parseFilters(params: Pick<URLSearchParams, "get">): Filters {
  const day = params.get("gun");
  const company = (params.get("sirket") ?? "").toLocaleUpperCase("tr-TR");
  const type = params.get("tur");
  const whose = params.get("kimler");
  const open = Number(params.get("bildirim"));
  return {
    day: day && DAY.test(day) && !Number.isNaN(Date.parse(day)) ? day : null,
    company: TICKER.test(company) ? company : null,
    type: (TYPES as readonly string[]).includes(type ?? "") ? (type as TypeFilter) : null,
    acted: params.get("islem") === "1",
    whose: whose === "izlediklerim" || whose === "benim" ? whose : null,
    open: Number.isInteger(open) && open > 0 ? open : null,
  };
}

/** The query string for a state ("" when nothing is set). */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.day) p.set("gun", f.day);
  if (f.company) p.set("sirket", f.company);
  if (f.type) p.set("tur", f.type);
  if (f.acted) p.set("islem", "1");
  if (f.whose) p.set("kimler", f.whose);
  if (f.open) p.set("bildirim", String(f.open));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** True when a filter the server applies is on (the day alone and the open reading are not filters). */
export function isNarrowed(f: Filters): boolean {
  return Boolean(f.company || f.type || f.acted || f.whose);
}

/** What the API gets for a state. */
export function toQuery(f: Filters): { ticker?: string; type?: string; acted?: boolean; scope?: "watchlist" | "mine" } {
  return {
    ticker: f.company ?? undefined,
    type: f.type ?? undefined,
    acted: f.acted || undefined,
    scope: f.whose === "izlediklerim" ? "watchlist" : f.whose === "benim" ? "mine" : undefined,
  };
}
