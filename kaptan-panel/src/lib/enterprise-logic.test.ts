import type { AuditEntry } from "@/lib/domain";
import { LIMITS_V1 } from "@/lib/domain";
import { auditCompany, auditMatches, auditSentence, trLower } from "@/lib/audit-words";
import { actorParts } from "@/lib/actors";
import { walkProgress, walkTarget } from "@/components/audit/chain-walk";
import { changedKey, fromInput, inputUnit, limitSentence, PLAIN_LIMITS, toInput, valueOf } from "@/components/settings/limits-logic";
import { actPosition, clampIndex, DEMO_STEPS, manualAction, routePath } from "@/components/demo/demo-steps";
import { __resetDemoStore, demoStore, goToStep, nextStep, parseDemoState, prevStep, startGuidedDemo, stopGuidedDemo } from "@/components/demo/demo-store";
import { runAction, until } from "@/components/demo/demo-actions";
import { actorFor, createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { DEMO_E3_PROPOSAL, PENDING_PROPOSALS } from "@/mocks/ids";
import type { Role } from "@/lib/domain/user";

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  seq: 1,
  chain_pos: 1,
  occurred_at: "2027-01-11T10:40:00.000Z",
  actor: "system:kap_poller",
  action: "disclosure.ingested",
  entity_type: "disclosure",
  entity_id: "1",
  run_id: null,
  strategy_version: null,
  payload: {},
  prev_hash: "00",
  hash: "a".repeat(64),
  ...over,
});

describe("audit sentences", () => {
  it("says who did what in plain Turkish", () => {
    expect(auditSentence(entry({ payload: { ticker: "ORNEK", company: "ÖRNEK ENERJİ A.Ş." } }))).toBe("KAP okuyucu Örnek Enerji bildirimini getirdi.");
    expect(auditSentence(entry({ actor: "user:uye-3", action: "approval.decided", payload: { ticker: "ORNEK", decision: "approve" } }))).toBe("Risk Sorumlusu Örnek Enerji önerisini imzaladı.");
    expect(auditSentence(entry({ actor: "user:uye-3", action: "approval.decided", payload: { decision: "rejected" } }))).toBe("Risk Sorumlusu bir şirket önerisini reddetti.");
    expect(auditSentence(entry({ actor: "system:risk_monitor", action: "kill_switch.on" }))).toMatch(/Risk izleyici zirveden/);
    expect(auditSentence(entry({ actor: "user:uye-1", action: "kill_switch.on" }))).toBe("Yönetici her şeyi durdurdu.");
    expect(auditSentence(entry({ actor: "user:uye-1", action: "kill_switch.reset_started" }))).toBe("Yönetici yeniden başlatmayı başlattı (1/2).");
    expect(auditSentence(entry({ actor: "user:uye-3", action: "kill_switch.reset" }))).toBe("Risk Sorumlusu yeniden başlatmayı onayladı (2/2).");
    expect(auditSentence(entry({ actor: "user:uye-1", action: "limits.proposed" }))).toMatch(/\(1\/2\)/);
    expect(auditSentence(entry({ actor: "user:uye-3", action: "limits.approved" }))).toMatch(/\(2\/2\)/);
    expect(auditSentence(entry({ actor: "user:uye-3", action: "limits.rejected" }))).toMatch(/reddetti/);
    expect(auditSentence(entry({ actor: "agent:skeptic", action: "agent.output" }))).toBe("Şüpheci notunu yazdı.");
    expect(auditSentence(entry({ actor: "user:uye-1", action: "demo.injected", payload: { scenario: "loss_simulation" } }))).toBe("Senaryo eklendi: zarar simülasyonu.");
    expect(auditSentence(entry({ actor: "system:nightly_verify", action: "audit.verified" }))).toMatch(/Gece doğrulaması/);
    expect(auditSentence(entry({ actor: "user:uye-2", action: "audit.verified" }))).toBe("Analist defteri doğruladı.");
    expect(auditSentence(entry({ actor: "system:simbist", action: "order.filled", payload: { ticker: "ORNEK", company: "ÖRNEK ENERJİ A.Ş.", qty: 560 } }))).toBe("Örnek Enerji için 560 lot alış gerçekleşti (KAPtan hesabı).");
    expect(auditSentence(entry({ action: "order.filled", payload: { qty: 620 } }))).toBe("620 lot alış gerçekleşti (KAPtan hesabı).");
    // A ticker the issuer list does not know stays a code.
    expect(auditCompany(entry({ payload: { ticker: "ZZZZ" } }))).toEqual({ text: "ZZZZ", code: true });
    expect(auditCompany(entry({ payload: { ticker: "DMOEN" } }))).toEqual({ text: "Doğu Enerji Üretim", code: false });
    expect(auditSentence(entry({ actor: "agent:request_approval", action: "proposal.created", payload: { ticker: "TMSPZ" } }))).toBe("Tayfa Toros Perakende için öneri hazırladı.");
    expect(auditSentence(entry({ actor: "user:uye-2", action: "garip.olay" }))).toBe("Analist: garip.olay");
  });
  it("covers every action the mock writes", () => {
    for (const action of [
      "classification.done",
      "pregate.decided",
      "rule.decided",
      "risk.checked",
      "risk.rejected",
      "compliance.rejected",
      "proposal.created",
      "ticket.issued",
      "ticket.entered",
      "ticket.unfilled",
      "ticket.canceled",
      "risk.halted",
      "note.added",
      "brief.generated",
    ]) {
      expect(auditSentence(entry({ action, actor: "user:uye-3" }))).not.toContain(action);
    }
  });
  it("searches the sentence, the person and the raw fields, Turkish-aware", () => {
    const e = entry({ actor: "user:uye-3", action: "approval.decided", payload: { ticker: "ORNEK", decision: "approve" } });
    expect(auditMatches(e, "İMZALADI")).toBe(true);
    expect(auditMatches(e, "üye 3")).toBe(true);
    expect(auditMatches(e, "ornek")).toBe(true);
    expect(auditMatches(e, "  ")).toBe(true);
    expect(auditMatches(e, "kurcala")).toBe(false);
    // "#3907" and "#3.907" find the record at that place in the chain, and only it.
    const at3907 = entry({ chain_pos: 3_907 });
    expect(auditMatches(at3907, "#3907")).toBe(true);
    expect(auditMatches(at3907, "#3.907")).toBe(true);
    expect(auditMatches(at3907, "#390")).toBe(false);
    expect(auditMatches(entry({ chain_pos: 39_070 }), "#3907")).toBe(false);
    expect(trLower("IŞIK")).toBe("ışık");
    expect(actorParts("system:simbist")).toEqual({ name: "KAPtan hesabı borsası (SimBIST)", kind: "Sistem" });
    expect(actorParts("agent:request_approval")).toEqual({ name: "Öneri yazıcı", kind: "Tayfa" });
  });
});

describe("chain walk", () => {
  it("walks to the end, or to the broken record", () => {
    const ok = { ok: true, first_bad_pos: null, kind: null, checked: 100, head_hash: "x", verified_at: "2027-01-11T10:40:00.000Z", anchor: null };
    expect(walkTarget(ok)).toBe(100);
    expect(walkTarget({ ...ok, ok: false, first_bad_pos: 37, kind: "hash_mismatch" as const, checked: 36 })).toBe(37);
    expect(walkProgress(0, 100)).toBe(0);
    expect(walkProgress(700, 100)).toBeGreaterThan(50);
    expect(walkProgress(5_000, 100)).toBe(100);
    expect(walkProgress(-5, 100)).toBe(0);
  });
});

describe("limit sentences and inputs", () => {
  it("reads every plain limit as a sentence", () => {
    for (const k of PLAIN_LIMITS) expect(limitSentence(k, valueOf(LIMITS_V1, k) ?? 0)).toMatch(/\.$/);
    expect(limitSentence("risk_per_trade_pct", 0.005)).toBe("Bir işlemde en fazla sermayenin %0,5’i riske girer.");
    expect(limitSentence("daily_loss_halt_pct", -0.01)).toBe("Gün içinde −%1 zararda yeni emir durur.");
    expect(limitSentence("min_edge_cost_ratio", 2.5)).toBe("Beklenen kazanç maliyetin en az 2,5 katı değilse öneri çıkmaz.");
    expect(limitSentence("max_sector_pct", 0.25)).toBe("Sektör tavanı: 0,25");
    expect(valueOf(LIMITS_V1, "max_group_pct")).toBe(0.2);
  });
  it("converts between what is typed and what is stored", () => {
    expect(toInput("risk_per_trade_pct", 0.005)).toBe("0,5");
    expect(toInput("daily_loss_halt_pct", -0.01)).toBe("1");
    expect(toInput("max_concurrent_positions", 10)).toBe("10");
    expect(fromInput("risk_per_trade_pct", "0,4")).toBe(0.004);
    expect(fromInput("daily_loss_halt_pct", "0.8")).toBe(-0.008);
    expect(fromInput("max_concurrent_positions", "8")).toBe(8);
    expect(fromInput("max_concurrent_positions", "")).toBeNull();
    expect(fromInput("max_concurrent_positions", "abc")).toBeNull();
    expect(fromInput("max_concurrent_positions", "-1")).toBeNull();
    expect(inputUnit("risk_per_trade_pct")).toBe("%");
    expect(inputUnit("kill_drawdown_pct")).toBe("% (eksi)");
    expect(inputUnit("max_concurrent_positions")).toBe("adet");
    expect(inputUnit("min_edge_cost_ratio")).toBe("kat");
  });
  it("finds the one limit a version changed", () => {
    const base = { version: 1, status: "active" as const, reason: "x", created_at: "2027-01-11T10:40:00.000Z", effective_from: null, values: [...LIMITS_V1], proposed_by: { uid: "a", name: "A", role: "admin" as const, at: "2027-01-11T10:40:00.000Z", reason: null }, decided_by: null };
    const next = { ...base, version: 2, values: LIMITS_V1.map((v) => (v.key === "max_position_pct" ? { ...v, value: 0.08 } : v)) };
    expect(changedKey(next, base)).toBe("max_position_pct");
    expect(changedKey(base, base)).toBeNull();
  });
});

describe("guided demo steps and store", () => {
  afterEach(() => __resetDemoStore());
  it("covers six acts, names a role where it matters and offers backups for manual steps", () => {
    expect(new Set(DEMO_STEPS.map((s) => s.act))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(DEMO_STEPS.map((s) => s.id)).size).toBe(DEMO_STEPS.length);
    for (const s of DEMO_STEPS) expect(s.note.length).toBeGreaterThan(20);
    const sign = DEMO_STEPS.find((s) => s.id === "2c")!;
    expect(manualAction(sign)?.label).toBe("Yedek: imzala");
    expect(manualAction(DEMO_STEPS[0]!)).toBeNull();
    expect(actPosition(1)).toEqual({ act: 2, n: 1, of: 3 });
    expect(clampIndex(-3)).toBe(0);
    expect(clampIndex(999)).toBe(DEMO_STEPS.length - 1);
    expect(routePath("/denetim?x=1#y")).toBe("/denetim");
  });
  it("starts, walks, stops and survives bad storage", () => {
    expect(demoStore.server().active).toBe(false);
    expect(nextStep()).toBe(false);
    expect(prevStep()).toBe(false);
    goToStep(3);
    expect(demoStore.get().active).toBe(false);
    startGuidedDemo();
    expect(demoStore.get()).toMatchObject({ active: true, index: 0 });
    expect(prevStep()).toBe(false);
    expect(nextStep()).toBe(true);
    expect(demoStore.get().index).toBe(1);
    expect(prevStep()).toBe(true);
    goToStep(DEMO_STEPS.length - 1);
    expect(nextStep()).toBe(false);
    const seen: number[] = [];
    const off = demoStore.subscribe(() => seen.push(demoStore.get().index));
    stopGuidedDemo();
    off();
    expect(seen).toEqual([0]);
    expect(parseDemoState(null).active).toBe(false);
    expect(parseDemoState("{x").active).toBe(false);
    expect(parseDemoState(JSON.stringify({ active: "evet" })).active).toBe(false);
    expect(parseDemoState(JSON.stringify({ active: true, index: 99 }))).toEqual({ active: true, index: DEMO_STEPS.length - 1, nonce: 0 });
  });
});

describe("guided demo actions (idempotent backups)", () => {
  afterEach(() => {
    stopAllTimers();
    stopLiveTicker();
  });
  function desk() {
    let role: Role = "admin";
    const db = new MockDb(null);
    const api = createMockApi({ getActor: () => actorFor(role), db, latencyMs: 0, live: false });
    return { db, api, as: (r: Role) => (role = r) };
  }
  it("waits with until()", async () => {
    let n = 0;
    expect(await until(() => ++n > 2, 1_000, 1)).toBe(true);
    expect(await until(() => false, 5, 1)).toBe(false);
  });
  it("runs the kill-switch restart and limit backups only when there is something to do", async () => {
    const { api, as } = desk();
    expect(await runAction(api, { kind: "reset_start", when: "manual" }, { patience: 5 })).toBeNull();
    expect(await runAction(api, { kind: "reset_confirm", when: "manual" })).toBeNull();
    await api.killSwitch("Durdurma testi");
    expect(await runAction(api, { kind: "reset_start", when: "manual" })).toMatch(/1\/2/);
    expect(await runAction(api, { kind: "reset_start", when: "manual" })).toBeNull();
    as("risk_officer");
    expect(await runAction(api, { kind: "reset_confirm", when: "manual" })).toMatch(/2\/2/);

    as("admin");
    expect(await runAction(api, { kind: "limit_approve", when: "manual" })).toBeNull();
    expect(await runAction(api, { kind: "limit_propose", when: "manual" })).toMatch(/1\/2/);
    expect(await runAction(api, { kind: "limit_propose", when: "manual" })).toBeNull();
    as("risk_officer");
    expect(await runAction(api, { kind: "limit_approve", when: "manual" })).toMatch(/2\/2/);
    as("admin");
    expect(await runAction(api, { kind: "limit_propose", when: "manual" })).toBeNull();
  });
  it("signs a waiting proposal once, toggles the tamper test and resets", async () => {
    const { api, as, db } = desk();
    as("risk_officer");
    expect(await runAction(api, { kind: "approve", proposal: PENDING_PROPOSALS[0], when: "manual" })).toMatch(/İmzalandı/);
    expect(await runAction(api, { kind: "approve", proposal: PENDING_PROPOSALS[0], when: "manual" }, { patience: 5 })).toBeNull();
    expect(await runAction(api, { kind: "await_proposal", proposal: DEMO_E3_PROPOSAL, when: "before" }, { patience: 5 })).toBeNull();
    expect(await runAction(api, { kind: "verify", when: "after" })).toBeNull();
    as("admin");
    await runAction(api, { kind: "tamper", on: true, when: "before" });
    expect(db.snapshot.tamperOn).toBe(true);
    await runAction(api, { kind: "tamper", on: true, when: "before" });
    expect(db.snapshot.tamperOn).toBe(true);
    expect(await runAction(api, { kind: "inject", scenario: "restricted_r04", when: "after" })).toBeNull();
    expect(await runAction(api, { kind: "reset", when: "before", as: "admin" })).toMatch(/baştan/);
    expect(db.snapshot.tamperOn).toBe(false);
  });
});
