import type { DisclosureListItem } from "@/lib/domain";
import { MAX_DISCLOSURES } from "@/lib/api/limits";

/** What happened to a disclosure, the way the flow strip counts it. */
export type DisclosureFate = "noise" | "archived" | "processed";

export const FATE_LABEL: Readonly<Record<DisclosureFate, string>> = {
  noise: "elendi",
  archived: "arşivlendi",
  processed: "tayfaya gönderildi",
};

/** Pure. Noise stops at the filter; a disclosure with a run went to the crew; the rest is archived. */
export function fateOf(d: Pick<DisclosureListItem, "is_noise" | "run_id">): DisclosureFate {
  if (d.is_noise) return "noise";
  return d.run_id !== null ? "processed" : "archived";
}

export interface FlowCounts {
  total: number;
  noise: number;
  archived: number;
  processed: number;
  e_candidates: number;
  /** The list hit the API's cap: the real day has at least this many. */
  capped: boolean;
}

const EVENT_CODES = new Set(["E1", "E2", "E3", "E4"]);

/** Pure. The flow strip's counts for a day, from that day's list (counters only exist for today). */
export function flowFromList(rows: readonly DisclosureListItem[]): FlowCounts {
  const fates = rows.map(fateOf);
  return {
    total: rows.length,
    noise: fates.filter((f) => f === "noise").length,
    archived: fates.filter((f) => f === "archived").length,
    processed: fates.filter((f) => f === "processed").length,
    e_candidates: rows.filter((r) => r.classification && EVENT_CODES.has(r.classification.event_type)).length,
    capped: rows.length >= MAX_DISCLOSURES,
  };
}

/** The ticker a reader knows the disclosure by. */
export function tickerOf(d: Pick<DisclosureListItem, "primary_ticker" | "stock_codes">): string | null {
  return d.primary_ticker ?? d.stock_codes[0] ?? null;
}
