import { checkHoldingDraft, checkSaleDraft, tickerFromTyping, type HoldingDraft } from "./holding-draft";

const TODAY = "2026-11-19";
const ok: HoldingDraft = { ticker: "THYAO", qty: "1.250", cost: "48,32", boughtOn: "2026-10-02" };

describe("tickerFromTyping", () => {
  it("upper-cases the Turkish way and drops what a share code cannot hold", () => {
    expect(tickerFromTyping("thyao")).toBe("THYAO");
    expect(tickerFromTyping("ıs kc")).toBe("ISKC");
    expect(tickerFromTyping("krgsg.e")).toBe("KRGSGE");
    expect(tickerFromTyping("abcdefgh")).toBe("ABCDEF");
  });
});

describe("checkHoldingDraft", () => {
  it("builds the request once every field reads", () => {
    const r = checkHoldingDraft(ok, TODAY);
    expect(r.errors).toEqual({ ticker: null, qty: null, cost: null, boughtOn: null });
    expect(r.input).toEqual({ ticker: "THYAO", qty: 1250, avg_cost: 48.32, bought_on: "2026-10-02" });
  });

  it("says what is wrong, field by field, and sends nothing", () => {
    const r = checkHoldingDraft({ ticker: "AB", qty: "0", cost: "", boughtOn: "" }, TODAY);
    expect(r.input).toBeNull();
    expect(r.errors.ticker).toMatch(/hisse kodu/i);
    expect(r.errors.qty).toMatch(/adet/i);
    expect(r.errors.cost).toMatch(/lira/i);
    expect(r.errors.boughtOn).toMatch(/tarih/i);
  });

  it("refuses a day that has not come yet and a share count with kuruş", () => {
    expect(checkHoldingDraft({ ...ok, boughtOn: "2026-11-20" }, TODAY).errors.boughtOn).toMatch(/gelmedi/);
    expect(checkHoldingDraft({ ...ok, qty: "10,5" }, TODAY).errors.qty).toMatch(/tam sayı/);
  });

  it("takes the price with four decimals", () => {
    expect(checkHoldingDraft({ ...ok, cost: "48,3250" }, TODAY).input?.avg_cost).toBe(48.325);
  });
});

describe("checkSaleDraft", () => {
  const held = 300;
  it("reads quantity, price and the bank's commission (optional)", () => {
    const r = checkSaleDraft({ qty: "100", price: "52,10", commission: "" }, held);
    expect(r.errors).toEqual({ qty: null, price: null, commission: null });
    expect(r.input).toEqual({ qty: 100, price: 52.1, commission_try: undefined });
    expect(checkSaleDraft({ qty: "100", price: "52,10", commission: "6,25" }, held).input?.commission_try).toBe(6.25);
  });

  it("refuses more than is held and a price of zero", () => {
    expect(checkSaleDraft({ qty: "301", price: "52", commission: "" }, held).errors.qty).toMatch(/300/);
    expect(checkSaleDraft({ qty: "5", price: "0", commission: "" }, held).errors.price).toBeTruthy();
  });

  it("accepts a zero commission: some banks charge none", () => {
    expect(checkSaleDraft({ qty: "5", price: "9", commission: "0" }, held).input?.commission_try).toBe(0);
  });
});
