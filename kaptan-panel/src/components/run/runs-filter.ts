import type { RunStatus, RunSummary } from "@/lib/domain";
import { OUTCOME_ORDER, type OutcomeKey } from "./labels";

/**
 * Filtering for the /runs list (FRONTEND-SPEC §2.4, §9 Ç-19). Filter state lives in the URL
 * (?durum, ?sonuc, ?kapsam, ?q, ?demo) so a filtered list can be linked.
 */
export type Scope = "all" | "today" | "history";

export interface RunFilter {
  status: RunStatus | "all";
  outcome: OutcomeKey | "all";
  scope: Scope;
  q: string;
  fixtureOnly: boolean;
}

export const DEFAULT_FILTER: RunFilter = { status: "all", outcome: "all", scope: "all", q: "", fixtureOnly: false };

const STATUSES: readonly RunStatus[] = ["running", "interrupted", "completed", "failed", "hold_quota", "skipped"];

export function parseFilter(params: URLSearchParams): RunFilter {
  const status = params.get("durum");
  const outcome = params.get("sonuc");
  const scope = params.get("kapsam");
  return {
    status: STATUSES.includes(status as RunStatus) ? (status as RunStatus) : "all",
    outcome: OUTCOME_ORDER.includes(outcome as OutcomeKey) ? (outcome as OutcomeKey) : "all",
    scope: scope === "today" || scope === "history" ? scope : "all",
    q: (params.get("q") ?? "").slice(0, 60),
    fixtureOnly: params.get("demo") === "1",
  };
}

export function filterToParams(f: RunFilter): string {
  const p = new URLSearchParams();
  if (f.status !== "all") p.set("durum", f.status);
  if (f.outcome !== "all") p.set("sonuc", f.outcome);
  if (f.scope !== "all") p.set("kapsam", f.scope);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.fixtureOnly) p.set("demo", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Archived (classified O / X, no rule decision) runs share the "NONE" bucket with running ones. */
export function outcomeKey(r: RunSummary): OutcomeKey {
  if (r.outcome === "NO_TRADE" && (r.event_type === "IGNORE" || r.event_type === "FILTER")) return "NONE";
  return r.outcome ?? "NONE";
}

/** Istanbul calendar day of an ISO time (UTC+3, no DST since 2016). */
export function istanbulDay(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
}

function matchesQuery(r: RunSummary, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return true;
  return [r.ticker, r.company_name, r.run_id, String(r.disclosure_index)].some((v) => v.toLocaleLowerCase("tr-TR").includes(needle));
}

export function applyFilter(rows: readonly RunSummary[], f: RunFilter, today: string | null): RunSummary[] {
  return rows.filter((r) => {
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.outcome !== "all" && outcomeKey(r) !== f.outcome) return false;
    if (f.fixtureOnly && !r.is_fixture) return false;
    if (today && f.scope === "today" && istanbulDay(r.started_at) !== today) return false;
    if (today && f.scope === "history" && istanbulDay(r.started_at) === today) return false;
    return matchesQuery(r, f.q);
  });
}

export function countByOutcome(rows: readonly RunSummary[]): Record<OutcomeKey, number> {
  const out = Object.fromEntries(OUTCOME_ORDER.map((k) => [k, 0])) as Record<OutcomeKey, number>;
  for (const r of rows) out[outcomeKey(r)] += 1;
  return out;
}

export interface ListTotals {
  runs: number;
  llmCalls: number;
  tokens: number;
  running: number;
}

export function listTotals(rows: readonly RunSummary[]): ListTotals {
  return {
    runs: rows.length,
    llmCalls: rows.reduce((s, r) => s + r.llm_calls, 0),
    tokens: rows.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0),
    running: rows.filter((r) => r.status === "running").length,
  };
}
