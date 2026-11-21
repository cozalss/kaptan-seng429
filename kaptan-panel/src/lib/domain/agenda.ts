import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "./common";

/**
 * The upcoming-events calendar and the market strip (GET /me/calendar, GET /market/strip). Mirrored in
 * backend/src/kaptan/domain/schemas/agenda.py. Only dates that were read from a real source appear.
 */
export const EVENT_KINDS = ["dividend_pay", "dividend_ex", "general_meeting", "report_window", "rate_decision"] as const;
export const EventKind = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKind>;

export const CalendarEvent = z.object({
  id: z.string(),
  day: IsoDate,
  kind: EventKind,
  /** The company the event is about; null for a day that concerns every share (a rate decision). */
  ticker: Ticker.nullable(),
  /** Why it is on the list: "held" = you own it, "watched" = you follow it, null = everyone. */
  why: z.enum(["held", "watched"]).nullable(),
  title: z.string(),
  detail: z.string(),
  /** Where the date was read: a KAP disclosure or the central bank's own calendar. */
  source_url: z.string().nullable(),
  /** true = the exact day is not known (a window guessed from last year), false = the source names the day. */
  approximate: z.boolean(),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export const Calendar = z.object({
  from: IsoDate,
  to: IsoDate,
  events: z.array(CalendarEvent),
  /** Plain words about what is NOT shown and why (a calendar that could not be read). */
  notes: z.array(z.string()),
});
export type Calendar = z.infer<typeof Calendar>;

export const IndexQuote = z.object({
  level: z.number(),
  change_pct: z.number().nullable(),
  day: IsoDate,
});
export type IndexQuote = z.infer<typeof IndexQuote>;

export const FxQuote = z.object({
  rate: z.number(),
  day: IsoDate,
  published_at: IsoDateTime,
});
export type FxQuote = z.infer<typeof FxQuote>;

export const MarketState = z.object({
  open: z.boolean(),
  /** "Borsa açık" / "Borsa kapalı". */
  label: z.string(),
  /** The next time the exchange opens, with its day; null while it is open. */
  next_open_day: IsoDate.nullable(),
});
export type MarketState = z.infer<typeof MarketState>;

export const MarketStrip = z.object({
  as_of: IsoDateTime,
  market: MarketState,
  index: IndexQuote.nullable(),
  usd_try: FxQuote.nullable(),
});
export type MarketStrip = z.infer<typeof MarketStrip>;
