import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "@/lib/audit-words";

const entry = (over: Partial<AuditEntry>): AuditEntry =>
  ({ chain_pos: 1, occurred_at: "2027-01-11T10:40:00Z", actor: "user:uye-3", action: "x", entity_type: "proposal", entity_id: "p", run_id: null, strategy_version: null, payload: {}, prev_hash: "", hash: "", ...over }) as AuditEntry;

describe("ledger sentences for single-user actions", () => {
  it("says Tut / Geç on a suggestion", () => {
    expect(auditSentence(entry({ action: "suggestion.held", payload: { ticker: "ORNEK" } }))).toBe("Risk Sorumlusu Örnek Enerji için “Tut” dedi.");
    expect(auditSentence(entry({ action: "suggestion.skipped", payload: { ticker: "ORNEK" } }))).toBe("Risk Sorumlusu Örnek Enerji önerisini geçti.");
  });

  it("says plainly that one person signed both steps", () => {
    expect(auditSentence(entry({ action: "auth.single_user_waiver", payload: { flow: "kill_reset" } }))).toBe("Tek kullanıcı modu: yeniden başlatmanın ikinci imzası aynı kişiden alındı.");
    expect(auditSentence(entry({ action: "auth.single_user_waiver", payload: { flow: "limits" } }))).toBe("Tek kullanıcı modu: sınır değişikliğinin ikinci imzası aynı kişiden alındı.");
    expect(auditSentence(entry({ action: "auth.single_user_waiver", payload: {} }))).toBe("Tek kullanıcı modu: iki imzalı adımın ikinci imzası aynı kişiden alındı.");
  });

  it("names the company on an issued ticket when the payload carries it (mock and backend alike)", () => {
    expect(auditSentence(entry({ actor: "system:order_ticket", action: "ticket.issued", payload: { ticker: "KRGCL", company: "KARGA ÇELİK A.Ş.", qty: 10, side: "buy" } }))).toBe("Karga Çelik için emir fişi yazıldı.");
  });
});
