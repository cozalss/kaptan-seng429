import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, type KaptanApi } from "../types";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import type { OrderTicket } from "@/lib/domain";

/** A fresh in-memory state per test. */
function setup() {
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({ db, latencyMs: 0, live: false });
  return { db, api };
}

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  throw new Error("expected the call to fail");
}

const [P1, P2] = PENDING_PROPOSALS;
const approve = (comment = "") => ({ decision: "approve" as const, approved_notional_try: null, comment });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock API · session", () => {
  it("names the one person", async () => {
    const { api } = setup();
    expect(await api.me()).toEqual({ id: "sen", display_name: "Deniz" });
  });
  it("rejects calls without a session (401)", async () => {
    const api = createMockApi({ user: null, db: new MockDb(null), latencyMs: 0, live: false });
    expect(await errorOf(api.counters())).toMatchObject({ status: 401 });
  });
});

describe("mock API · proposals", () => {
  it("lists the four seeded pending proposals (three buys, one sell)", async () => {
    const { api } = setup();
    const pending = await api.listApprovals("pending");
    expect(pending.map((c) => c.proposal_id).sort()).toEqual([...PENDING_PROPOSALS].sort());
  });
  it("records who decided and an audit line", async () => {
    const { api, db } = setup();
    const before = db.snapshot.auditAppends.length;
    const r = await api.decideApproval(P1, approve());
    expect(r).toMatchObject({ status: "approved", decided_by: "sen", decision_comment: null });
    const added = db.snapshot.auditAppends.slice(before);
    expect(added.find((a) => a.action === "approval.decided")).toMatchObject({ actor: "user:sen", payload: { decision: "approve" } });
  });
  it("only shrinks, never grows (Ç-9)", async () => {
    const { api } = setup();
    const card = (await api.listApprovals("pending")).find((c) => c.proposal_id === P1);
    const grow = (card?.final_notional_try ?? 0) + 1;
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: grow, comment: "büyüt" }))).toMatchObject({
      status: 422,
      code: "grow_not_allowed",
    });
  });
  it("rejects with a note and refuses a second decision (409)", async () => {
    const { api } = setup();
    const r = await api.decideApproval(P2, { decision: "reject", approved_notional_try: null, comment: "Kanıt zayıf" });
    expect(r).toMatchObject({ status: "rejected", decision_comment: "Kanıt zayıf" });
    expect(await errorOf(api.decideApproval(P2, approve("tekrar")))).toMatchObject({ status: 409 });
  });
  it("404s an unknown proposal and validates the note length", async () => {
    const { api } = setup();
    expect(await errorOf(api.decideApproval("yok", approve()))).toMatchObject({ status: 404 });
    expect(await errorOf(api.decideApproval(P1, approve("x".repeat(501))))).toMatchObject({ status: 422 });
  });
});

describe("mock API · notes", () => {
  it("adds a note and keeps it with the proposal", async () => {
    const { api, db } = setup();
    const n = await api.addNote(P1, "  Hacim düşük, dikkat.  ");
    expect(n).toMatchObject({ proposal_id: P1, uid: "sen", body: "Hacim düşük, dikkat." });
    expect(await api.listNotes(P1)).toHaveLength(1);
    expect(await api.listNotes(P2)).toHaveLength(0);
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ action: "note.added", actor: "user:sen" });
    expect(await errorOf(api.addNote(P1, "x"))).toMatchObject({ status: 422 });
    expect(await errorOf(api.addNote("yok", "geçerli not"))).toMatchObject({ status: 404 });
  });
});

describe("mock API · order tickets", () => {
  async function approvedTicket(api: KaptanApi): Promise<OrderTicket> {
    await api.decideApproval(P1, approve("Kanıt yeterli"));
    const t = (await api.listTickets()).find((x) => x.proposal_id === P1);
    if (!t) throw new Error("no ticket for the approval");
    return t;
  }

  it("issues no ticket before an approval, and one for every approval", async () => {
    const { api } = setup();
    expect((await api.listTickets()).some((x) => x.proposal_id === P1)).toBe(false);
    const t = await approvedTicket(api);
    expect(t.entry.status).toBe("awaiting");
    expect(t.stage).toBe("paper");
    expect(Date.parse(t.valid_until) - Date.parse(t.created_at)).toBeLessThanOrEqual(30 * 60_000);
  });
  it("marks a ticket as entered with the real fill, once", async () => {
    const { api } = setup();
    const t = await approvedTicket(api);
    const at = new Date(Date.parse(t.valid_until) - 60_000).toISOString();
    const r = await api.markTicket(t.ticket_no, { mark: "entered", filled_qty: t.qty, avg_price: t.limit_price, filled_at: at, note: "Tamamı doldu" });
    expect(r.entry).toMatchObject({ status: "entered", filled_qty: t.qty, avg_price: t.limit_price, note: "Tamamı doldu" });
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "canceled" }))).toMatchObject({ status: 409, code: "already_marked" });
  });
  it("refuses fills that exceed the ticket or arrive after its TTL (R16)", async () => {
    const { api } = setup();
    const t = await approvedTicket(api);
    const inTime = t.approved_at;
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: t.qty + 1, avg_price: t.limit_price, filled_at: inTime }))).toMatchObject({
      code: "over_qty",
    });
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: 1, avg_price: t.limit_price + 1, filled_at: inTime }))).toMatchObject({
      code: "over_limit",
    });
    const late = new Date(Date.parse(t.valid_until) + 1_000).toISOString();
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: 1, avg_price: t.limit_price, filled_at: late }))).toMatchObject({
      status: 422,
      code: "after_ttl",
    });
    expect((await api.markTicket(t.ticket_no, { mark: "unfilled" })).entry.status).toBe("unfilled");
  });
  it("404s an unknown ticket", async () => {
    const { api } = setup();
    expect(await errorOf(api.markTicket("T-YOK", { mark: "canceled" }))).toMatchObject({ status: 404 });
  });
});

describe("mock API · stop and restart", () => {
  it("stops, blocks approvals, and one person restarts with both steps, the waiver on record", async () => {
    const { api, db } = setup();
    const on = await api.killSwitch("Piyasa çok oynak");
    expect(on).toMatchObject({ kill_switch: "on", kill_by: "user:sen", reset: { started: null, ready_at: null } });
    expect(await errorOf(api.killSwitch("tekrar açık"))).toMatchObject({ status: 409, code: "already_on" });
    expect(await errorOf(api.decideApproval(P1, approve()))).toMatchObject({ status: 409, code: "kill_switch" });

    expect(await errorOf(api.confirmKillReset({ reason: "Önce ben onaylayayım" }))).toMatchObject({ status: 409, code: "not_started" });
    expect(await errorOf(api.startKillReset({ reason: "kısa" }))).toMatchObject({ status: 422 });
    const started = await api.startKillReset({ reason: "Olay incelendi, piyasa kaynaklı" });
    // The double waives the wait: ready_at stays null, so the panel confirms at once.
    expect(started.reset).toMatchObject({ started: { uid: "sen", reason: "Olay incelendi, piyasa kaynaklı" }, ready_at: null });
    expect(await errorOf(api.startKillReset({ reason: "İkinci kez başlatıyorum" }))).toMatchObject({ status: 409, code: "already_started" });

    expect(await errorOf(api.confirmKillReset({ reason: "kısa" }))).toMatchObject({ status: 422 });
    const off = await api.confirmKillReset({ reason: "Kendim onaylıyorum" });
    expect(off).toMatchObject({ kill_switch: "off", reset: null });
    expect(off.drawdown_pct).toBeGreaterThan(-0.05);
    const actions = db.snapshot.auditAppends.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["kill_switch.on", "kill_switch.reset_started", "auth.single_user_waiver", "kill_switch.reset"]));
  });
  it("refuses a restart when nothing is stopped and validates the stop reason", async () => {
    const { api } = setup();
    expect(await errorOf(api.startKillReset({ reason: "Gereksiz bir başlatma" }))).toMatchObject({ status: 409, code: "not_on" });
    expect(await errorOf(api.confirmKillReset({ reason: "Gereksiz bir onaylama" }))).toMatchObject({ status: 409, code: "not_on" });
    expect(await errorOf(api.killSwitch("x"))).toMatchObject({ status: 422 });
  });
});

describe("mock API · limits", () => {
  it("proposes and approves as one person, the waiver on record; the old version is superseded", async () => {
    const { api, db } = setup();
    const start = await api.limits();
    expect(start.active.version).toBe(1);
    expect(start.pending).toBeNull();
    const proposed = await api.proposeLimit({ key: "risk_per_trade_pct", value: 0.004, reason: "Oynaklık arttı, riski azaltalım" });
    expect(proposed.pending).toMatchObject({ version: 2, status: "proposed", proposed_by: { uid: "sen" }, decided_by: null });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "İkinci bir öneri daha" }))).toMatchObject({ status: 409, code: "pending_exists" });

    const done = await api.decideLimit(2, { decision: "approve" });
    expect(done.pending).toBeNull();
    expect(done.active).toMatchObject({ version: 2, status: "active", decided_by: { uid: "sen" } });
    expect(done.active.values.find((v) => v.key === "risk_per_trade_pct")?.value).toBe(0.004);
    expect(done.history.map((v) => [v.version, v.status])).toEqual([
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(db.snapshot.auditAppends.map((a) => a.action)).toContain("auth.single_user_waiver");
    expect(await errorOf(api.decideLimit(2, { decision: "approve" }))).toMatchObject({ status: 409 });
  });
  it("refuses looser limits, no-op changes and short reasons; a rejection keeps the active set", async () => {
    const { api } = setup();
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.2, reason: "Daha büyük pozisyon" }))).toMatchObject({ status: 422, code: "looser" });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.1, reason: "Aynı değer yeniden" }))).toMatchObject({ status: 422, code: "no_change" });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "kısa" }))).toMatchObject({ status: 422 });
    await api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "Yoğunlaşmayı azaltalım" });
    const r = await api.decideLimit(2, { decision: "reject", comment: "Gerek yok" });
    expect(r.active.version).toBe(1);
    expect(r.history[0]).toMatchObject({ version: 2, status: "rejected", decided_by: { reason: "Gerek yok" } });
  });
});

describe("mock API · audit ledger", () => {
  it("lists today newest first, searches in plain words and verifies the chain", async () => {
    const { api } = setup();
    await api.decideApproval(P1, approve());
    const today = await api.auditList();
    expect(today.items.slice(0, 5).find((e) => e.action === "approval.decided")).toMatchObject({ actor: "user:sen" });
    expect(today.length).toBeGreaterThan(4_812);
    expect(today.total).toBeLessThan(today.length);
    const all = await api.auditList({ scope: "all", limit: 5 });
    expect(all.items).toHaveLength(5);
    expect(all.total).toBe(all.length);
    const found = await api.auditList({ scope: "today", q: "onayladın" });
    expect(found.items.every((e) => e.action === "approval.decided")).toBe(true);
    expect(found.total).toBeGreaterThan(0);

    const ok = await api.verifyAudit();
    expect(ok).toMatchObject({ ok: true, first_bad_pos: null, checked: today.length });
  });
  it("the chain walk finds a record changed behind its back, at #3.907", async () => {
    const { api, db } = setup();
    db.update((s) => ({ ...s, tamperOn: true }));
    expect(await api.verifyAudit()).toMatchObject({ ok: false, first_bad_pos: 3_907, kind: "hash_mismatch" });
    db.update((s) => ({ ...s, tamperOn: false }));
    expect((await api.verifyAudit()).ok).toBe(true);
  });
});
