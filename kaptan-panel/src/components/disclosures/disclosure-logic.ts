import type { DisclosureListItem } from "@/lib/domain";
import { MAX_DISCLOSURES } from "@/lib/api/limits";

/** What happened to a disclosure, the way the flow strip counts it. */
export type DisclosureFate = "noise" | "archived" | "processed";

/** Pure. Noise stops at the filter; a disclosure with a run was looked at closely; the rest is filed. */
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

export interface HourGroup {
  /** "13" (Istanbul hour of the first row). */
  hour: string;
  /** "13:00–14:00". */
  label: string;
  rows: DisclosureListItem[];
}

/** Istanbul hour ("09"…"23") of an ISO time (UTC+3 all year). */
function hourOf(iso: string): string {
  return String(new Date(Date.parse(iso) + 3 * 3_600_000).getUTCHours()).padStart(2, "0");
}

/** Pure. Consecutive rows of the same Istanbul hour, in the list's order (newest first). */
export function groupByHour(rows: readonly DisclosureListItem[]): HourGroup[] {
  const groups: HourGroup[] = [];
  for (const r of rows) {
    const hour = hourOf(r.published_at);
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) last.rows.push(r);
    else groups.push({ hour, label: `${hour}:00–${String((Number(hour) + 1) % 24).padStart(2, "0")}:00`, rows: [r] });
  }
  return groups;
}
