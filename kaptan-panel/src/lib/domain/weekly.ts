import { z } from "zod";
import { IsoDate } from "./common";
import { Benchmark } from "./reports";

/** GET /me/weekly: one calendar week (Monday to Sunday) of your book and of what KAPtan read. Nulls are unknown. */
export const WeeklySummary = z.object({
  start: IsoDate,
  end: IsoDate,
  label_tr: z.string(),
  /** The week has not ended yet: the numbers are up to now. */
  is_current: z.boolean(),
  started: z.boolean(),
  put_in_net: z.number(),
  value_start: z.number().nullable(),
  value_end: z.number().nullable(),
  /** value_end − value_start − outside money; null when a value is unknown. */
  gain_try: z.number().nullable(),
  dividends_try: z.number().nullable(),
  read: z.number().int().nonnegative(),
  suggestions: z.object({
    made: z.number().int().nonnegative(),
    took: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
  }),
  benchmark: Benchmark,
  alerts_sent: z.number().int().nonnegative(),
  notes_tr: z.array(z.string()),
});
export type WeeklySummary = z.infer<typeof WeeklySummary>;
