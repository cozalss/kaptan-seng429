import type { AuditEntry } from "@/lib/domain";
import { LIMITS_V1 } from "@/lib/domain";
import { auditCompany, auditMatches, auditSentence, trLower } from "@/lib/audit-words";
import { actorParts } from "@/lib/actors";
import { walkProgress, walkTarget } from "@/components/audit/chain-walk";
import { changedKey, fromInput, inputUnit, limitSentence, PLAIN_LIMITS, toInput, valueOf } from "@/components/settings/limits-logic";

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
  it("says who did what in plain Turkish: you, or KAPtan", () => {
    expect(auditSentence(entry({ payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("KAPtan Misal Enerji bildirimini okudu.");
    expect(auditSentence(entry({ actor: "user:sen", action: "approval.decided", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş.", decision: "approve" } }))).toBe("Misal Enerji önerisini onayladın.");
    expect(auditSentence(entry({ actor: "user:sen", action: "approval.decided", payload: { decision: "rejected" } }))).toBe("bir şirket önerisini reddettin.");
    expect(auditSentence(entry({ actor: "system:risk_monitor", action: "kill_switch.on" }))).toBe("Paran zirvesinden %5 düştü; KAPtan her şeyi durdurdu.");
    expect(auditSentence(entry({ actor: "user:sen", action: "kill_switch.on" }))).toBe("Her şeyi durdurdun.");
    expect(auditSentence(entry({ actor: "user:sen", action: "kill_switch.reset_started" }))).toBe("Yeniden başlatmayı istedin.");
    expect(auditSentence(entry({ actor: "user:sen", action: "kill_switch.reset" }))).toBe("İşlemleri yeniden başlattın.");
    expect(auditSentence(entry({ actor: "user:sen", action: "limits.rejected" }))).toMatch(/vazgeçtin/);
    expect(auditSentence(entry({ actor: "agent:skeptic", action: "agent.output" }))).toBe("KAPtan bir inceleme notu yazdı.");
    expect(auditSentence(entry({ actor: "user:sen", action: "demo.injected", payload: { scenario: "loss_simulation" } }))).toBe("Sınama amaçlı bir olay eklendi.");
    expect(auditSentence(entry({ actor: "system:nightly_verify", action: "audit.verified" }))).toMatch(/KAPtan gece/);
    expect(auditSentence(entry({ actor: "user:sen", action: "audit.verified" }))).toBe("Kayıtların sağlam olup olmadığına baktın.");
    expect(auditSentence(entry({ actor: "system:simbist", action: "order.filled", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş.", qty: 560 } }))).toBe("Misal Enerji için 560 adet alış gerçekleşti.");
    expect(auditSentence(entry({ action: "order.filled", payload: { qty: 620 } }))).toBe("620 adet alış gerçekleşti.");
    // The API's ticket.issued carries no company: say what is known, never "bir şirket için".
    expect(auditSentence(entry({ actor: "system:order_ticket", action: "ticket.issued", payload: { qty: 620, side: "buy" } }))).toBe("620 adetlik alış işlem hazırlandı.");
    expect(auditSentence(entry({ actor: "system:order_ticket", action: "ticket.issued", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş.", qty: 620 } }))).toBe("Misal Enerji için bankana gireceğin işlem hazırlandı.");
    expect(auditSentence(entry({ actor: "system:order_ticket", action: "ticket.issued" }))).toBe("Bankana gireceğin işlem hazırlandı.");
    // A record with only a ticker stays a code; the name comes from the record itself.
    expect(auditCompany(entry({ payload: { ticker: "ZZZZ" } }))).toEqual({ text: "ZZZZ", code: true });
    expect(auditCompany(entry({ payload: { ticker: "DMOEN", company: "DOĞU ENERJİ ÜRETİM A.Ş." } }))).toEqual({ text: "Doğu Enerji Üretim", code: false });
    expect(auditSentence(entry({ actor: "agent:request_approval", action: "proposal.created", payload: { ticker: "TMSPZ", company: "TOROS PERAKENDE A.Ş." } }))).toBe("KAPtan Toros Perakende için öneri hazırladı.");
    // An action this panel has no sentence for never shows its raw code.
    expect(auditSentence(entry({ actor: "user:sen", action: "garip.olay" }))).toBe("Bir işlem yaptın.");
    expect(auditSentence(entry({ actor: "system:scheduler", action: "garip.olay" }))).toBe("KAPtan bir işlem yaptı.");
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
      expect(auditSentence(entry({ action, actor: "user:sen" }))).not.toContain(action);
      expect(auditSentence(entry({ action, actor: "user:sen" }))).not.toMatch(/işlem yaptın/);
    }
  });
  it("searches the sentence, the person and the raw fields, Turkish-aware", () => {
    const e = entry({ actor: "user:sen", action: "approval.decided", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş.", decision: "approve" } });
    expect(auditMatches(e, "ONAYLADIN")).toBe(true);
    expect(auditMatches(e, "sen")).toBe(true);
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
    expect(actorParts("system:simbist")).toEqual({ name: "KAPtan", kind: "işlem kaydı" });
    expect(actorParts("agent:request_approval")).toEqual({ name: "KAPtan", kind: "Onay talebi" });
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
    expect(limitSentence("risk_per_trade_pct", 0.005)).toBe("Bir işlemde en fazla paranın %0,5’i riske girer.");
    expect(limitSentence("daily_loss_halt_pct", -0.01)).toBe("Paran bir günde %1 düşerse o gün yeni işlem olmaz.");
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

