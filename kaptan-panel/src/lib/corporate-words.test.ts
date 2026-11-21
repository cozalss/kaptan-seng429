import type { CorporateRecord } from "@/lib/domain/corporate";
import { dayWords, noticeHeadline, recordSentence } from "./corporate-words";

describe("the sentence a KAP notice becomes", () => {
  it("says only what was read (the same words as the backend)", () => {
    expect(noticeHeadline("TUPRS", { kind: "dividend", per_share_gross_try: 12.5, pay_date: "2026-12-03", bonus_pct: null })).toBe("TUPRS kâr payı dağıtacağını açıkladı: hisse başı 12,50 ₺ brüt, ödeme 3 Aralık. Hesabına geçince buraya yaz.");
    expect(noticeHeadline("TUPRS", { kind: "dividend", per_share_gross_try: null, pay_date: null, bonus_pct: null })).toBe("TUPRS kâr payı dağıtacağını açıkladı. Hesabına geçince buraya yaz.");
    expect(noticeHeadline("AYES", { kind: "bonus", per_share_gross_try: null, pay_date: null, bonus_pct: 100 })).toBe("AYES bedelsiz pay dağıtacağını açıkladı: her 100 paya 100 yeni pay. Paylar hesabına geçince yeni adedini buraya yaz.");
    expect(noticeHeadline("AYES", { kind: "bonus", per_share_gross_try: null, pay_date: null, bonus_pct: null })).not.toContain("her 100");
  });

  it("writes days in Turkish", () => {
    expect(dayWords("2027-01-20")).toBe("20 Ocak");
    expect(dayWords("2026-08-01")).toBe("1 Ağustos");
  });
});

describe("a record as one line", () => {
  const base: CorporateRecord = { id: "kurum-1", kind: "dividend", ticker: "KRGCL", company: "K", occurred_at: "2027-01-11T09:00:00.000Z", recorded_at: "2027-01-11T09:00:00.000Z", net_try: 850, gross_try: null, qty_added: null, qty_after: null, price: null, note: "", corrects: null, undone: false };
  it("names what came in and what it did to the cost", () => {
    expect(recordSentence(base)).toContain("kâr payı geldi");
    expect(recordSentence({ ...base, kind: "bonus", qty_added: 100, qty_after: 200 })).toBe("KRGCL: 100 yeni pay geldi, toplam 200 adet. Maliyetin aynı kaldı.");
    expect(recordSentence({ ...base, kind: "rights", qty_added: 50, net_try: 500 })).toContain("50 pay aldın");
    expect(recordSentence({ ...base, corrects: "kurum-1" })).toBe("KRGCL: kâr payı kaydını geri aldın.");
  });
});
