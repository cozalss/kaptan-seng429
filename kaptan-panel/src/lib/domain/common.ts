import { z } from "zod";

/** ISO 8601 timestamp (UTC "Z" or an explicit offset). Shown in Europe/Istanbul. */
export const IsoDateTime = z.iso.datetime({ offset: true });
/** Calendar date, YYYY-MM-DD. */
export const IsoDate = z.iso.date();

export const Ticker = z.string().regex(/^[A-Z0-9]{3,6}$/, "ticker");
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "sha256");

/** Event codes used by the rule engine (05). FILTER = X, IGNORE = O in the eval docs (FRONTEND-SPEC §9 Ç-2). */
export const EventCode = z.enum(["E1", "E2", "E3", "E4"]);
export type EventCode = z.infer<typeof EventCode>;
export const EventType = z.enum(["E1", "E2", "E3", "E4", "FILTER", "IGNORE"]);
export type EventType = z.infer<typeof EventType>;

export const AgentStatus = z.enum(["ok", "abstain"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const SourceQuote = z.object({ field: z.string(), quote: z.string().min(1) });
export type SourceQuote = z.infer<typeof SourceQuote>;

export const AbstainReason = z.enum([
  "insufficient_text",
  "ambiguous",
  "out_of_scope",
  "conflicting_values",
  "suspected_injection",
  "attachment_missing",
  "other",
]);
export const AbstainInfo = z.object({ reason: AbstainReason, detail_tr: z.string() });
export type AbstainInfo = z.infer<typeof AbstainInfo>;

export const AgentName = z.enum(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance"]);
export type AgentName = z.infer<typeof AgentName>;

export const AgentRunMeta = z.object({
  agent: AgentName,
  prompt_id: z.string(),
  prompt_version: z.string(),
  prompt_sha256: Sha256Hex,
  model_id: z.string(),
  degraded: z.boolean(),
  input_sha256: Sha256Hex,
  output_sha256: Sha256Hex,
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  cached: z.boolean(),
  repair_attempted: z.boolean(),
  quote_check: z.enum(["pass", "partial", "fail", "n/a"]),
});
export type AgentRunMeta = z.infer<typeof AgentRunMeta>;

export const Confidence = z.number().min(0).max(1);

/** Generic page envelope for list endpoints. */
export function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
  });
}
export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
