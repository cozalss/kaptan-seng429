import type { MoneyMovement } from "./money";
import { gainOf, homeSeries, horizonPoints, levelSeries, putInAt, signedFlow, withToday } from "./flows";

const mv = (kind: MoneyMovement["kind"], amount_try: number, occurred_at: string): MoneyMovement => ({ id: `${kind}-${occurred_at}`, kind, amount_try, occurred_at, note: "", status: "active", original_amount_try: null, changed_at: null });

const MOVES = [
  mv("start", 100_000, "2026-11-09T06:00:00.000Z"),
  mv("deposit", 5_000, "2026-11-12T09:30:00.000Z"),
  mv("withdrawal", 2_000, "2026-11-13T09:30:00.000Z"),
  // 23:30 UTC is already the next day in Istanbul.
  mv("holding", 3_000, "2026-11-13T23:30:00.000Z"),
];

describe("signedFlow and putInAt", () => {
  it("counts a withdrawal as money out and everything else as money in", () => {
    expect(MOVES.map(signedFlow)).toEqual([100_000, 5_000, -2_000, 3_000]);
  });

  it("adds up the money put in by the end of an Istanbul day", () => {
    expect(putInAt(MOVES, "2026-11-08")).toBe(0);
    expect(putInAt(MOVES, "2026-11-09")).toBe(100_000);
    expect(putInAt(MOVES, "2026-11-12")).toBe(105_000);
    expect(putInAt(MOVES, "2026-11-13")).toBe(103_000);
    expect(putInAt(MOVES, "2026-11-14")).toBe(106_000);
  });
});

describe("withToday", () => {
  const closes = [
    { date: "2026-11-09", equity: 100_000 },
    { date: "2026-11-10", equity: 100_400 },
  ];

  it("adds the live total as today's point after the closed days", () => {
    expect(withToday(closes, "2026-11-11", 100_900)).toEqual([...closes, { date: "2026-11-11", equity: 100_900 }]);
  });

  it("replaces a point the API already sent for today", () => {
    expect(withToday([...closes, { date: "2026-11-11", equity: 1 }], "2026-11-11", 100_900).at(-1)).toEqual({ date: "2026-11-11", equity: 100_900 });
  });

  it("gives a book with no close yet its one point, and leaves the series alone while the clock is unknown", () => {
    expect(withToday([], "2026-11-11", 50_000)).toEqual([{ date: "2026-11-11", equity: 50_000 }]);
    expect(withToday(closes, null, 100_900)).toEqual(closes);
  });
});

describe("a deposit does not look like a gain", () => {
  // The market did nothing on the 12th; the person added 5.000 ₺.
  const series = [
    { date: "2026-11-09", equity: 100_000 },
    { date: "2026-11-10", equity: 100_400 },
    { date: "2026-11-11", equity: 100_400 },
    { date: "2026-11-12", equity: 105_400 },
  ];
  const moves = MOVES.slice(0, 2);

  it("measures every day against the money put in by that day", () => {
    const points = horizonPoints(series, moves, 105_000);
    expect(points.map((p) => p.put_in)).toEqual([100_000, 100_000, 100_000, 105_000]);
    expect(points.map(gainOf)).toEqual([0, 400, 400, 400]);
  });

  it("draws a line with no step on the day of the deposit", () => {
    const levels = levelSeries(horizonPoints(series, moves, 105_000), 105_000);
    expect(levels.map((p) => p.equity)).toEqual([105_000, 105_400, 105_400, 105_400]);
  });

  it("a withdrawal is no fall either", () => {
    const after = [...series, { date: "2026-11-13", equity: 103_400 }];
    const points = horizonPoints(after, MOVES.slice(0, 3), 103_000);
    expect(points.map(gainOf)).toEqual([0, 400, 400, 400, 400]);
  });

  it("keeps the last day in step with the stated money put in, even if the movements disagree a little", () => {
    const points = horizonPoints(series, moves, 105_250);
    expect(points.at(-1)?.put_in).toBe(105_250);
    expect(points[0]?.put_in).toBe(100_250);
  });

  it("falls back to one level when the movements are not known", () => {
    expect(horizonPoints(series, null, 105_000).map((p) => p.put_in)).toEqual([105_000, 105_000, 105_000, 105_000]);
    expect(horizonPoints([], moves, 105_000)).toEqual([]);
  });
});

describe("homeSeries", () => {
  it("draws a deposit as a flat line, not a climb", () => {
    const closes = [
      { date: "2026-11-09", equity: 100_000 },
      { date: "2026-11-10", equity: 100_400 },
    ];
    const moves = [mv("start", 100_000, "2026-11-09T06:00:00.000Z"), mv("deposit", 5_000, "2026-11-11T09:30:00.000Z")];
    // Today the market did nothing: the total is the closing 100.400 plus the 5.000 that was put in.
    const line = homeSeries(closes, moves, "2026-11-11", 105_400, 105_000);
    expect(line.map((p) => p.equity)).toEqual([105_000, 105_400, 105_400]);
    expect(line.map((p) => p.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });
});
