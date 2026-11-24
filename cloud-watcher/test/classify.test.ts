import { describe, expect, it } from "vitest";
import { classify, routeFor } from "../src/classify";
import data from "../src/generated/subject_map.json";
import { parseRow } from "../src/kap";
import { normKey } from "../src/norm";
import { addDays, inQuiet, isTradingDay, previousTradingDay } from "../src/time";
import parity from "./fixtures/parity.json";

describe("normKey parity with the backend", () => {
  it.each(data.norm_vectors)("%j", (raw, expected) => {
    expect(normKey(raw as string)).toBe(expected);
  });
});

describe("classification parity with the backend (recorded KAP rows)", () => {
  it("says the same as Signal.important and the plain line for every recorded row", () => {
    expect(parity.rows.length).toBeGreaterThan(50);
    let important = 0;
    for (const exp of parity.rows) {
      const row = parseRow(exp.item);
      expect(row, `row ${exp.index} parses`).not.toBeNull();
      if (!row) continue;
      expect(row.index).toBe(exp.index);
      expect(row.ticker).toBe(exp.ticker);
      expect(row.route).toBe(exp.route);
      const got = classify(row, null);
      expect(got !== null, `row ${exp.index} important`).toBe(exp.important);
      if (exp.important && got) {
        important += 1;
        expect(got.kind).toBe(exp.kind);
        expect(got.line).toBe(exp.line);
        expect(got.tone).toBe(exp.tone);
        expect(got.soWhat).toBe(exp.so_what);
      }
    }
    expect(important).toBeGreaterThanOrEqual(5);
  });

  it("never puts money in a line: no price, no amount, no share count", () => {
    for (const exp of parity.rows) {
      const text = `${exp.line ?? ""} ${exp.so_what ?? ""}`;
      expect(text).not.toMatch(/₺|TL\b|adet|\d{3,}/);
    }
    for (const reading of Object.values(data.lines)) {
      expect(`${reading.line} ${reading.so_what ?? ""}`).not.toMatch(/₺|adet/);
    }
  });
});

describe("classify rules", () => {
  const base = { index: 1, ticker: "THYAO", company: "THY", summary: "", isNew: true, finYear: null, finPeriod: null, publishedAt: 0 };
  const row = (subject: string, over: Partial<Parameters<typeof classify>[0]> = {}) => ({ ...base, subject, route: routeFor(subject), ...over });

  it("an update or correction is not a new event", () => {
    expect(classify(row("Payların Geri Alınmasına İlişkin Bildirim", { isNew: false }))).toBeNull();
  });
  it("noise and unknown subjects are never important", () => {
    expect(classify(row("Pay Bazında Devre Kesici Bildirimi"))).toBeNull();
    expect(classify(row("Bir Bilinmeyen Konu"))).toBeNull();
  });
  it("needs a usable ticker", () => {
    expect(classify(row("Yeni İş İlişkisi", { ticker: null }))).toBeNull();
  });
  it("insider trades count only when the direction is known", () => {
    expect(classify(row("Pay Alım Satım Bildirimi", { summary: "Pay Alım Satım Bildirimi" }))).toBeNull();
    expect(classify(row("Pay Alım Satım Bildirimi", { summary: "Pay Alım Bildirimi" }))?.tone).toBe("olumlu");
    expect(classify(row("Pay Alım Satım Bildirimi", { summary: "Pay Satış Bildirimi" }), "held")?.tone).toBe("olumsuz");
  });
  it("earnings name the year and the quarter", () => {
    const got = classify(row("Finansal Rapor", { finYear: 2026, finPeriod: "2" }));
    expect(got?.line).toBe("2026 ikinci çeyrek finansal tablolarını açıkladı.");
    expect(classify(row("Finansal Rapor", { finYear: 2025, finPeriod: "4" }))?.line).toBe("2025 yıllık finansal tablolarını açıkladı.");
  });
  it("a bonus issue is told apart from a rights issue", () => {
    const subject = "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim";
    expect(classify(row(subject, { summary: "Bedelsiz sermaye artırımı" }))?.kind).toBe("capital");
    expect(classify(row(subject, { summary: "Bedelli" }))?.line).toContain("Bedelli");
  });
  it("the KAP exact-subject allowlist gives dividend and merger", () => {
    expect(classify(row("Kar Payı Dağıtım İşlemlerine İlişkin Bildirim"))?.kind).toBe("dividend");
    expect(classify(row("Birleşme İşlemlerine İlişkin Bildirim"))?.kind).toBe("merger");
  });
  it("an SPK measure is a restriction", () => {
    expect(classify(row("Sermaye Piyasası Kurulu Tedbir Kararı"))?.kind).toBe("restriction");
  });
});

describe("BIST calendar (generated from the backend)", () => {
  it("weekends and bayram days are closed, ordinary weekdays open", () => {
    expect(isTradingDay("2026-11-24")).toBe(true);
    expect(isTradingDay("2026-11-28")).toBe(false);
    expect(isTradingDay("2026-10-29")).toBe(false); // Cumhuriyet Bayramı
    expect(isTradingDay("2026-05-27")).toBe(false); // Kurban Bayramı day 1
    expect(isTradingDay("2030-01-01")).toBe(true); // outside the table: weekdays only
  });
  it("finds the previous trading day across a weekend", () => {
    expect(previousTradingDay("2026-11-30")).toBe("2026-11-27");
    expect(addDays("2026-11-30", -1)).toBe("2026-11-29");
  });
});

describe("quiet hours", () => {
  const quiet = { on: true, start: "22:00", end: "08:00" };
  it("covers a window across midnight and never an empty one", () => {
    expect(inQuiet(quiet, Date.parse("2026-11-24T20:30:00Z"))).toBe(true); // 23:30 Istanbul
    expect(inQuiet(quiet, Date.parse("2026-11-24T02:30:00Z"))).toBe(true); // 05:30 Istanbul
    expect(inQuiet(quiet, Date.parse("2026-11-24T05:30:00Z"))).toBe(false); // 08:30 Istanbul
  });
  it("is off when switched off or start equals end", () => {
    expect(inQuiet({ ...quiet, on: false }, Date.parse("2026-11-24T20:30:00Z"))).toBe(false);
    expect(inQuiet({ on: true, start: "10:00", end: "10:00" }, Date.parse("2026-11-24T08:00:00Z"))).toBe(false);
  });
});
