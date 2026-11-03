import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "@/lib/audit-words";

const entry = (over: Partial<AuditEntry>): AuditEntry =>
  ({ chain_pos: 1, occurred_at: "2027-01-11T10:40:00Z", actor: "user:sen", action: "x", entity_type: "proposal", entity_id: "p", run_id: null, strategy_version: null, payload: {}, prev_hash: "", hash: "", ...over }) as AuditEntry;

describe("ledger sentences for your own actions", () => {
  it("says Tut / Geç on a suggestion", () => {
    expect(auditSentence(entry({ action: "suggestion.held", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji için “Tut” dedin.");
    expect(auditSentence(entry({ action: "suggestion.skipped", payload: { ticker: "ORNEK", company: "MİSAL ENERJİ A.Ş." } }))).toBe("Misal Enerji önerisini geçtin.");
  });

  it("says plainly that one person signed both steps", () => {
    expect(auditSentence(entry({ action: "auth.single_user_waiver", payload: { flow: "kill_reset" } }))).toBe("Tek başına onayladın; bu da kayda geçti.");
    expect(auditSentence(entry({ action: "auth.single_user_waiver", payload: {} }))).toBe("Tek başına onayladın; bu da kayda geçti.");
  });

  it("names the company on an issued ticket when the payload carries it (mock and backend alike)", () => {
    expect(auditSentence(entry({ actor: "system:order_ticket", action: "ticket.issued", payload: { ticker: "KRGCL", company: "KARGA ÇELİK A.Ş.", qty: 10, side: "buy" } }))).toBe("Karga Çelik için bankana gireceğin işlem hazırlandı.");
  });
});
