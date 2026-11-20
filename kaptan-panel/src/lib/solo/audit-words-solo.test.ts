import type { AuditEntry } from "@/lib/domain";
import { auditMatches, auditSentence } from "@/lib/audit-words";

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

describe("ledger sentences for your own money", () => {
  const NB = " ";
  it("says what you put in", () => {
    expect(auditSentence(entry({ action: "money.started", payload: { amount_try: 50000 } }))).toBe(`Başlangıç paranı girdin: 50.000${NB}₺.`);
    expect(auditSentence(entry({ action: "money.deposited", payload: { amount_try: 1250.5 } }))).toBe(`Kasana para ekledin: 1.250,50${NB}₺.`);
    expect(auditSentence(entry({ action: "money.withdrawn", payload: { amount_try: 2000 } }))).toBe(`Kasandan para çektin: 2.000${NB}₺.`);
  });

  it("drops the amount instead of printing a blank when the record has none", () => {
    expect(auditSentence(entry({ action: "money.started", payload: {} }))).toBe("Başlangıç paranı girdin.");
  });

  it("says a share you already owned and its sale", () => {
    const payload = { ticker: "KRGCL", company: "KARGA ÇELİK A.Ş.", qty: 100, avg_cost: 12.5 };
    expect(auditSentence(entry({ action: "holding.added", payload }))).toBe(`Elindeki Karga Çelik hissesini ekledin: 100 adet, tanesi 12,50${NB}₺.`);
    expect(auditSentence(entry({ action: "holding.sold", payload }))).toBe("Karga Çelik hissesini sattığını kaydettin: 100 adet.");
    expect(auditSentence(entry({ action: "holding.added", payload: { ticker: "KRGCL", qty: 5 } }))).toBe("Elindeki KRGCL hissesini ekledin: 5 adet.");
  });

  it("finds them by search", () => {
    expect(auditMatches(entry({ action: "money.deposited", payload: { amount_try: 500 } }), "para ekledin")).toBe(true);
  });
});
