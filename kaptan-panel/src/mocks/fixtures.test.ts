import { describe, expect, it } from "vitest";
import { DisclosureListItem, Explain } from "@/lib/domain";
import { CLOCK_ANCHOR_MS } from "./clock";
import { dayDisclosures } from "./day";
import { buildExplain } from "./explain-builder";
import { DAY_BY_ANCHOR, DAY_TOTAL, DEMO_E3_RUN } from "./ids";
import { ISSUERS } from "./issuers";
import { DAY_SPECS, HISTORY_SPECS } from "./runs-day";
import { DEMO_SPECS } from "./runs-demo";

describe("day fixture", () => {
  const rows = dayDisclosures();

  it("has 318 schema-valid disclosures in publication order", () => {
    expect(rows).toHaveLength(DAY_TOTAL);
    for (const r of rows) expect(() => DisclosureListItem.parse(r)).not.toThrow();
    const times = rows.map((r) => Date.parse(r.published_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("matches the demo counters at 13:40 (212 · 61 noise · 138 archived · 13 processed)", () => {
    const before = rows.filter((r) => Date.parse(r.published_at) < CLOCK_ANCHOR_MS);
    expect(before).toHaveLength(DAY_BY_ANCHOR.total);
    expect(before.filter((r) => r.is_noise)).toHaveLength(DAY_BY_ANCHOR.noise);
    expect(before.filter((r) => r.run_id !== null)).toHaveLength(DAY_BY_ANCHOR.processed);
    expect(before.filter((r) => !r.is_noise && r.run_id === null)).toHaveLength(DAY_BY_ANCHOR.archived);
  });

  it("is deterministic", () => {
    expect(dayDisclosures()).toBe(rows);
    expect(rows[10]?.disclosure_oid).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("issuers", () => {
  it("are all obviously fictional", () => {
    for (const i of ISSUERS) {
      expect(i.name).toMatch(/^(ÖRNEK|DOĞU|TOROS|KORU|MİSAL|FARAZİ) /);
      expect(i.ticker).toMatch(/^(ORN|DMO|TMS|KRG|MSL|FRZ)/);
    }
  });
});

describe("run specs → Explain", () => {
  const all = [...DEMO_SPECS, ...DAY_SPECS, ...HISTORY_SPECS];

  it.each(all.map((s) => [s.run_id, s] as const))("%s builds a schema-valid Explain", (_id, spec) => {
    const parsed = Explain.safeParse(buildExplain(spec));
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3), null, 2));
    expect(parsed.success).toBe(true);
  });

  it.each(all.filter((s) => s.evidence && s.event).map((s) => [s.run_id, s] as const))("%s: the hit rate agrees with its own events", (_id, spec) => {
    const e = buildExplain(spec);
    const stats = e.evidence_card?.stats;
    if (!stats) throw new Error("no evidence card");
    const rose = e.evidence_events.filter((ev) => ev.car_5d > 0).length;
    expect(e.evidence_events).toHaveLength(stats.n);
    expect(Math.round(stats.hit_rate_5d * stats.n)).toBe(rose);
    expect(e.approval?.evidence_summary.hit_rate_5d ?? stats.hit_rate_5d).toBe(stats.hit_rate_5d);
  });

  it("Uyum names the exact point it wants a person to look at", () => {
    const e4 = buildExplain(DAY_SPECS.find((s) => s.run_id === "run-day-e4-tmspz")!);
    const flagged = e4.compliance?.checks.find((c) => c.result === "escalate");
    expect(flagged?.detail_tr).toMatch(/tek seferlik arsa satışından/);
    expect(e4.compliance?.summary_tr).not.toMatch(/escalate/);
  });

  it("E3 demo carries the scripted numbers (11 Adım 2)", () => {
    const e = buildExplain(DEMO_SPECS.find((s) => s.run_id === DEMO_E3_RUN)!);
    expect(e.classifier?.confidence).toBe(0.93);
    expect(e.merged?.amount_to_revenue_annualized).toBe(0.18);
    expect(e.evidence_card?.stats.n).toBe(23);
    expect(e.evidence_card?.stats.mean_car_5d).toBe(0.014);
    expect(e.evidence_card?.stats.hit_rate_5d).toBe(0.61);
    expect(e.skeptic?.size_multiplier).toBe(0.5);
    expect(e.proposal?.requested_qty).toBe(1240);
    expect(e.approval?.status).toBe("pending");
    const parallel = e.trace.nodes.filter((n) => n.parallel_group === "fanout-1");
    expect(parallel.map((n) => n.node)).toEqual(["reader", "materiality", "evidence"]);
    expect(new Set(parallel.map((n) => n.started_at)).size).toBe(1);
  });

  it("red-team demo never reaches the rule engine", () => {
    const e = buildExplain(DEMO_SPECS[1]!);
    expect(e.guard?.injection_score).toBe(0.98);
    expect(e.compliance?.decision).toBe("veto");
    expect(e.rule_decision).toBeNull();
    expect(e.trace.nodes.some((n) => n.node === "rule_engine")).toBe(false);
  });

  it("restricted stock is vetoed before any LLM call", () => {
    const e = buildExplain(DEMO_SPECS[2]!);
    expect(e.pre_gate?.passed).toBe(false);
    expect(e.run.llm_calls).toBe(0);
    expect(e.trace.nodes.every((n) => n.model_id === null)).toBe(true);
  });
});
