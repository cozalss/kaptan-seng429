import type { Position, RiskStatus } from "@/lib/domain";
import { LIMITS_V1 } from "@/lib/domain";
import {
  actorLabel,
  deskTone,
  exposure,
  holdingProgress,
  istanbulDate,
  killControl,
  lossFraction,
  marketValue,
  positionReturn,
  riskLimits,
  sessionsBetween,
} from "./risk-math";
import { parseTab } from "./tabs";
import { fillSummary } from "./orders";
import { ticketExpired } from "./order-ticket";
import { eventDetail, riskEvents } from "./risk-log";

const pos = (over: Partial<Position> = {}): Position => ({
  ticker: "ORNEK",
  company_name: "ÖRNEK ENERJİ A.Ş.",
  qty: 100,
  avg_cost: 40,
  last_price: 44,
  opened_at: "2027-01-04T06:55:00.000Z",
  planned_exit_date: "2027-02-01",
  holding_days: 7,
  source_proposal: "p1",
  run_id: "r1",
  event_type: "E3",
  strategy_version: "v1.1-fwd",
  unrealized_pnl: 400,
  realized_pnl: 0,
  managed_by_exit_rule: false,
  ...over,
});

const risk = (over: Partial<RiskStatus> = {}): Pick<RiskStatus, "kill_switch" | "halted_today" | "reset_request"> => ({
  kill_switch: "off",
  halted_today: false,
  reset_request: null,
  ...over,
});

describe("riskLimits", () => {
  it("reads the canonical limits from the active version", () => {
    expect(riskLimits(LIMITS_V1)).toEqual({ dailyHalt: -0.01, killDrawdown: -0.05, maxPositions: 10, targetPositions: 8, maxPositionPct: 0.1 });
  });
  it("falls back to the v1 seed for missing keys", () => {
    expect(riskLimits([{ key: "kill_drawdown_pct", value: -0.04 }]).killDrawdown).toBe(-0.04);
    expect(riskLimits([]).dailyHalt).toBe(-0.01);
    expect(riskLimits().maxPositions).toBe(10);
  });
});

describe("calendar", () => {
  it("gives the Istanbul date of an instant (UTC+3)", () => {
    expect(istanbulDate(Date.parse("2027-01-10T21:30:00Z"))).toBe("2027-01-11");
    expect(istanbulDate(Date.parse("2027-01-11T10:40:00Z"))).toBe("2027-01-11");
  });
  it("counts sessions after the start day, skipping weekends and holidays", () => {
    expect(sessionsBetween("2027-01-04", "2027-01-11")).toBe(5);
    expect(sessionsBetween("2026-12-31", "2027-01-04")).toBe(1); // 1 Jan holiday + weekend
    expect(sessionsBetween("2027-01-11", "2027-01-11")).toBe(0);
    expect(sessionsBetween("2027-01-12", "2027-01-11")).toBe(0);
  });
});

describe("holdingProgress", () => {
  it("measures sessions held against the plan", () => {
    const h = holdingProgress(pos(), "2027-01-11");
    expect(h).toMatchObject({ elapsed: 5, planned: 20, dueToday: false, overdue: false });
    expect(h.fraction).toBeCloseTo(0.25);
  });
  it("flags a position whose planned exit is today or past", () => {
    expect(holdingProgress(pos({ planned_exit_date: "2027-01-11" }), "2027-01-11")).toMatchObject({ dueToday: true, fraction: 1 });
    expect(holdingProgress(pos({ planned_exit_date: "2027-01-08" }), "2027-01-11").overdue).toBe(true);
  });
  it("never divides by zero for a same-day plan", () => {
    expect(holdingProgress(pos({ opened_at: "2027-01-11T06:55:00Z", planned_exit_date: "2027-01-11" }), "2027-01-11").planned).toBe(1);
  });
});

describe("exposure and position maths", () => {
  it("sums market value, finds the largest share and the unrealized P&L", () => {
    const e = exposure([pos(), pos({ ticker: "KRGSG", qty: 10, last_price: 10, unrealized_pnl: -50, source_proposal: "p2" })], 10_000);
    expect(e.gross).toBe(4_500);
    expect(e.pct).toBeCloseTo(0.45);
    expect(e.largest).toEqual({ ticker: "ORNEK", pct: 0.44 });
    expect(e.unrealized).toBe(350);
  });
  it("handles an empty book and zero equity", () => {
    expect(exposure([], 0)).toEqual({ gross: 0, pct: 0, largest: null, unrealized: 0 });
  });
  it("computes return and market value", () => {
    expect(positionReturn(pos())).toBeCloseTo(0.1);
    expect(marketValue(pos())).toBe(4_400);
  });
});

describe("lossFraction", () => {
  it("fills toward the limit and clamps", () => {
    expect(lossFraction(-0.005, -0.01)).toBeCloseTo(0.5);
    expect(lossFraction(-0.03, -0.01)).toBe(1);
    expect(lossFraction(0.004, -0.01)).toBe(0);
    expect(lossFraction(-0.01, 0)).toBe(0);
  });
});

describe("deskTone", () => {
  it("kill outranks the daily halt", () => {
    expect(deskTone(risk())).toBe("normal");
    expect(deskTone(risk({ halted_today: true }))).toBe("halt");
    expect(deskTone(risk({ halted_today: true, kill_switch: "on" }))).toBe("kill");
  });
});

describe("killControl (four eyes)", () => {
  const req = { id: "reset-1", requested_by: "u-admin", requested_by_name: "Burak (Admin)", requested_at: "2027-01-11T10:50:00Z", reason: "Gözden geçirildi", confirmations: 1 as const };
  it("lets R and D engage, not A or U", () => {
    expect(killControl(risk(), "risk_officer", "u-risk")).toEqual({ phase: "off", canEngage: true });
    expect(killControl(risk(), "admin", "u-admin")).toEqual({ phase: "off", canEngage: true });
    expect(killControl(risk(), "analyst", "u-analist")).toEqual({ phase: "off", canEngage: false });
    expect(killControl(risk(), "auditor", "u-denetci")).toEqual({ phase: "off", canEngage: false });
  });
  it("only the Admin starts the reset", () => {
    expect(killControl(risk({ kill_switch: "on" }), "admin", "u-admin")).toEqual({ phase: "on", canStartReset: true });
    expect(killControl(risk({ kill_switch: "on" }), "risk_officer", "u-risk")).toEqual({ phase: "on", canStartReset: false });
  });
  it("a different Risk Officer confirms; the starter and other roles cannot", () => {
    const on = risk({ kill_switch: "on", reset_request: req });
    expect(killControl(on, "risk_officer", "u-risk")).toMatchObject({ phase: "reset_pending", canConfirm: true, reason: null });
    expect(killControl(on, "admin", "u-admin")).toMatchObject({ canConfirm: false, isRequester: true, reason: "Sıfırlamayı yalnızca Risk Officer onaylar." });
    expect(killControl({ ...on, reset_request: { ...req, requested_by: "u-risk" } }, "risk_officer", "u-risk")).toMatchObject({
      canConfirm: false,
      reason: "Sıfırlamayı başlatan kişi onaylayamaz (dört göz).",
    });
  });
});

describe("labels and small helpers", () => {
  it("names actors in words", () => {
    expect(actorLabel(null)).toBe("—");
    expect(actorLabel("system:risk_monitor")).toBe("Otomatik (risk izleyici)");
    expect(actorLabel("system:simbist")).toBe("Sistem (simbist)");
    expect(actorLabel("user:u-admin")).toBe("Burak (Admin)");
    expect(actorLabel("agent:x")).toBe("agent:x");
  });
  it("parses the tab from the URL", () => {
    expect(parseTab("fis")).toBe("fis");
    expect(parseTab("emirler")).toBe("emirler");
    expect(parseTab("x")).toBe("pozisyonlar");
    expect(parseTab(undefined)).toBe("pozisyonlar");
  });
  it("summarises fills", () => {
    expect(fillSummary({ fills: [] })).toEqual({ qty: 0, avg: null });
    const f = (qty: number, price: number) => ({ id: "f", order_id: "o", qty, price, commission: 0, bsmv: 0, slippage_bps: 0, filled_at: "2027-01-11T10:00:00Z", source: "simbist" as const });
    expect(fillSummary({ fills: [f(100, 10), f(300, 12)] })).toEqual({ qty: 400, avg: 11.5 });
  });
  it("expires a ticket after valid_until", () => {
    expect(ticketExpired({ valid_until: "2027-01-11T11:16:20.000Z" }, Date.parse("2027-01-11T11:00:00Z"))).toBe(false);
    expect(ticketExpired({ valid_until: "2027-01-11T11:16:20.000Z" }, Date.parse("2027-01-11T11:16:20Z"))).toBe(true);
  });
});

describe("risk log helpers", () => {
  const e = (chain_pos: number, action: string, payload: Record<string, unknown> = {}) => ({
    seq: chain_pos,
    chain_pos,
    occurred_at: "2027-01-11T10:40:00Z",
    actor: "system:risk_monitor",
    action,
    entity_type: "system_flag",
    entity_id: "kill_switch",
    run_id: null,
    strategy_version: null,
    payload,
    prev_hash: "0",
    hash: "1",
  });
  it("merges pages, drops duplicates and sorts newest first", () => {
    const out = riskEvents([[e(3, "kill_switch.on"), e(1, "risk.halted")], [e(3, "kill_switch.on"), e(5, "kill_switch.reset")]], 2);
    expect(out.map((x) => x.chain_pos)).toEqual([5, 3]);
  });
  it("picks a readable detail from the payload", () => {
    expect(eventDetail(e(1, "kill_switch.on", { reason: "R01" }))).toBe("R01");
    expect(eventDetail(e(1, "kill_switch.reset", { comment: "tamam" }))).toBe("tamam");
    expect(eventDetail(e(1, "risk.halted", { daily_pnl_pct: -0.0112 }))).toBe("Günlük K/Z −%1,12");
    expect(eventDetail(e(1, "x"))).toBeNull();
  });
});
