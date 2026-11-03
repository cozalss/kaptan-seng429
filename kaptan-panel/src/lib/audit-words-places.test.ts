import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "./audit-words";

const entry = (over: Partial<AuditEntry>): AuditEntry =>
  ({ chain_pos: 1, occurred_at: "2027-01-11T10:40:00Z", actor: "system:risk_monitor", action: "x", entity_type: "proposal", entity_id: "p", run_id: null, strategy_version: null, payload: {}, prev_hash: "", hash: "", ...over }) as AuditEntry;

describe("the sentences the diary was missing", () => {
  it("says an unanswered suggestion ran out", () => {
    expect(auditSentence(entry({ action: "approval.expired", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji önerisinin süresi doldu; karar vermedin.");
    expect(auditSentence(entry({ action: "approval.expired" }))).toBe("Bir önerinin süresi doldu; karar vermedin.");
  });

  it("says the daily pause lifted", () => {
    expect(auditSentence(entry({ action: "risk.halt_cleared" }))).toBe("Yeni gün başladı; günlük duraklama kalktı.");
  });

  it("says how the market's mood changed", () => {
    expect(auditSentence(entry({ action: "risk.regime_changed", payload: { from: "normal", to: "crisis" } }))).toBe("Piyasa kriz günlerine girdi; yeni alımlar yarı tutarla yapılacak.");
    expect(auditSentence(entry({ action: "risk.regime_changed", payload: { from: "crisis", to: "normal" } }))).toBe("Piyasa normale döndü.");
    expect(auditSentence(entry({ action: "risk.regime_changed" }))).toBe("Piyasanın durumu değişti.");
  });

  it("speaks about the forbidden list", () => {
    expect(auditSentence(entry({ actor: "user:sen", action: "restricted.added", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji yasak listene girdi.");
    expect(auditSentence(entry({ actor: "user:sen", action: "restricted.removal_requested", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji için yasak listesinden çıkmayı istedin.");
    expect(auditSentence(entry({ actor: "user:sen", action: "restricted.removed", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji yasak listenden çıktı.");
    expect(auditSentence(entry({ action: "restricted.added", payload: { kind: "x" } }))).toBe("Bir şirket yasak listene girdi.");
  });

  it("rewords the lonely approval", () => {
    expect(auditSentence(entry({ actor: "user:sen", action: "auth.single_user_waiver", payload: { flow: "limits" } }))).toBe("Tek başına onayladın; bu da kayda geçti.");
  });

  it("names a sell as a sell", () => {
    expect(auditSentence(entry({ actor: "system:simbist", action: "order.filled", payload: { qty: 620, side: "sell" } }))).toBe("620 adet satış gerçekleşti.");
  });
});
