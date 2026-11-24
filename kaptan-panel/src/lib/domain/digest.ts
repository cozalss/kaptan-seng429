import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "./common";
import { SignalTone } from "./signal";

/**
 * The day's important disclosures (GET /me/digest?day=). Mirrored in backend/src/kaptan/domain/schemas/digest.py.
 * Information, not trade advice: the notable KAP disclosures of every company, picked by KAP's own subject names
 * (no model, no guessing). A disclosure that cannot be classified with confidence is not in the list.
 */
export const DIGEST_KINDS = ["restriction", "insider", "contract", "earnings", "dividend", "capital", "merger", "buyback"] as const;
export const DigestKind = z.enum(DIGEST_KINDS);
export type DigestKind = z.infer<typeof DigestKind>;

export const DigestItem = z.object({
  disclosure_index: z.number().int().positive(),
  kind: DigestKind,
  ticker: Ticker,
  company_name: z.string(),
  /** What happened, in one plain line. Numbers appear only when they were read reliably. */
  line: z.string(),
  /** The company's own KAP title, when it gave one. */
  headline: z.string().nullable(),
  published_at: IsoDateTime,
  source_url: z.string().url(),
  /** "held" = you own it, "watched" = you follow it, null = neither. */
  why: z.enum(["held", "watched"]).nullable(),
  /** true = the company is outside the list KAPtan follows. */
  outside_list: z.boolean(),
  /** The plain tag for that (KAPtan gives no suggestion, or analyses it because you watch it). */
  outside_note: z.string().nullable(),
  /** The same tone, so-what and suggestion as everywhere else (see signal.ts). */
  tone: SignalTone,
  so_what_tr: z.string().nullable(),
  suggestion_tr: z.string().nullable(),
  /** Opens this disclosure in the reading drawer. */
  panel_path: z.string(),
});
export type DigestItem = z.infer<typeof DigestItem>;

export const DigestKindCount = z.object({ kind: DigestKind, title: z.string(), count: z.number().int().positive() });
export type DigestKindCount = z.infer<typeof DigestKindCount>;

export const Digest = z.object({
  day: IsoDate,
  is_trading_day: z.boolean(),
  /** Said above the list when the market is closed ("Borsa kapalı; son işlem gününün duyuruları."). */
  note: z.string().nullable(),
  /** The trading day before and after `day` (next is null when it is still in the future). */
  prev_day: IsoDate,
  next_day: IsoDate.nullable(),
  total: z.number().int().nonnegative(),
  /** true = the list was cut at the first 400. */
  truncated: z.boolean(),
  kinds: z.array(DigestKindCount),
  /** Held first, then watched, then the rest; inside each by kind, then newest. */
  items: z.array(DigestItem),
});
export type Digest = z.infer<typeof Digest>;
