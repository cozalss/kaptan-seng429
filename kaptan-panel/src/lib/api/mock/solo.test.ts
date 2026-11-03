import { Overview } from "@/lib/solo/overview";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { CAPITAL_START, overviewFor } from "./solo";
import * as sel from "./selectors";
import { isApiError } from "../types";

function setup(signedIn = true) {
  const db = new MockDb(null);
  const api = createMockApi({ user: signedIn ? undefined : null, db, latencyMs: 0, live: false });
  return { db, api };
}

const statusOf = (p: Promise<unknown>) => p.then(() => 200, (e: unknown) => (isApiError(e) ? e.status : 500));

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock /me/overview", () => {
  it("matches the backend contract and the desk's own figures", async () => {
    const { db, api } = setup();
    const o = Overview.parse(await api.overview());
    const risk = sel.riskStatus(db.snapshot);
    expect(o.capital_start).toBe(CAPITAL_START);
    expect(o.equity_now).toBe(risk.equity);
    expect(o.pnl_abs).toBeCloseTo(risk.equity - CAPITAL_START, 2);
    expect(o.pnl_pct).toBeCloseTo(risk.equity / CAPITAL_START - 1, 4);
    const invested = o.allocations.reduce((s, a) => s + a.amount, 0);
    expect(o.cash).toBeCloseTo(o.equity_now - invested, 0);
    expect(o.cash).toBeGreaterThan(0);
  });

  it("lists every held position once, biggest first, with weight and gain", async () => {
    const { db, api } = setup();
    const o = await api.overview();
    const held = sel.positions(db.snapshot);
    expect(o.allocations.map((a) => a.symbol).sort()).toEqual(held.map((p) => p.ticker).sort());
    const amounts = o.allocations.map((a) => a.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    for (const a of o.allocations) {
      expect(a.weight).toBeCloseTo(a.amount / o.equity_now, 3);
      const p = held.find((x) => x.ticker === a.symbol)!;
      expect(a.pnl_pct).toBeCloseTo(p.last_price / p.avg_cost - 1, 3);
    }
  });

  it("turns the pending approvals into AL / SAT and adds TUT for the biggest holdings", async () => {
    const { api } = setup();
    const o = await api.overview();
    const fromApprovals = o.open_suggestions.filter((s) => s.action !== "tut");
    expect(fromApprovals.map((s) => s.id).sort()).toEqual([...PENDING_PROPOSALS].sort());
    expect(fromApprovals.filter((s) => s.action === "sat").map((s) => s.symbol)).toEqual(["KRGSG"]);
    const holds = o.open_suggestions.filter((s) => s.action === "tut");
    expect(holds.length).toBeGreaterThan(0);
    expect(holds.length).toBeLessThanOrEqual(2);
    expect(holds.map((h) => h.symbol)).not.toContain("KRGSG");
    for (const s of o.open_suggestions) expect(s.reason_short.length).toBeGreaterThan(10);
  });

  it("drops an approved suggestion and starts the series at the starting capital", async () => {
    const { api } = setup();
    const id = PENDING_PROPOSALS[0];
    await api.decideApproval(id, { decision: "approve", approved_notional_try: null, comment: "" });
    const o = await api.overview();
    expect(o.open_suggestions.map((s) => s.id)).not.toContain(id);
    expect(o.equity_series[0]?.equity).toBe(CAPITAL_START);
    expect(o.equity_series[o.equity_series.length - 1]?.equity).toBe(o.equity_now);
    const dates = o.equity_series.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("is deterministic for the same state and clock", () => {
    const db = new MockDb(null, 1_000);
    expect(overviewFor(db.snapshot, 5_000)).toEqual(overviewFor(db.snapshot, 5_000));
  });

  it("refuses a signed-out caller", async () => {
    const { api } = setup(false);
    const err = await api.overview().catch((e: unknown) => e);
    expect(isApiError(err) && err.status).toBe(401);
  });
});

describe("mock /me/suggestions/{id}/hold", () => {
  it("records Tut / Geç in the ledger and leaves the card itself open", async () => {
    const { db, api } = setup();
    const held = await api.holdSuggestion("tut-FRZEN", { kind: "held" });
    expect(held).toMatchObject({ id: "tut-FRZEN", kind: "held" });
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ actor: "user:sen", action: "suggestion.held", entity_type: "proposal", entity_id: "tut-FRZEN", payload: { ticker: "FRZEN", note: false } });
    await api.holdSuggestion(PENDING_PROPOSALS[1], { kind: "skipped", note: "Sonra bakarım" });
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ action: "suggestion.skipped", payload: { ticker: "ORNCM", note: true } });
    const pending = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === PENDING_PROPOSALS[1]);
    expect(pending?.status).toBe("pending");
  });

  it("404s an unknown id and 422s a bad body", async () => {
    expect(await statusOf(setup().api.holdSuggestion("yok", { kind: "held" }))).toBe(404);
    expect(await statusOf(setup().api.holdSuggestion("tut-FRZEN", { kind: "nope" as "held" }))).toBe(422);
  });
});

describe("one person takes both steps", () => {
  it("lets one person request and confirm the restart, with the waiver on the ledger", async () => {
    const { db, api } = setup();
    await api.killSwitch("Elle durduruldu.");
    await api.startKillReset({ reason: "Yeniden başlatıyorum." });
    const after = await api.confirmKillReset({ reason: "Yeniden başlatıyorum." });
    expect(after.kill_switch).toBe("off");
    expect(db.snapshot.auditAppends.find((e) => e.action === "auth.single_user_waiver")).toMatchObject({
      entity_type: "system_flag",
      entity_id: "kill_switch",
      payload: { waiver: "single_user_waiver", flow: "kill_reset", first_uid: "sen" },
    });
  });


  it("waives the second signature on a limit change too", async () => {
    const { db, api } = setup();
    await api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "Daha küçük bir tutar" });
    const view = await api.decideLimit(2, { decision: "approve", comment: "" });
    expect(view.active.version).toBe(2);
    expect(db.snapshot.auditAppends.some((e) => e.action === "auth.single_user_waiver" && e.payload.flow === "limits")).toBe(true);
  });

  it("names the company on an issued order ticket, as the backend does", async () => {
    const { db, api } = setup();
    await api.decideApproval(PENDING_PROPOSALS[0], { decision: "approve", approved_notional_try: null, comment: "" });
    expect(db.snapshot.auditAppends.find((e) => e.action === "ticket.issued")?.payload).toMatchObject({ ticker: "KRGCL", side: "buy" });
    expect(typeof db.snapshot.auditAppends.find((e) => e.action === "ticket.issued")?.payload.company).toBe("string");
  });
});
