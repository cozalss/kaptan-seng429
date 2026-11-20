import { caretAfterFormat, formatMoneyDraft, liraInWords, moneyDraftOf, moneyError, parseMoney } from "./money-input";

describe("parseMoney", () => {
  it("reads the Turkish way: dots group thousands, the comma starts the kuruş", () => {
    expect(parseMoney("1.250,50")).toBe(1250.5);
    expect(parseMoney("1.250")).toBe(1250);
    expect(parseMoney("1.250.000")).toBe(1_250_000);
    expect(parseMoney("1250,5")).toBe(1250.5);
    expect(parseMoney("0,5")).toBe(0.5);
    expect(parseMoney("100000")).toBe(100_000);
  });

  it("understands a pasted number written the other way", () => {
    expect(parseMoney("1250.5")).toBe(1250.5);
    expect(parseMoney("1250.50")).toBe(1250.5);
    expect(parseMoney("1,250.50")).toBe(1250.5);
    expect(parseMoney("1,250,000")).toBe(1_250_000);
    expect(parseMoney("12.5")).toBe(12.5);
  });

  it("ignores the lira sign, TL and spaces around the figure", () => {
    expect(parseMoney(" 1.250,50 ₺ ")).toBe(1250.5);
    expect(parseMoney("₺5.000")).toBe(5000);
    expect(parseMoney("5 000 TL")).toBe(5000);
    expect(parseMoney("5 000 ₺")).toBe(5000);
  });

  it("has no float surprises: the figure is read once, from its digits", () => {
    expect(parseMoney("0,1")).toBe(0.1);
    expect(parseMoney("1.234.567,89")).toBe(1234567.89);
    expect(parseMoney("9.999.999.999,99")).toBe(9999999999.99);
  });

  it("returns null, never NaN, for anything that is not one plain amount", () => {
    for (const raw of ["", " ", "abc", "12a", "-5", "−5", "1,2,3", "1..2", "1.2.3", ",", ".", "1,", "1e5", "Infinity", "NaN", "0x10", "1.25.000", "12,345"]) {
      expect(parseMoney(raw), raw).toBeNull();
    }
  });

  it("takes more decimals only where asked (a share price)", () => {
    expect(parseMoney("48,325")).toBeNull();
    expect(parseMoney("48,325", 4)).toBe(48.325);
    expect(parseMoney("48,32555", 4)).toBeNull();
  });

  it("reads a lone comma group the Turkish way and a lone dot group by its length", () => {
    expect(parseMoney("1,25")).toBe(1.25);
    expect(parseMoney("1.25")).toBe(1.25);
    expect(parseMoney("1.250")).toBe(1250);
    expect(parseMoney("0.250", 4)).toBe(0.25);
  });
});

describe("formatMoneyDraft", () => {
  it("groups the lira as the person types and keeps what they typed after the comma", () => {
    expect(formatMoneyDraft("1")).toBe("1");
    expect(formatMoneyDraft("1250")).toBe("1.250");
    expect(formatMoneyDraft("12500")).toBe("12.500");
    expect(formatMoneyDraft("1250000")).toBe("1.250.000");
    expect(formatMoneyDraft("1250,")).toBe("1.250,");
    expect(formatMoneyDraft("1250,5")).toBe("1.250,5");
    expect(formatMoneyDraft("1.250,50")).toBe("1.250,50");
  });

  it("drops what cannot be part of an amount", () => {
    expect(formatMoneyDraft("12a5")).toBe("125");
    expect(formatMoneyDraft("1,2,3")).toBe("1,23");
    expect(formatMoneyDraft("1250,505")).toBe("1.250,50");
    expect(formatMoneyDraft("-5")).toBe("5");
    expect(formatMoneyDraft("")).toBe("");
  });

  it("drops leading zeros but keeps a single zero before the comma", () => {
    expect(formatMoneyDraft("007")).toBe("7");
    expect(formatMoneyDraft("0")).toBe("0");
    expect(formatMoneyDraft("0,5")).toBe("0,5");
    expect(formatMoneyDraft(",5")).toBe("0,5");
  });

  it("round-trips with the parser", () => {
    for (const n of [1, 12, 999, 1000, 1250.5, 100_000, 1_234_567.89]) {
      expect(parseMoney(formatMoneyDraft(moneyDraftOf(n)))).toBe(n);
    }
  });
});

describe("moneyDraftOf", () => {
  it("writes a number the way the field shows it", () => {
    expect(moneyDraftOf(1250.5)).toBe("1.250,50");
    expect(moneyDraftOf(5000)).toBe("5.000");
    expect(moneyDraftOf(0.1 + 0.2)).toBe("0,30");
    expect(moneyDraftOf(48.325, 4)).toBe("48,325");
  });
});

describe("caretAfterFormat", () => {
  it("keeps the caret after the same digit when dots appear or go", () => {
    // "1250|" → "1.250|"
    expect(caretAfterFormat("1250", 4, "1.250")).toBe(5);
    // "1|250" → "1|.250"
    expect(caretAfterFormat("1250", 1, "1.250")).toBe(1);
    // "12.50|0" typed a digit in the middle: "12.5|00" → "125.|00"? the caret stays after the 3rd digit
    expect(caretAfterFormat("12.500", 4, "12.500")).toBe(4);
    expect(caretAfterFormat("1.250,5", 7, "1.250,5")).toBe(7);
    expect(caretAfterFormat("", 0, "")).toBe(0);
  });
});

describe("moneyError", () => {
  it("says in plain words what is wrong, or nothing", () => {
    expect(moneyError("")).toBe("Bir tutar yaz.");
    expect(moneyError("abc")).toBe("Tutarı rakamla yaz. Örneğin 1.250,50");
    expect(moneyError("0")).toBe("Tutar sıfırdan büyük olmalı.");
    expect(moneyError("0,00")).toBe("Tutar sıfırdan büyük olmalı.");
    expect(moneyError("20.000.000.000")).toBe("Bu kadar büyük bir tutar girilemiyor. En çok 10.000.000.000 ₺ yazabilirsin.");
    expect(moneyError("1.250,50")).toBeNull();
    expect(moneyError("10.000.000.000")).toBeNull();
  });
});

describe("liraInWords", () => {
  it("reads the amount out the way a person says it", () => {
    expect(liraInWords(1)).toBe("bir lira");
    expect(liraInWords(1000)).toBe("bin lira");
    expect(liraInWords(1250.5)).toBe("bin iki yüz elli lira elli kuruş");
    expect(liraInWords(100_000)).toBe("yüz bin lira");
    expect(liraInWords(1_000_000)).toBe("bir milyon lira");
    expect(liraInWords(2_100_005)).toBe("iki milyon yüz bin beş lira");
    expect(liraInWords(1_250_000_000)).toBe("bir milyar iki yüz elli milyon lira");
    expect(liraInWords(0.05)).toBe("beş kuruş");
    expect(liraInWords(19.99)).toBe("on dokuz lira doksan dokuz kuruş");
    expect(liraInWords(1100)).toBe("bin yüz lira");
    expect(liraInWords(0)).toBe("sıfır lira");
  });
});
