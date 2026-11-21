import { exactPriceTime, fmtMoney, holdingPriceSentence, movementDay, movementSentence, movementWhat, priceAgePhrase, pricesAgeSentence } from "./money-words";

const NBSP = " ";
// Thursday 19 November 2026, 15:00 in Istanbul.
const NOW = Date.parse("2026-11-19T12:00:00.000Z");

describe("fmtMoney", () => {
  it("shows the kuruş only when there is some", () => {
    expect(fmtMoney(5000)).toBe(`5.000${NBSP}₺`);
    expect(fmtMoney(1250.5)).toBe(`1.250,50${NBSP}₺`);
    expect(fmtMoney(0.1 + 0.2)).toBe(`0,30${NBSP}₺`);
    expect(fmtMoney(4999.999)).toBe(`5.000${NBSP}₺`);
  });
});

describe("money movements in plain sentences", () => {
  it("says the day and what happened", () => {
    expect(movementSentence({ kind: "deposit", amount_try: 5000, occurred_at: "2026-11-12T09:30:00.000Z" }, NOW)).toBe(`12 Kasım: 5.000${NBSP}₺ ekledin.`);
    expect(movementSentence({ kind: "withdrawal", amount_try: 1250.5, occurred_at: "2026-11-13T09:30:00.000Z" }, NOW)).toBe(`13 Kasım: 1.250,50${NBSP}₺ çektin.`);
    expect(movementSentence({ kind: "start", amount_try: 100_000, occurred_at: "2026-11-09T06:00:00.000Z" }, NOW)).toBe(`9 Kasım: 100.000${NBSP}₺ ile başladın.`);
  });

  it("says a hand-entered share was already owned and what was paid for it", () => {
    expect(movementWhat({ kind: "holding", amount_try: 3000 })).toBe(`Zaten elinde olan bir hisseyi ekledin; alırken 3.000${NBSP}₺ ödemiştin.`);
  });

  it("uses the Istanbul day and names the year only when it is another year", () => {
    expect(movementDay("2026-11-12T22:30:00.000Z", NOW)).toBe("13 Kasım");
    expect(movementDay("2025-12-30T09:00:00.000Z", NOW)).toBe("30 Aralık 2025");
    expect(movementDay("2025-12-30T09:00:00.000Z", null)).toBe("30 Aralık");
  });
});

describe("how old the prices are", () => {
  it("today: the clock time, with its suffix read aloud correctly", () => {
    expect(priceAgePhrase("2026-11-19T11:05:00.000Z", NOW)).toBe("bugün 14:05’ten");
    expect(priceAgePhrase("2026-11-19T07:10:00.000Z", NOW)).toBe("bugün 10:10’dan");
    expect(pricesAgeSentence("2026-11-19T11:05:00.000Z", NOW)).toBe("Fiyatlar bugün 14:05’ten.");
  });

  it("yesterday: the evening's close, or the time when it was earlier", () => {
    expect(pricesAgeSentence("2026-11-18T15:10:00.000Z", NOW)).toBe("Fiyatlar dün akşamdan.");
    expect(pricesAgeSentence("2026-11-18T08:20:00.000Z", NOW)).toBe("Fiyatlar dün 11:20’den.");
  });

  it("older: the day itself", () => {
    expect(pricesAgeSentence("2026-11-13T15:10:00.000Z", NOW)).toBe("Fiyatlar 13 Kasım gününden.");
  });

  it("claims nothing without holdings, without a clock, or from an unreadable time", () => {
    expect(pricesAgeSentence(null, NOW)).toBeNull();
    expect(pricesAgeSentence("2026-11-19T11:05:00.000Z", null)).toBeNull();
    expect(pricesAgeSentence("yok", NOW)).toBeNull();
  });

  it("one holding: its own price, or the truth that none has come yet", () => {
    expect(holdingPriceSentence("2026-11-19T11:05:00.000Z", NOW)).toBe("Fiyatı bugün 14:05’ten.");
    expect(holdingPriceSentence(null, NOW)).toBe("Fiyatı henüz gelmedi; aldığın fiyattan sayılıyor.");
    expect(holdingPriceSentence("2026-11-19T11:05:00.000Z", null)).toBeNull();
  });

  it("gives the exact time for a hover or a focus", () => {
    expect(exactPriceTime("2026-11-19T11:05:00.000Z")).toBe("Tam zamanı: 19 Kasım 2026 14:05");
  });
});
