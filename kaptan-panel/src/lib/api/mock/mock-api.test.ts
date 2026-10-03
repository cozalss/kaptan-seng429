import { createMockApi } from "./mock-api";
import { MockDb, type Actor } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, type KaptanApi } from "../types";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import { accountForRole, findAccountByUid } from "@/lib/auth/accounts";
import type { Role } from "@/lib/domain";

const asActor = (uid: string): Actor => {
  const acc = findAccountByUid(uid);
  if (!acc) throw new Error(`unknown ${uid}`);
  return { uid: acc.uid, name: acc.name, role: acc.role };
};
const roleActor = (role: Role): Actor => asActor(accountForRole(role).uid);

/** A fresh in-memory desk per test; the acting user is swapped between calls. */
function setup(start: Actor = roleActor("risk_officer")) {
  let current: Actor | null = start;
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({ getActor: () => current, db, latencyMs: 0, live: false });
  return { db, api, act: (a: Actor | null) => (current = a) };
}

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error("expected the call to fail");
}

const TOTP = "123456";
const [P1, P2] = PENDING_PROPOSALS;

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock API · RBAC", () => {
  it("rejects calls without a session (401)", async () => {
    const { api, act } = setup();
    act(null);
    expect(await errorOf(api.counters())).toMatchObject({ status: 401 });
  });
  it("forbids approval for every role but the Risk Officer (403)", async () => {
    for (const role of ["analyst", "admin", "auditor"] as const) {
      const { api } = setup(roleActor(role));
      expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: null, comment: "ok", totp: TOTP }))).toMatchObject({ status: 403 });
    }
  });
  it("keeps the auditor read-only: no notes, but chain verification is allowed", async () => {
    const { api } = setup(roleActor("auditor"));
    expect(await errorOf(api.addNote(1651200, "not"))).toMatchObject({ status: 403 });
    const r = await api.verifyAudit();
    expect(r.ok).toBe(true);
  }, 5_000);
  it("lets only the Admin inject demo disclosures", async () => {
    const { api } = setup(roleActor("risk_officer"));
    expect(await errorOf(api.injectDemo("e3_contract"))).toMatchObject({ status: 403 });
  });
});

describe("mock API · approvals", () => {
  it("lists the three seeded pending proposals", async () => {
    const { api } = setup();
    const pending = await api.listApprovals("pending");
    expect(pending.map((c) => c.proposal_id).sort()).toEqual([...PENDING_PROPOSALS].sort());
  });
  it("requires a 6-digit step-up code", async () => {
    const { api } = setup();
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: null, comment: "ok", totp: "12" }))).toMatchObject({
      status: 422,
    });
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: null, comment: "ok", totp: "abcdef" }))).toMatchObject({
      status: 422,
    });
  });
  it("requires a comment", async () => {
    const { api } = setup();
    expect(await errorOf(api.decideApproval(P1, { decision: "reject", approved_notional_try: null, comment: "  ", totp: TOTP }))).toMatchObject({
      status: 422,
    });
  });
  it("only shrinks, never grows (Ç-9)", async () => {
    const { api } = setup();
    const card = (await api.listApprovals("pending")).find((c) => c.proposal_id === P1);
    expect(card).toBeDefined();
    const grow = (card?.final_notional_try ?? 0) + 1;
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: grow, comment: "büyüt", totp: TOTP }))).toMatchObject({
      status: 422,
      code: "grow_not_allowed",
    });
  });
  it("records a rejection, writes audit, and refuses a second decision (409)", async () => {
    const { api, db } = setup();
    const before = db.snapshot.auditAppends.length;
    const r = await api.decideApproval(P2, { decision: "reject", approved_notional_try: null, comment: "Kanıt zayıf", totp: TOTP });
    expect(r.status).toBe("rejected");
    expect(db.snapshot.auditAppends.length).toBe(before + 1);
    expect(await errorOf(api.decideApproval(P2, { decision: "approve", approved_notional_try: null, comment: "tekrar", totp: TOTP }))).toMatchObject({
      status: 409,
    });
  });
});

describe("mock API · kill switch", () => {
  it("blocks approvals while on, and needs two different people to reset (Ç-8)", async () => {
    const { api, act } = setup(roleActor("risk_officer"));
    const on = await api.killSwitch("Test durdurma");
    expect(on.kill_switch).toBe("on");
    expect(await errorOf(api.killSwitch("tekrar açık"))).toMatchObject({ status: 409 });
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: null, comment: "ok", totp: TOTP }))).toMatchObject({
      status: 409,
      code: "kill_switch",
    });

    // The Risk Officer cannot initiate; the Admin does.
    expect(await errorOf(api.requestKillReset({ reason: "Kontrol tamam", totp: TOTP }))).toMatchObject({ status: 403 });
    act(roleActor("admin"));
    const req = await api.requestKillReset({ reason: "Kontrol tamam", totp: TOTP });
    expect(req.confirmations).toBe(1);
    expect(await errorOf(api.confirmKillReset({ request_id: req.id, comment: "ok", totp: TOTP }))).toMatchObject({ status: 403 });

    act(roleActor("risk_officer"));
    const off = await api.confirmKillReset({ request_id: req.id, comment: "Onaylıyorum", totp: TOTP });
    expect(off.kill_switch).toBe("off");
  });
  it("refuses a reset when the switch is off", async () => {
    const { api } = setup(roleActor("admin"));
    expect(await errorOf(api.requestKillReset({ reason: "Gereksiz", totp: TOTP }))).toMatchObject({ status: 409 });
  });
  it("asks for step-up on the reset request", async () => {
    const { api } = setup(roleActor("admin"));
    await api.killSwitch("Test durdurma");
    expect(await errorOf(api.requestKillReset({ reason: "Kontrol tamam", totp: "12ab" }))).toMatchObject({ status: 401, code: "step_up" });
  });
});

describe("mock API · limits four-eyes", () => {
  it("lets a second person approve, never the proposer", async () => {
    const { api, act } = setup(roleActor("risk_officer"));
    const proposal = await api.proposeLimits({ changes: [{ key: "max_position_pct", value: 0.08 }], reason: "Volatilite yükseldi, payı düşür" });
    expect(proposal.status).toBe("proposed");
    expect(await errorOf(api.proposeLimits({ changes: [{ key: "max_position_pct", value: 0.07 }], reason: "İkinci öneri denemesi" }))).toMatchObject({
      status: 409,
    });
    expect(await errorOf(api.decideLimits(proposal.version, { decision: "approve", comment: "kendim" }))).toMatchObject({ status: 403 });

    act(roleActor("admin"));
    const active = await api.decideLimits(proposal.version, { decision: "approve", comment: "Uygun" });
    expect(active.status).toBe("active");
    expect((await api.limits()).version).toBe(proposal.version);
    expect((await api.limitsHistory()).filter((v) => v.status === "active")).toHaveLength(1);
  });
  it("validates the reason length", async () => {
    const { api } = setup(roleActor("admin"));
    expect(await errorOf(api.proposeLimits({ changes: [{ key: "max_position_pct", value: 0.08 }], reason: "kısa" }))).toMatchObject({ status: 422 });
  });
});

describe("mock API · audit chain", () => {
  it("reports the demo tamper at #3907 and recovers when it is turned off", async () => {
    const { api, act } = setup(roleActor("admin"));
    await api.setTamper(true);
    act(roleActor("auditor"));
    const broken = await api.verifyAudit();
    expect(broken).toMatchObject({ ok: false, first_bad_pos: 3907, kind: "hash_mismatch" });
    act(roleActor("admin"));
    await api.setTamper(false);
    expect((await api.verifyAudit()).ok).toBe(true);
  }, 8_000);
});
