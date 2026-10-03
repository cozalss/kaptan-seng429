import { createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { DEMO_E3_PROPOSAL } from "@/mocks/ids";
import { clampIndex, DEMO_STEPS, fmtClock, isBehind, plannedStart, routePath, totalAutoplaySeconds } from "./demo-steps";
import { demoStore, goToStep, IDLE, nextStep, parseDemoState, prevStep, setAutoplay, setMinimized, startGuidedDemo, stopGuidedDemo, __resetDemoStore } from "./demo-store";
import { runAction, stepRoute } from "./use-demo-runner";

afterEach(() => {
  __resetDemoStore();
  stopAllTimers();
  stopLiveTicker();
});

describe("demo script", () => {
  it("covers acts 1–6 in order and fits the 5-minute budget in autoplay", () => {
    expect(DEMO_STEPS[0]!.role).toBe("risk_officer");
    expect([...new Set(DEMO_STEPS.map((s) => s.act))]).toEqual([1, 2, 3, 4, 5, 6]);
    // Dwell time only; role switches and navigation add ~20–25 s, so keep ~30 s of headroom.
    expect(totalAutoplaySeconds()).toBeLessThanOrEqual(270);
    const starts = DEMO_STEPS.map(plannedStart);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    for (const s of DEMO_STEPS) expect(s.note.length).toBeLessThan(140);
  });
  it("has small helpers for routes, clocks and the schedule", () => {
    expect(routePath("/audit?dogrula=temiz")).toBe("/audit");
    expect(routePath("/runs/x#kanit")).toBe("/runs/x");
    expect(fmtClock(65_400)).toBe("1:05");
    expect(fmtClock(-5)).toBe("0:00");
    expect(clampIndex(-3)).toBe(0);
    expect(clampIndex(99)).toBe(DEMO_STEPS.length - 1);
    expect(isBehind(0, 10_000)).toBe(false);
    expect(isBehind(0, 70_000)).toBe(true);
    expect(isBehind(DEMO_STEPS.length - 1, 330_000)).toBe(true);
    expect(plannedStart({ ...DEMO_STEPS[0]!, window: "?" })).toBe(0);
    const audit = DEMO_STEPS.find((s) => s.id === "4e")!;
    expect(stepRoute(audit, 7)).toBe("/audit?dogrula=kurcalama-7");
    expect(stepRoute(DEMO_STEPS[0]!, 7)).toBe("/inbox");
  });
});

describe("demo store", () => {
  it("starts, moves, toggles and stops, persisting to sessionStorage", () => {
    expect(demoStore.get()).toEqual(IDLE);
    expect(demoStore.server()).toEqual(IDLE);
    const seen: number[] = [];
    const off = demoStore.subscribe(() => seen.push(demoStore.get().index));
    goToStep(3); // ignored while idle
    expect(demoStore.get().active).toBe(false);
    startGuidedDemo(1000);
    expect(demoStore.get()).toMatchObject({ active: true, index: 0, startedAt: 1000 });
    expect(nextStep()).toBe(true);
    prevStep();
    goToStep(DEMO_STEPS.length - 1);
    expect(nextStep()).toBe(false);
    setAutoplay(true);
    setMinimized(true);
    expect(demoStore.get()).toMatchObject({ autoplay: true, minimized: true });
    expect(parseDemoState(window.sessionStorage.getItem("kaptan-guided-demo")).index).toBe(DEMO_STEPS.length - 1);
    stopGuidedDemo();
    expect(demoStore.get().active).toBe(false);
    off();
    expect(seen.length).toBeGreaterThan(4);
  });
  it("parses stored state defensively", () => {
    expect(parseDemoState(null)).toEqual(IDLE);
    expect(parseDemoState("{bad")).toEqual(IDLE);
    expect(parseDemoState('{"active":"yes"}')).toEqual(IDLE);
    expect(parseDemoState('{"active":true,"index":999,"startedAt":5}')).toMatchObject({ active: true, index: DEMO_STEPS.length - 1, nonce: 0 });
  });
});

describe("demo actions against the mock", () => {
  it("injects, toggles tamper (Admin only) and auto-approves as the Risk Officer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const db = new MockDb(null);
    const admin = createMockApi({ getActor: () => ({ uid: "u-admin", name: "Burak (Admin)", role: "admin" }), db, latencyMs: 0, live: false });
    const risk = createMockApi({ getActor: () => ({ uid: "u-risk", name: "Zeynep (Risk Officer)", role: "risk_officer" }), db, latencyMs: 0, live: false });
    expect(await runAction(admin, { kind: "inject", scenario: "e3_contract", when: "after" }, "admin")).toContain("DEMO");
    expect(await runAction(admin, { kind: "tamper", on: true, when: "before" }, "admin")).toBe("Kurcalama testi açık");
    expect((await admin.auditStatus()).tamper_on).toBe(true);
    expect(await runAction(risk, { kind: "tamper", on: false, when: "before" }, "risk_officer")).toBeNull();
    expect(await runAction(admin, { kind: "tamper", on: false, when: "before" }, "admin")).toBeNull();
    const approving = runAction(risk, { kind: "approve", proposal: DEMO_E3_PROPOSAL, when: "manual" }, "risk_officer");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await approving).toBe("Onay verildi");
    expect((await risk.listApprovals("all")).find((c) => c.proposal_id === DEMO_E3_PROPOSAL)?.status).toBe("approved");
    vi.useRealTimers();
  });
});
