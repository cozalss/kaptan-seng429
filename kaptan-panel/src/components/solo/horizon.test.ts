import type { Position } from "@/lib/domain";
import { NBSP } from "@/lib/format";
import { boatLean, dayReading, daySentence, differenceWords, moneyMarks, plotGeometry, restGeometry, todayAmount, type PlotBox } from "./horizon";

const plain = (t: string) => t.replaceAll(NBSP, " ");
const pt = (i: number, equity: number) => ({ date: `2027-01-${String(i + 1).padStart(2, "0")}`, equity });
const box: PlotBox = { width: 1000, height: 500, top: 60, bottom: 40, right: 100, clear: [] };

describe("the day's sentence", () => {
  const base = { equityNow: 1_002_000, tradingDay: true, started: true };

  it("says how much the money rose or fell today", () => {
    expect(daySentence({ ...base, todayPct: 0.002 })).toEqual({ mood: "up", first: "Paran bugün", second: { amount: 2000, rest: "arttı." } });
    expect(daySentence({ ...base, todayPct: -0.002 })).toEqual({ mood: "down", first: "Paran bugün", second: { amount: 2008, rest: "azaldı." } });
  });

  it("says plainly when nothing moved, the market is closed, or the day is not known", () => {
    expect(daySentence({ ...base, todayPct: 0 }).mood).toBe("flat");
    expect(daySentence({ ...base, todayPct: 0.002, tradingDay: false })).toMatchObject({ mood: "closed", first: "Borsa bugün kapalı." });
    expect(daySentence({ ...base, todayPct: null })).toMatchObject({ mood: "unknown", second: { amount: null } });
  });

  it("tells a person with no history that the money is ready, even on a closed day", () => {
    expect(daySentence({ ...base, todayPct: null, started: false, tradingDay: false })).toMatchObject({ mood: "new", first: "Paran hazır," });
  });

  it("works out today's move in lira, and never divides by a wiped-out day", () => {
    expect(Math.round(todayAmount(1_002_000, 0.002))).toBe(2000);
    expect(todayAmount(5, -1)).toBe(0);
  });
});

describe("the difference from the start, in words", () => {
  it("says above, below or exactly there", () => {
    expect(plain(differenceWords(1_012_400, 1_000_000))).toBe("Başladığın yerden 12.400 ₺ yukarıda.");
    expect(plain(differenceWords(990_000, 1_000_000))).toBe("Başladığın yerden 10.000 ₺ aşağıda.");
    expect(differenceWords(1_000_000.2, 1_000_000)).toBe("Tam başladığın yerde.");
  });

  it("reads a scrubbed day aloud with what happened on it", () => {
    const mark = { index: 0, date: "2027-01-01", text: "FRZEN aldın", sentence: "FRZEN aldın · 3.000 ₺" };
    expect(plain(dayReading(pt(0, 1_000_500), 1_000_000, mark))).toContain("500 ₺ yukarıda. FRZEN aldın · 3.000 ₺.");
    expect(plain(dayReading(pt(0, 1_000_000), 1_000_000, undefined))).toContain("Tam başladığın yerde.");
  });
});

describe("the marks on the line", () => {
  const pos = (ticker: string, day: string, qty = 100, cost = 10) => ({ ticker, opened_at: `${day}T07:00:00Z`, qty, avg_cost: cost }) as Position;
  const points = [pt(0, 1), pt(1, 1), pt(3, 1), pt(4, 1)]; // 01, 02, 04, 05: no point on the 3rd

  it("puts each day's buys on one mark, in order", () => {
    const marks = moneyMarks(points, [pos("B", "2027-01-05"), pos("A", "2027-01-02"), pos("C", "2027-01-02")]);
    expect(marks.map((m) => [m.index, m.text])).toEqual([
      [1, "A, C aldın"],
      [3, "B aldın"],
    ]);
    expect(plain(marks[0]?.sentence ?? "")).toBe("A, C aldın · 2.000 ₺");
  });

  it("lands on the next point when the day has none, and leaves out what is past the period", () => {
    expect(moneyMarks(points, [pos("A", "2027-01-03")])[0]?.index).toBe(2);
    expect(moneyMarks(points, [pos("A", "2027-02-01")])).toEqual([]);
  });
});

describe("the geometry", () => {
  it("always has the waterline on screen, even when the money never touched it", () => {
    const geo = plotGeometry([pt(0, 1_100_000), pt(1, 1_200_000)], 1_000_000, box);
    expect(geo?.waterY).toBe(460);
    expect(geo?.xy[0]?.y).toBeLessThan(geo?.waterY ?? 0);
  });

  it("puts money above the start above the waterline and below it below", () => {
    const geo = plotGeometry([pt(0, 1_000_000), pt(1, 1_100_000), pt(2, 900_000)], 1_000_000, box);
    expect(geo?.xy[1]?.y).toBeLessThan(geo?.waterY ?? 0);
    expect(geo?.xy[2]?.y).toBeGreaterThan(geo?.waterY ?? 0);
  });

  it("leaves open water past today, for the boat", () => {
    expect(plotGeometry([pt(0, 1), pt(1, 2)], 1, box)?.xy[1]?.x).toBe(900);
  });

  it("keeps the line under the words until it is past them, and lets it rise beside them", () => {
    const words = { ...box, clear: [{ right: 500, bottom: 300 }] };
    const blocked = plotGeometry([pt(0, 1_000_000), pt(1, 1_200_000), pt(2, 1_000_000)], 1_000_000, { ...words, clear: [{ right: 1000, bottom: 300 }] });
    expect(blocked?.xy[1]?.y).toBeGreaterThanOrEqual(300);
    const free = plotGeometry([pt(0, 1_000_000), pt(1, 1_010_000), pt(2, 1_200_000)], 1_000_000, words);
    expect(free?.xy[2]?.y).toBe(words.top);
    expect(free?.xy[0]?.y).toBeGreaterThanOrEqual(300);
  });

  it("does not make a mountain of a few liras", () => {
    const geo = plotGeometry([pt(0, 1_000_000), pt(1, 1_000_100)], 1_000_000, box);
    expect((geo?.waterY ?? 0) - (geo?.xy[1]?.y ?? 0)).toBeLessThan(20);
  });

  it("needs two days for a line, and otherwise rests the boat on the water", () => {
    expect(plotGeometry([pt(0, 1)], 1, box)).toBeNull();
    expect(restGeometry(box)).toEqual({ xy: [{ x: 900, y: 460 }], line: "", waterY: 460 });
  });

  it("leans the boat with the line, a little", () => {
    const xy = [
      { x: 0, y: 100 },
      { x: 10, y: 0 },
      { x: 20, y: 200 },
    ];
    expect(boatLean(xy, 0)).toBe(-9);
    expect(boatLean(xy, 2)).toBe(9);
    expect(boatLean([{ x: 0, y: 0 }], 0)).toBe(0);
  });
});
