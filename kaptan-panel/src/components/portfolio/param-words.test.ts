import type { Position } from "@/lib/domain";
import { dateLocative, exitSentence, placesSentence, skyline, waterSplit } from "./param-words";

const pos = (over: Partial<Position> = {}): Position => ({
  id: "pos-1",
  origin: "suggestion",
  price_as_of: null,
  ticker: "ORNEK",
  company_name: "MİSAL ENERJİ A.Ş.",
  qty: 100,
  avg_cost: 40,
  last_price: 44,
  opened_at: "2027-01-04T06:55:00.000Z",
  planned_exit_date: "2027-02-01",
  holding_days: 7,
  source_proposal: "p1",
  run_id: "r1",
  event_type: "E3",
  strategy_version: "v1.1-fwd",
  unrealized_pnl: 400,
  realized_pnl: 0,
  managed_by_exit_rule: false,
  book: "paper",
  ...over,
});

describe("placesSentence", () => {
  it("counts every holding and the cash as a place", () => {
    expect(placesSentence(7, 682_947)).toBe("Paran 8 yerde duruyor.");
    expect(placesSentence(2, 0)).toBe("Paran 2 yerde duruyor.");
    expect(placesSentence(1, 100)).toBe("Paran 2 yerde duruyor.");
  });

  it("says one place in words, and never '1 yerde'", () => {
    expect(placesSentence(0, 500)).toBe("Paranın hepsi nakit duruyor.");
    expect(placesSentence(1, 0)).toBe("Paranın hepsi tek şirkette duruyor.");
  });

  it("has an honest line when there is nothing, and when the cash is unknown", () => {
    expect(placesSentence(0, 0)).toBe("Henüz hiç paran görünmüyor.");
    expect(placesSentence(3, null)).toBe("Paran 3 şirkette duruyor.");
    expect(placesSentence(1, null)).toBe("Paran 1 şirkette duruyor.");
    expect(placesSentence(0, null)).toBe("Şu an hiç hissen yok.");
  });
});

describe("dateLocative", () => {
  it("gives day and month with the month's own suffix", () => {
    expect(dateLocative("2027-02-14")).toBe("14 Şubat’ta");
    expect(dateLocative("2027-04-02")).toBe("2 Nisan’da");
    expect(dateLocative("2027-05-19")).toBe("19 Mayıs’ta");
    expect(dateLocative("2027-09-30")).toBe("30 Eylül’de");
    expect(dateLocative("2027-11-01")).toBe("1 Kasım’da");
    expect(dateLocative("2027-01-11")).toBe("11 Ocak’ta");
  });
});

describe("exitSentence", () => {
  it("says when KAPtan will suggest selling, in plain words", () => {
    expect(exitSentence(pos(), "2027-01-11")).toBe("KAPtan bunu 1 Şubat’ta satmayı önerecek.");
    expect(exitSentence(pos({ planned_exit_date: "2027-01-11" }), "2027-01-11")).toBe("KAPtan bunu bugün satmayı önerecek.");
    expect(exitSentence(pos({ planned_exit_date: "2027-01-08" }), "2027-01-11")).toBe("Planlanan satış günü geçti (8 Ocak).");
  });
});

describe("waterSplit", () => {
  it("puts what is up above the water and what is down below it, best and worst at the edges", () => {
    const up = pos({ ticker: "UP", last_price: 44 });
    const more = pos({ ticker: "MORE", last_price: 50 });
    const down = pos({ ticker: "DOWN", last_price: 36 });
    const flat = pos({ ticker: "FLAT", last_price: 40 });
    const input = [down, up, flat, more];
    const { above, below } = waterSplit(input);
    expect(above.map((p) => p.ticker)).toEqual(["MORE", "UP", "FLAT"]);
    expect(below.map((p) => p.ticker)).toEqual(["DOWN"]);
    expect(input[0]).toBe(down);
  });
});

describe("skyline", () => {
  it("sets the width by money and the height by the return, cash last with no height", () => {
    const s = skyline([pos({ ticker: "A", qty: 100, avg_cost: 40, last_price: 44 }), pos({ ticker: "B", qty: 300, avg_cost: 10, last_price: 9 })], 600);
    const a = s.columns.find((c) => c.ticker === "A");
    const b = s.columns.find((c) => c.ticker === "B");
    expect(a?.value).toBe(4400);
    expect(a?.share).toBeCloseTo(4400 / 7700);
    expect(b?.share).toBeCloseTo(2700 / 7700);
    expect(s.cashShare).toBeCloseTo(600 / 7700);
    expect(a?.height).toBeCloseTo(1);
    expect(b?.height).toBeCloseTo(1);
    expect(s.up).toBeCloseTo(0.1);
    expect(s.down).toBeCloseTo(0.1);
  });

  it("does not let a quiet day look dramatic: the scale never spans less than ±%5", () => {
    const s = skyline([pos({ avg_cost: 100, last_price: 101 })], 0);
    expect(s.up).toBeCloseTo(0.05);
    expect(s.columns[0]?.height).toBeCloseTo(0.2);
    expect(s.down).toBe(0);
  });

  it("is calm water with no holdings", () => {
    const s = skyline([], 500);
    expect(s.columns).toEqual([]);
    expect(s.cashShare).toBe(1);
  });
});
