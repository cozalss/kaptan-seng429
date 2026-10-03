import type { Explain, RunSummary, TraceNode } from "@/lib/domain";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC } from "@/mocks/runs-demo";
import { DAY_SPECS } from "@/mocks/runs-day";
import { DEMO_ORDER_TICKET } from "@/mocks/governance";
import { chartDomain, distribution, distributions, jitter, pctOf, quantile, ticks } from "./evidence-stats";
import { injectionSpans, mergeSpans, quoteSpans, segmentText } from "./highlight";
import { chainStep, fmtScore, outcomeLabel, riskCodeOf, splitReason, trDecimal } from "./labels";
import { mergeCalc, regexMatch } from "./merge-math";
import { applyFilter, countByOutcome, DEFAULT_FILTER, filterToParams, istanbulDay, listTotals, parseFilter } from "./runs-filter";
import { applyNodeEvent, layoutBars, mergeLive, nodeSettled, totals } from "./trace-layout";
import { agentsRan, buildVerdict, currentNode, keyFacts } from "./verdict";

const spec = (id: string) => {
  const s = DAY_SPECS.find((x) => x.run_id === id);
  if (!s) throw new Error(id);
  return s;
};
const E3 = buildExplain(DEMO_E3_SPEC);
const INJ = buildExplain(DEMO_INJ_SPEC);
const R04 = buildExplain(DEMO_R04_SPEC);

describe("buildVerdict", () => {
  it("reads the E3 happy path: proposal waiting for the Risk Officer, shrunk ×0,5", () => {
    const v = buildVerdict(E3);
    expect(v.tone).toBe("wait");
    expect(v.stamp).toMatch(/onay bekliyor/);
    expect(v.sentence).toContain("ÖRNEK ENERJİ");
    expect(v.sentence).toContain("×0,5");
    expect(v.sentence).toContain("1.240 lot");
    expect(v.sentence).not.toMatch(/al tavsiye/i);
    expect(v.stages.map((s) => s.state)).toEqual(["pass", "pass", "pass", "pass", "pass", "wait", "pending"]);
    expect(v.stages[2]?.note).toBe("6/6 çalıştı");
  });

  it("stops the red-team run at the guard, never reaching the rule engine", () => {
    const v = buildVerdict(INJ);
    expect(v.tone).toBe("veto");
    expect(v.stamp).toBe("Karantina · kural motoruna ulaşmadı");
    expect(v.sentence).toContain("0,98");
    expect(v.sentence).toContain("Uyum RET");
    expect(v.stages[1]?.state).toBe("veto");
    expect(v.stages[3]?.state).toBe("pending");
  });

  it("marks the R04 hard veto with zero LLM calls and strips internal codes from the sentence", () => {
    const v = buildVerdict(R04);
    expect(v.stamp).toBe("Sert veto · R04 · LLM çağrısı 0");
    expect(v.sentence).toContain("LLM çağrısı 0");
    expect(v.sentence).not.toContain("vbts_brut_takas");
    expect(v.stages[1]).toMatchObject({ state: "veto", note: "R04 · Tedbir" });
  });

  it("explains a no-trade with the first failed rule and a hold as the safe default", () => {
    const nt = buildVerdict(buildExplain(spec("run-day-e3-mslhv")));
    expect(nt.tone).toBe("stop");
    expect(nt.sentence).toContain("eşik altında");
    expect(nt.stages[3]?.state).toBe("stop");
    const hold = buildVerdict(buildExplain(spec("run-day-hold-ornyz")));
    expect(hold.stamp).toMatch(/HOLD/);
    const veto = buildVerdict(buildExplain(spec("run-day-e3-mslel")));
    expect(veto.sentence).toContain("Şüpheci veto");
  });

  it("covers approved+filled, rejected, expired, cancelled and archived runs", () => {
    const filled = buildVerdict(buildExplain(spec("run-day-e1-tmsmk")));
    expect(filled.tone).toBe("ok");
    expect(filled.sentence).toMatch(/dolum aldı/);
    expect(filled.stages[6]?.state).toBe("pass");
    const rej = buildVerdict(buildExplain(spec("run-day-e2-krgmd")));
    expect(rej.tone).toBe("veto");
    expect(rej.stages[5]?.state).toBe("veto");
    const base = buildExplain(spec("run-day-e1-krgcl"));
    const approval = base.approval;
    if (!approval) throw new Error("approval");
    expect(buildVerdict({ ...base, approval: { ...approval, status: "expired" } }).stamp).toMatch(/süresi doldu/);
    expect(buildVerdict({ ...base, approval: { ...approval, status: "cancelled" } }).stamp).toMatch(/kill switch/);
    const approvedNoFill = buildVerdict({ ...base, approval: { ...approval, status: "approved" } });
    expect(approvedNoFill.sentence).toMatch(/emir gönderildi/);
    const arch = buildVerdict(buildExplain(spec("run-day-ignore-orngd")));
    expect(arch.tone).toBe("neutral");
    expect(arch.sentence).toContain("O · Diğer");
  });

  it("covers live, quota and failure states", () => {
    const nodes: TraceNode[] = E3.trace.nodes.map((n, i) => (i < 4 ? n : i === 4 ? { ...n, status: "running" } : { ...n, status: "waiting" }));
    const live: Explain = { ...E3, run: { ...E3.run, status: "running" }, trace: { ...E3.trace, nodes } };
    const v = buildVerdict(live);
    expect(v.tone).toBe("live");
    expect(v.stages.map((s) => s.state)).toContain("running");
    expect(currentNode(nodes)?.status).toBe("running");
    expect(buildVerdict({ ...E3, run: { ...E3.run, status: "hold_quota", outcome: "HOLD" } }).stamp).toBe("Kota bitti · HOLD");
    const failedNodes = E3.trace.nodes.map((n) => (n.node === "reader" ? { ...n, status: "failed" as const } : n));
    const f = buildVerdict({ ...E3, run: { ...E3.run, status: "failed", outcome: "HOLD" }, trace: { ...E3.trace, nodes: failedNodes } });
    expect(f.sentence).toContain("Okuyucu");
  });

  it("picks the key facts per run kind", () => {
    expect(keyFacts(E3).map((f) => f.label)).toEqual(["Sınıflandırma güveni", "Tutar / yıllık gelir", "Benzer olay", "Önerilen"]);
    expect(keyFacts(E3)[1]?.value).toBe("%18");
    expect(keyFacts(INJ)[0]).toMatchObject({ value: "0,98", tone: "north" });
    expect(keyFacts(R04)[0]).toMatchObject({ label: "LLM çağrısı", value: "0" });
    expect(agentsRan(E3.trace.nodes)).toBe(6);
  });
});

describe("highlight", () => {
  it("finds verbatim quotes, merges overlaps and segments the text", () => {
    const text = "abc 432.000.000 TL tutarlı sözleşme";
    const spans = quoteSpans(text, [
      { field: "amount", quote: "432.000.000 TL" },
      { field: "x", quote: "yok burada" },
      { field: "y", quote: "ab" },
    ]);
    expect(spans).toHaveLength(1);
    const segs = segmentText(text, [...spans, { start: 10, end: 26, fields: ["z"] }]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.fields)).toHaveLength(1);
    expect(mergeSpans([{ start: -5, end: 3, fields: ["a"] }, { start: 50, end: 60, fields: ["b"] }], 10)).toEqual([{ start: 0, end: 3, fields: ["a"] }]);
  });

  it("marks instruction-like text in the red-team fixture", () => {
    const body = INJ.texts[0]?.body ?? "";
    const inj = injectionSpans(body);
    expect(inj.length).toBeGreaterThan(0);
    expect(body.slice(inj[0]?.start, inj[0]?.end)).toMatch(/^SİSTEM NOTU/);
    expect(injectionSpans(E3.texts[0]?.body ?? "")).toEqual([]);
  });
});

describe("evidence stats", () => {
  it("computes type-7 quantiles and a distribution per horizon", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    const ds = distributions(E3.evidence_events);
    expect(ds.map((d) => d.label)).toEqual(["1 gün", "5 gün", "20 gün", "60 gün"]);
    const d60 = ds[3];
    expect(d60?.n).toBeLessThan(E3.evidence_events.length);
    expect(distribution([], "car_1d", "x")).toBeNull();
  });

  it("builds a domain containing zero and ticks including zero", () => {
    const dom = chartDomain(distributions(E3.evidence_events));
    expect(dom[0]).toBeLessThan(0);
    expect(dom[1]).toBeGreaterThan(0);
    expect(ticks(dom)).toContain(0);
    expect(ticks([0.01, 0.04])).toContain(0);
    expect(ticks([-0.5, 0.5])).toContain(0.1);
    expect(chartDomain([])).toEqual([-0.05, 0.05]);
    expect(pctOf(0, [-1, 1])).toBe(50);
    expect(pctOf(9, [-1, 1])).toBe(100);
    expect(jitter(3)).toBeGreaterThanOrEqual(0);
    expect(jitter(3)).toBeLessThan(1);
  });
});

describe("merge math", () => {
  it("recomputes the E3 ratio 432 M ÷ 2,4 B = %18", () => {
    const c = mergeCalc(E3);
    expect(c?.recomputed).toBeCloseTo(0.18, 6);
    expect(c?.matches).toBe(true);
    expect(c?.annualFactor).toBe(1);
  });

  it("annualises contracts longer than 12 months", () => {
    const c = mergeCalc(buildExplain(spec("run-day-e3-mslhv")));
    expect(c?.annualFactor).toBeCloseTo(12 / 18);
    expect(c?.recomputed).toBeCloseTo(0.04, 6);
    expect(mergeCalc(INJ)).toBeNull();
  });

  it("matches the reader amount against regex amounts within ±0,5%", () => {
    expect(regexMatch(100, [99.6, 50])).toEqual({ matched: 99.6, ok: true });
    expect(regexMatch(100, [90])).toEqual({ matched: null, ok: false });
    expect(regexMatch(null, [1])).toEqual({ matched: null, ok: false });
  });
});

describe("trace layout", () => {
  it("lays bars on one axis with parallel groups bracketed", () => {
    const bars = layoutBars(E3.trace.nodes);
    const reader = bars.find((b) => b.node.node === "reader");
    const mat = bars.find((b) => b.node.node === "materiality");
    expect(reader?.left).toBeCloseTo(mat?.left ?? -1);
    expect(reader?.group).toEqual({ first: true, last: false });
    expect(bars.find((b) => b.node.node === "evidence")?.group).toEqual({ first: false, last: true });
    expect(bars.every((b) => b.left + b.width <= 100.0001)).toBe(true);
    expect(layoutBars([{ ...E3.trace.nodes[0]!, started_at: null }])[0]?.width).toBe(0);
  });

  it("totals wall time, tokens and LLM calls", () => {
    const t = totals(E3.trace.nodes);
    expect(t.llmCalls).toBe(6);
    expect(t.tokensIn).toBeGreaterThan(0);
    expect(t.wallMs).toBeGreaterThan(0);
  });

  it("merges live SSE events forward only", () => {
    const waiting: TraceNode[] = E3.trace.nodes.map((n) => ({ ...n, status: "waiting", latency_ms: null }));
    let live = applyNodeEvent({}, { node: "route", phase: "start", at: E3.run.started_at, latency_ms: null, tokens_in: null, tokens_out: null });
    expect(mergeLive(waiting, live)[0]?.status).toBe("running");
    live = applyNodeEvent(live, { node: "route", phase: "end", at: E3.run.started_at, latency_ms: 40, tokens_in: 0, tokens_out: 0 });
    expect(mergeLive(waiting, live)[0]).toMatchObject({ status: "done", latency_ms: 40 });
    expect(applyNodeEvent(live, { node: "route", phase: "start", at: E3.run.started_at, latency_ms: null, tokens_in: null, tokens_out: null })).toBe(live);
    expect(mergeLive(E3.trace.nodes, live)[0]).toBe(E3.trace.nodes[0]);
    expect(nodeSettled(waiting, "route")).toBe(false);
    // Nodes only the stream knows about start on the trace's own clock (after the previous one).
    const cut = E3.trace.nodes.map((n, i) => (i < 7 ? n : { ...n, status: "waiting" as const, started_at: null, latency_ms: null }));
    const merge = cut[7];
    if (!merge) throw new Error("merge");
    const ev = { node: merge.node, phase: "start" as const, at: "2030-01-01T00:00:00.000Z", latency_ms: null, tokens_in: null, tokens_out: null };
    const merged = mergeLive(cut, applyNodeEvent({}, ev));
    expect(merged[7]?.status).toBe("running");
    expect(Date.parse(merged[7]?.started_at ?? "")).toBeLessThan(Date.parse("2029-01-01T00:00:00Z"));
    const bar = layoutBars(merged)[7];
    expect(bar?.width).toBe(3);
    const reader = cut.findIndex((n) => n.node === "materiality");
    const cut2 = E3.trace.nodes.map((n, i) => (i < reader ? n : { ...n, status: "waiting" as const, started_at: null, latency_ms: null }));
    const m2 = mergeLive(cut2, applyNodeEvent({}, { ...ev, node: "materiality" }));
    expect(m2[reader]?.started_at).toBe(cut2[reader - 1]?.started_at);
    const approvalIdx = E3.trace.nodes.findIndex((n) => n.node === "approval");
    const human = mergeLive(E3.trace.nodes, applyNodeEvent({}, { ...ev, node: "approval", phase: "end", latency_ms: 0 }));
    expect(human[approvalIdx]?.status).toBe("waiting");
    expect(nodeSettled(waiting, "filter_action")).toBe(true);
  });
});

describe("runs filter", () => {
  const rows: RunSummary[] = [E3.run, INJ.run, R04.run, buildExplain(spec("run-day-ignore-orngd")).run, { ...E3.run, run_id: "old", started_at: "2026-12-14T05:41:00.000Z", is_fixture: false }];

  it("parses and serialises the URL filter, rejecting junk", () => {
    const f = parseFilter(new URLSearchParams("durum=completed&sonuc=QUARANTINED&kapsam=today&q=dmo&demo=1"));
    expect(f).toEqual({ status: "completed", outcome: "QUARANTINED", scope: "today", q: "dmo", fixtureOnly: true });
    expect(parseFilter(new URLSearchParams("durum=evil&sonuc=x&kapsam=y"))).toEqual(DEFAULT_FILTER);
    expect(filterToParams(f)).toBe("?durum=completed&sonuc=QUARANTINED&kapsam=today&q=dmo&demo=1");
    expect(filterToParams(DEFAULT_FILTER)).toBe("");
  });

  it("filters by outcome, status, query, scope and fixture flag", () => {
    const today = istanbulDay(E3.run.started_at);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, outcome: "PREGATE_VETO" }, today).map((r) => r.ticker)).toEqual(["TMSLJ"]);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, q: "demo gıda" }, today).map((r) => r.ticker)).toEqual(["DMOGD"]);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, q: "1651903" }, today)).toHaveLength(1);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, scope: "history" }, today).map((r) => r.run_id)).toEqual(["old"]);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, scope: "today" }, today)).toHaveLength(4);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, fixtureOnly: true }, today)).toHaveLength(3);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, status: "interrupted" }, today)).toHaveLength(2);
  });

  it("counts outcomes and totals", () => {
    const c = countByOutcome(rows);
    expect(c.PROPOSE).toBe(2);
    expect(c.NO_TRADE).toBe(0);
    expect(c.QUARANTINED).toBe(1);
    expect(c.NONE).toBe(1);
    expect(countByOutcome([{ ...E3.run, outcome: null }]).NONE).toBe(1);
    expect(listTotals(rows)).toMatchObject({ runs: 5, running: 0 });
  });
});

describe("labels", () => {
  it("formats scores, reasons, chains and decimals", () => {
    expect(fmtScore(0.9)).toBe("0,90");
    expect(splitReason("R04_RESTRICTED: VBTS — sert veto")).toEqual({ code: "R04_RESTRICTED", text: "VBTS — sert veto" });
    expect(splitReason("serbest metin")).toEqual({ code: null, text: "serbest metin" });
    expect(riskCodeOf("R13_INSIDER_BLOCKLIST")).toBe("R13");
    expect(riskCodeOf(null)).toBeNull();
    expect(chainStep("reader", "gemini-flash-lite-temsili-001")).toBe(0);
    expect(chainStep("reader", "groq/gpt-oss-120b-temsili")).toBe(1);
    expect(chainStep("classifier", "ollama:qwen3")).toBe(3);
    expect(chainStep("skeptic", "azure-x")).toBe(2);
    expect(chainStep("skeptic", null)).toBe(-1);
    expect(chainStep("skeptic", "mystery")).toBe(-1);
    expect(trDecimal("%5.9 ve 1.240 lot")).toBe("%5,9 ve 1.240 lot");
    expect(outcomeLabel("NONE").short).toBe("Arşiv");
    expect(DEMO_ORDER_TICKET.run_id).toBe(DEMO_E3_SPEC.run_id);
  });
});
