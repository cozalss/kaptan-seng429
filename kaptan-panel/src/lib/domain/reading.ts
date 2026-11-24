import { z } from "zod";
import { IsoDateTime, Ticker } from "./common";
import { Period, PriceLine, PriceStats } from "./company";

/**
 * Reading marks and the two-company compare (GET /me/reading, /me/reading/saved, /compare). Mirrored in
 * backend/src/kaptan/domain/schemas/reading.py.
 */
export const TriageStateName = z.enum(["yapilacak", "sonra", "tamam"]);
export type TriageStateName = z.infer<typeof TriageStateName>;
export const TriageMark = z.object({ disclosure_index: z.number().int().positive(), state: TriageStateName });
export type TriageMark = z.infer<typeof TriageMark>;

export const ReadingState = z.object({
  read_through: IsoDateTime,
  /** Unread IMPORTANT disclosures of starred or held companies (noise and archive-only are read from the start). */
  unread: z.number().int().nonnegative(),
  /** Unread important ones of other companies, counted apart. */
  unread_other: z.number().int().nonnegative(),
  /** The newest unread ones (at most 500). */
  unread_indexes: z.array(z.number().int().positive()),
  /** "Sonra oku" = the triage state "sonra". */
  saved_indexes: z.array(z.number().int().positive()),
  /** Where the person put important disclosures (newest 500). */
  triage: z.array(TriageMark),
  /** How many are in "yapilacak". */
  act_count: z.number().int().nonnegative(),
});
export type ReadingState = z.infer<typeof ReadingState>;

/** KAP disclosures of the last 90 days by what KAPtan thought they were. */
export const EventCounts = z.object({
  total: z.number().int().nonnegative(),
  buyback: z.number().int().nonnegative(),
  insider: z.number().int().nonnegative(),
  deal: z.number().int().nonnegative(),
  earnings: z.number().int().nonnegative(),
});
export type EventCounts = z.infer<typeof EventCounts>;

export const CompareSide = z.object({
  ticker: Ticker,
  name: z.string(),
  sector: z.string().nullable(),
  price: PriceLine,
  stats: PriceStats.nullable(),
  events: EventCounts,
});
export type CompareSide = z.infer<typeof CompareSide>;

export const Compare = z.object({ period: Period, a: CompareSide, b: CompareSide });
export type Compare = z.infer<typeof Compare>;
