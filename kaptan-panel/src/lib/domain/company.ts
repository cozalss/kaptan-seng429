import { z } from "zod";
import { DisclosureListItem, DisclosureText } from "./disclosure";
import { IsoDate, IsoDateTime, Ticker } from "./common";

/**
 * A company's page, search and the watchlist (GET /companies/{ticker}, /search, /watchlist). Mirrored
 * in backend/src/kaptan/domain/schemas/{company,watchlist}.py. Lives in `lib/domain`
 * so the contract export (JSON Schemas for the backend tests) covers it.
 */
export const PERIODS = ["1m", "3m", "1y", "all"] as const;
export const Period = z.enum(PERIODS);
export type Period = z.infer<typeof Period>;

export const PERIOD_LABEL: Readonly<Record<Period, string>> = { "1m": "1A", "3m": "3A", "1y": "1Y", all: "Tümü" };

/**
 * A period from a link: the key ("3m") or the label the person sees on the button ("3A", "tümü"), any case.
 * Anything else gives null, and the screen falls back to its default.
 */
export function periodFromParam(raw: string | null): Period | null {
  if (!raw) return null;
  const v = raw.trim().toLocaleLowerCase("tr-TR");
  const hit = PERIODS.find((p) => p === v || PERIOD_LABEL[p].toLocaleLowerCase("tr-TR") === v || (p === "all" && v === "tumu"));
  return hit ?? null;
}

export const Following = z.object({ in_universe: z.boolean(), known: z.boolean(), reasons_tr: z.array(z.string()) });
export type Following = z.infer<typeof Following>;

export const PricePoint = z.object({ d: IsoDate, close: z.number() });
export type PricePoint = z.infer<typeof PricePoint>;

export const PriceLine = z.object({
  period: Period,
  points: z.array(PricePoint),
  last_close: z.number().nullable(),
  last_day: IsoDate.nullable(),
  change_pct: z.number().nullable(),
});
export type PriceLine = z.infer<typeof PriceLine>;

/** The quiet numbers of the stored prices; the year range is corrected for bonus issues. */
export const PriceStats = z.object({
  as_of: IsoDate,
  day_low: z.number().nullable(),
  day_high: z.number().nullable(),
  volume: z.number().nullable(),
  year_low: z.number().nullable(),
  year_high: z.number().nullable(),
  year_low_day: IsoDate.nullable(),
  year_high_day: IsoDate.nullable(),
  /** Stored trading days the year range rests on. */
  year_days: z.number().int().nonnegative(),
  /** The last close against the year high, percent (<= 0). */
  from_high_pct: z.number().nullable(),
  adjusted: z.boolean(),
});
export type PriceStats = z.infer<typeof PriceStats>;

export const PriceBenchmark = z.object({ name: z.string(), points: z.array(PricePoint) });
export type PriceBenchmark = z.infer<typeof PriceBenchmark>;

/** A KAP disclosure KAPtan classed as a buyback (E1) or an insider / main-owner purchase (E2). */
export const InsiderEvent = z.object({ kind: z.enum(["buyback", "insider"]), disclosure: DisclosureListItem });
export type InsiderEvent = z.infer<typeof InsiderEvent>;

export const OwnPosition = z.object({
  qty: z.number().int().positive(),
  avg_cost: z.number(),
  last_price: z.number().nullable(),
  gain_try: z.number().nullable(),
  gain_pct: z.number().nullable(),
  since: IsoDateTime,
});
export type OwnPosition = z.infer<typeof OwnPosition>;

export const DECISIONS = ["suggested", "held", "no_trade", "vetoed"] as const;
export const Decision = z.enum(DECISIONS);
export type Decision = z.infer<typeof Decision>;

export const PastDecision = z.object({
  run_id: z.string(),
  disclosure_index: z.number().int().positive(),
  decision: Decision,
  event_type: z.string().nullable(),
  why_tr: z.string(),
  at: IsoDateTime,
  proposal_id: z.string().nullable(),
  approval_status: z.string().nullable(),
  side: z.enum(["buy", "sell"]).nullable(),
});
export type PastDecision = z.infer<typeof PastDecision>;

export const Company = z.object({
  ticker: Ticker,
  name: z.string(),
  sector: z.string().nullable(),
  market: z.string().nullable(),
  following: Following,
  watched: z.boolean(),
  price: PriceLine,
  stats: PriceStats.nullable(),
  benchmark: PriceBenchmark.nullable(),
  insiders: z.array(InsiderEvent),
  position: OwnPosition.nullable(),
  disclosures: z.array(DisclosureListItem),
  decisions: z.array(PastDecision),
});
export type Company = z.infer<typeof Company>;

export const CompanyHit = z.object({ ticker: Ticker, name: z.string(), sector: z.string() });
export type CompanyHit = z.infer<typeof CompanyHit>;

export const DisclosureHit = z.object({
  disclosure_index: z.number().int().positive(),
  ticker: Ticker.nullable(),
  company_name: z.string(),
  subject: z.string(),
  published_at: IsoDateTime,
});
export type DisclosureHit = z.infer<typeof DisclosureHit>;

export const SearchResult = z.object({ q: z.string(), companies: z.array(CompanyHit), disclosures: z.array(DisclosureHit) });
export type SearchResult = z.infer<typeof SearchResult>;

export const WatchItem = z.object({
  ticker: Ticker,
  name: z.string(),
  added_at: IsoDateTime,
  last_close: z.number().nullable(),
  price_day: IsoDate.nullable(),
  change_pct: z.number().nullable(),
  newest_disclosure_at: IsoDateTime.nullable(),
});
export type WatchItem = z.infer<typeof WatchItem>;

/** The most companies on the watchlist (the API refuses a 51st with 409 `watchlist_full`). */
export const MAX_WATCHED = 50;

export const DisclosureReading = DisclosureListItem.extend({
  texts: z.array(DisclosureText),
  numbers: z.array(z.object({ name: z.string(), value: z.number() })),
  decision: Decision.nullable(),
  proposal_id: z.string().nullable(),
  approval_status: z.string().nullable(),
  side: z.enum(["buy", "sell"]).nullable(),
});
export type DisclosureReading = z.infer<typeof DisclosureReading>;
