import { z } from "zod";
import { EventType, IsoDateTime, Ticker, Confidence } from "./common";

/** 07 §9 disclosures. `ingest_source: "demo"` = an injected fixture ("DEMO FİKSTÜRÜ"). */
export const DisclosureClass = z.enum(["ODA", "FR", "DG", "DKB", "DUY"]);
export const DisclosureReason = z.enum(["NEW", "UPD", "CORR", "CANC"]);
export const SubjectRoute = z.union([
  z.enum(["noise", "E1", "E2", "E3", "E4", "llm", "archive_only"]),
  z.string().regex(/^avoid:[a-z_]+$/),
]);
export type SubjectRoute = z.infer<typeof SubjectRoute>;
export const IngestSource = z.enum(["live", "backfill", "reconcile", "demo"]);

export const Disclosure = z.object({
  disclosure_index: z.number().int().positive(),
  disclosure_oid: z.string(),
  stock_codes: z.array(Ticker),
  related_stocks: z.array(Ticker),
  primary_ticker: Ticker.nullable(),
  company_name: z.string(),
  disclosure_class: DisclosureClass,
  disclosure_type: z.string(),
  subject: z.string(),
  summary: z.string(),
  reason: DisclosureReason,
  related_index: z.number().int().positive().nullable(),
  is_late: z.boolean(),
  attachment_count: z.number().int().nonnegative(),
  has_multilang: z.boolean(),
  is_noise: z.boolean(),
  subject_route: SubjectRoute,
  subject_map_version: z.string(),
  published_at: IsoDateTime,
  first_seen_at: IsoDateTime,
  available_at: IsoDateTime,
  ingest_source: IngestSource,
});
export type Disclosure = z.infer<typeof Disclosure>;

/** Row in the inbox list: the disclosure plus its classification and counts. */
export const DisclosureListItem = Disclosure.extend({
  classification: z
    .object({
      event_type: EventType,
      confidence: Confidence,
      method: z.enum(["subject_map", "llm"]),
    })
    .nullable(),
  run_id: z.string().nullable(),
  linked_news_count: z.number().int().nonnegative(),
  note_count: z.number().int().nonnegative(),
});
export type DisclosureListItem = z.infer<typeof DisclosureListItem>;

export const DisclosureText = z.object({ lang: z.enum(["tr", "en"]), body: z.string() });
export type DisclosureText = z.infer<typeof DisclosureText>;

export const Note = z.object({
  id: z.string(),
  disclosure_index: z.number().int().positive(),
  author: z.string(),
  body: z.string().min(1).max(1000),
  created_at: IsoDateTime,
});
export type Note = z.infer<typeof Note>;

export const DisclosureDetail = DisclosureListItem.extend({
  texts: z.array(DisclosureText),
  notes: z.array(Note),
});
export type DisclosureDetail = z.infer<typeof DisclosureDetail>;

/** Live counters for "today" (US-43; FRONTEND-SPEC §9 Ç-12). */
export const DayCounters = z.object({
  as_of: IsoDateTime,
  total: z.number().int().nonnegative(),
  noise: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  e_candidates: z.number().int().nonnegative(),
  proposals: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  rejections: z.number().int().nonnegative(),
  llm_calls: z.number().int().nonnegative(),
  llm_tokens: z.number().int().nonnegative(),
});
export type DayCounters = z.infer<typeof DayCounters>;
