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
