import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";
import { TriageStateName } from "./reading";

/**
 * One meaning of "important" (GET /me/signals, /me/signals/{index}; also inside the morning brief). Mirrored in
 * backend/src/kaptan/domain/schemas/signal.py. A disclosure is important exactly when the digest classifies it;
 * `line_tr` is one plain line (no company name, no guessed numbers), `tone` its direction for the share owner.
 */
export const SignalTone = z.enum(["olumlu", "olumsuz", "notr", "belirsiz"]);
export type SignalTone = z.infer<typeof SignalTone>;
export const SignalMine = z.enum(["held", "watched"]);
export type SignalMine = z.infer<typeof SignalMine>;

export const SignalItem = z.object({
  disclosure_index: z.number().int().positive(),
  ticker: z.string().nullable(),
  company_name: z.string(),
  published_at: IsoDateTime,
  /** Digest kind (buyback, insider, ...); null when the disclosure is not important. */
  kind: z.string().nullable(),
  important: z.boolean(),
  /** held wins over watched. */
  mine: SignalMine.nullable(),
  line_tr: z.string(),
  tone: SignalTone,
  /** "Senin için ne demek": one sentence, or null when nothing honest can be said. */
  so_what_tr: z.string().nullable(),
  /** KAPtan's current word on it ("KAPtan: al önerisi hazır"), or null. */
  suggestion_tr: z.string().nullable(),
  kap_url: z.string(),
  /** Opens THIS disclosure in the reading drawer. */
  panel_path: z.string(),
  triage: TriageStateName.nullable(),
});
export type SignalItem = z.infer<typeof SignalItem>;

export const SignalList = z.object({
  day: IsoDate,
  note: z.string().nullable(),
  mine_count: z.number().int().nonnegative(),
  other_count: z.number().int().nonnegative(),
  /** Mine first (held, then watched), then the rest; newest first inside each. */
  items: z.array(SignalItem),
});
export type SignalList = z.infer<typeof SignalList>;
