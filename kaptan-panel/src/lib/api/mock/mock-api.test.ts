import { actorFor, createMockApi } from "./mock-api";
import { MockDb, type Actor } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, type KaptanApi } from "../types";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import type { OrderTicket } from "@/lib/domain";
import type { Role } from "@/lib/domain/user";

/** A fresh in-memory desk per test; `as(role)` changes whose eyes we look through, `signOut()` drops the session. */
function setup(role: Role = "risk_officer") {
  let current: Actor | null = actorFor(role);
  const roles: Role[] = [];
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({
    getActor: () => current,
    onRoleChange: async (r) => void roles.push(r),
    db,
    latencyMs: 0,
    live: false,
  });
  return { db, api, roles, as: (r: Role) => (current = actorFor(r)), signOut: () => (current = null) };
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

describe("mock API · session and roles", () => {
  it("rejects calls without a session (401) and names the member on duty", async () => {
    const { api, signOut } = setup();
    expect(await api.me()).toEqual({ id: "uye-3", display_name: "Üye 3", role: "risk_officer" });
    signOut();
    expect(await errorOf(api.counters())).toMatchObject({ status: 401 });
  });
  it("switches role through the session hook and validates it", async () => {
    const { api, roles } = setup();
    expect(await api.setRole("auditor")).toEqual({ id: "denetci", display_name: "Denetçi", role: "auditor" });
    expect(roles).toEqual(["auditor"]);
    expect(await errorOf(api.setRole("kral" as Role))).toMatchObject({ status: 422 });
  });
  it("lists the team", async () => {
    const { api } = setup("analyst");
    expect((await api.users()).map((m) => m.role)).toEqual(["admin", "analyst", "risk_officer", "analyst", "auditor"]);
  });
});

describe("mock API · proposals", () => {
  it("lists the three seeded pending proposals", async () => {
    const { api } = setup();
    const pending = await api.listApprovals("pending");
    expect(pending.map((c) => c.proposal_id).sort()).toEqual([...PENDING_PROPOSALS].sort());
  });
  it("lets only the Risk Sorumlusu sign, with a plain 403 for everyone else", async () => {
    const { api, as } = setup("analyst");
    expect(await errorOf(api.decideApproval(P1, approve()))).toEqual({ status: 403, code: "forbidden", message: "Bunu Risk Sorumlusu yapar." });
    as("auditor");
    expect((await errorOf(api.decideApproval(P1, approve()))).message).toBe("Denetçi yalnızca bakar. Bunu Risk Sorumlusu yapar.");
    as("admin");
    expect(await errorOf(api.decideApproval(P1, approve()))).toMatchObject({ status: 403 });
  });
  it("records the signer, the role and an audit line", async () => {
    const { api, db } = setup();
    const before = db.snapshot.auditAppends.length;
    const r = await api.decideApproval(P1, approve());
    expect(r).toMatchObject({ status: "approved", decided_by: "uye-3", decided_role: "risk_officer", decision_comment: null });
    const added = db.snapshot.auditAppends.slice(before);
    expect(added.find((a) => a.action === "approval.decided")).toMatchObject({ actor: "user:uye-3", payload: { role: "risk_officer", decision: "approve" } });
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
  it("lets the Analist add a note, keeps it with the proposal and refuses the Denetçi", async () => {
    const { api, as, db } = setup("analyst");
    const n = await api.addNote(P1, "  Hacim düşük, dikkat.  ");
    expect(n).toMatchObject({ proposal_id: P1, uid: "uye-2", role: "analyst", body: "Hacim düşük, dikkat." });
    expect(await api.listNotes(P1)).toHaveLength(1);
    expect(await api.listNotes(P2)).toHaveLength(0);
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ action: "note.added", actor: "user:uye-2" });
    expect(await errorOf(api.addNote(P1, "x"))).toMatchObject({ status: 422 });
    expect(await errorOf(api.addNote("yok", "geçerli not"))).toMatchObject({ status: 404 });
    as("auditor");
    expect(await errorOf(api.addNote(P1, "denetçi notu"))).toMatchObject({ status: 403 });
  });
});

describe("mock API · order tickets (emir fişi)", () => {
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
  it("marks a ticket as entered with the real fill, once — and only as Risk Sorumlusu", async () => {
    const { api, as } = setup();
    const t = await approvedTicket(api);
    const at = new Date(Date.parse(t.valid_until) - 60_000).toISOString();
    as("analyst");
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "canceled" }))).toMatchObject({ status: 403 });
    as("risk_officer");
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

describe("mock API · kill switch (Yönetici starts, Risk Sorumlusu confirms)", () => {
  it("stops (Risk or Yönetici), blocks approvals, and restarts only with two different people", async () => {
    const { api, as, db } = setup("analyst");
    expect(await errorOf(api.killSwitch("Analist durdurmak istiyor"))).toMatchObject({ status: 403, message: "Bunu Risk Sorumlusu ya da Yönetici yapar." });
    as("admin");
    const on = await api.killSwitch("Piyasa çok oynak");
    expect(on).toMatchObject({ kill_switch: "on", kill_by: "user:uye-1", reset: { started: null } });
    expect(await errorOf(api.killSwitch("tekrar açık"))).toMatchObject({ status: 409, code: "already_on" });
    as("risk_officer");
    expect(await errorOf(api.decideApproval(P1, approve()))).toMatchObject({ status: 409, code: "kill_switch" });

    // The Risk Sorumlusu cannot go first, the Yönetici cannot confirm.
    expect(await errorOf(api.confirmKillReset({ reason: "Önce ben onaylayayım" }))).toMatchObject({ status: 409, code: "not_started" });
    expect(await errorOf(api.startKillReset({ reason: "Risk başlatmak istiyor" }))).toMatchObject({ status: 403 });
    as("admin");
    expect(await errorOf(api.startKillReset({ reason: "kısa" }))).toMatchObject({ status: 422 });
    const started = await api.startKillReset({ reason: "Olay incelendi, piyasa kaynaklı" });
    expect(started.reset?.started).toMatchObject({ uid: "uye-1", role: "admin", reason: "Olay incelendi, piyasa kaynaklı" });
    expect(await errorOf(api.startKillReset({ reason: "İkinci kez başlatıyorum" }))).toMatchObject({ status: 409, code: "already_started" });
    expect(await errorOf(api.confirmKillReset({ reason: "Kendim onaylıyorum" }))).toMatchObject({ status: 403 });

    as("risk_officer");
    expect(await errorOf(api.confirmKillReset({ reason: "kısa" }))).toMatchObject({ status: 422 });
    const off = await api.confirmKillReset({ reason: "İkinci imza, onaylıyorum" });
    expect(off).toMatchObject({ kill_switch: "off", reset: null });
    expect(off.drawdown_pct).toBeGreaterThan(-0.05);
    const actions = db.snapshot.auditAppends.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["kill_switch.on", "kill_switch.reset_started", "kill_switch.reset"]));
  });
  it("refuses a restart when nothing is stopped and validates the stop reason", async () => {
    const { api, as } = setup("admin");
    expect(await errorOf(api.startKillReset({ reason: "Gereksiz bir başlatma" }))).toMatchObject({ status: 409, code: "not_on" });
    as("risk_officer");
    expect(await errorOf(api.confirmKillReset({ reason: "Gereksiz bir onaylama" }))).toMatchObject({ status: 409, code: "not_on" });
    expect(await errorOf(api.killSwitch("x"))).toMatchObject({ status: 422 });
  });
  it("refuses a confirmation by the same person who started (defence in depth)", async () => {
    const { api, db, as } = setup("risk_officer");
    await api.killSwitch("Durdurma testi");
    db.update((s) => ({ ...s, risk: { ...s.risk, reset_started: { uid: "uye-3", name: "Üye 3", role: "admin", at: db.nowIso(), reason: "aynı kişi" } } }));
    as("risk_officer");
    expect(await errorOf(api.confirmKillReset({ reason: "Aynı kişi onaylıyor" }))).toMatchObject({ status: 403, code: "same_person" });
  });
});

describe("mock API · limits (two signatures)", () => {
  it("Yönetici proposes (1/2), Risk Sorumlusu approves (2/2), the old version is superseded", async () => {
    const { api, as } = setup("admin");
    const start = await api.limits();
    expect(start.active.version).toBe(1);
    expect(start.pending).toBeNull();
    const proposed = await api.proposeLimit({ key: "risk_per_trade_pct", value: 0.004, reason: "Oynaklık arttı, riski azaltalım" });
    expect(proposed.pending).toMatchObject({ version: 2, status: "proposed", proposed_by: { uid: "uye-1", role: "admin" }, decided_by: null });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "İkinci bir öneri daha" }))).toMatchObject({ status: 409, code: "pending_exists" });
    expect(await errorOf(api.decideLimit(2, { decision: "approve" }))).toMatchObject({ status: 403 });

    as("risk_officer");
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "Risk de önermek istiyor" }))).toMatchObject({ status: 403 });
    const done = await api.decideLimit(2, { decision: "approve" });
    expect(done.pending).toBeNull();
    expect(done.active).toMatchObject({ version: 2, status: "active", decided_by: { uid: "uye-3", role: "risk_officer" } });
    expect(done.active.values.find((v) => v.key === "risk_per_trade_pct")?.value).toBe(0.004);
    expect(done.history.map((v) => [v.version, v.status])).toEqual([
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(await errorOf(api.decideLimit(2, { decision: "approve" }))).toMatchObject({ status: 409 });
  });
  it("refuses looser limits, no-op changes and short reasons; a rejection keeps the active set", async () => {
    const { api, as } = setup("admin");
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.2, reason: "Daha büyük pozisyon" }))).toMatchObject({ status: 422, code: "looser" });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.1, reason: "Aynı değer yeniden" }))).toMatchObject({ status: 422, code: "no_change" });
    expect(await errorOf(api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "kısa" }))).toMatchObject({ status: 422 });
    await api.proposeLimit({ key: "max_position_pct", value: 0.08, reason: "Yoğunlaşmayı azaltalım" });
    as("risk_officer");
    const r = await api.decideLimit(2, { decision: "reject", comment: "Gerek yok" });
    expect(r.active.version).toBe(1);
    expect(r.history[0]).toMatchObject({ version: 2, status: "rejected", decided_by: { reason: "Gerek yok" } });
  });
  it("refuses an approval by the proposer (defence in depth)", async () => {
    const { api, db } = setup("risk_officer");
    db.update((s) => ({
      ...s,
      limitVersions: [...s.limitVersions, { ...s.limitVersions[0]!, version: 2, status: "proposed", proposed_by: { uid: "uye-3", name: "Üye 3", role: "admin", at: db.nowIso(), reason: "x" }, decided_by: null }],
    }));
    expect(await errorOf(api.decideLimit(2, { decision: "approve" }))).toMatchObject({ status: 403, code: "same_person" });
  });
});

describe("mock API · audit ledger", () => {
  it("lists today newest first, searches in plain words and verifies the chain", async () => {
    const { api, as } = setup();
    await api.decideApproval(P1, approve());
    const today = await api.auditList();
    expect(today.items.slice(0, 5).find((e) => e.action === "approval.decided")).toMatchObject({ actor: "user:uye-3" });
    expect(today.length).toBeGreaterThan(4_812);
    expect(today.total).toBeLessThan(today.length);
    const all = await api.auditList({ scope: "all", limit: 5 });
    expect(all.items).toHaveLength(5);
    expect(all.total).toBe(all.length);
    const found = await api.auditList({ scope: "today", q: "imzaladı" });
    expect(found.items.every((e) => e.action === "approval.decided")).toBe(true);
    expect(found.total).toBeGreaterThan(0);

    const ok = await api.verifyAudit();
    expect(ok).toMatchObject({ ok: true, first_bad_pos: null, checked: today.length });
    as("analyst");
    expect(await errorOf(api.verifyAudit())).toMatchObject({ status: 403 });
    as("auditor");
    expect((await api.verifyAudit()).ok).toBe(true);
  });
  it("the tamper test breaks the chain at #3.907 (Yönetici only)", async () => {
    const { api, as } = setup("auditor");
    expect(await errorOf(api.setTamper(true))).toMatchObject({ status: 403 });
    as("admin");
    expect(await api.setTamper(true)).toEqual({ tamper_on: true });
    expect((await api.auditList({ limit: 1 })).tamper_on).toBe(true);
    expect(await api.verifyAudit()).toMatchObject({ ok: false, first_bad_pos: 3_907, kind: "hash_mismatch" });
    await api.setTamper(false);
    expect((await api.verifyAudit()).ok).toBe(true);
  });
});

describe("mock API · demo", () => {
  it("injects a scenario and resets the desk (Yönetici only)", async () => {
    const { api, db, as } = setup("risk_officer");
    expect(await errorOf(api.injectDemo("e3_contract"))).toMatchObject({ status: 403, message: "Bunu Yönetici yapar." });
    as("admin");
    const r = await api.injectDemo("e3_contract");
    expect(r.run_id).toBeTruthy();
    await api.setTamper(true);
    await api.resetDemo();
    expect(db.snapshot.injections).toHaveLength(0);
    expect(db.snapshot.tamperOn).toBe(false);
  });
});
