import { chartGeometry, CHART_H, CHART_W, filterPeriod, monthsBefore, nearestPoint, niceTicks, periodIsDistinct } from "./period";

const days = (from: string, n: number, start = 1_000_000, step = 1_000) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, equity: start + i * step };
  });

describe("chart periods", () => {
  it("counts calendar months back and clamps the day", () => {
    expect(monthsBefore("2027-01-11", 1)).toBe("2026-12-11");
    expect(monthsBefore("2027-03-31", 1)).toBe("2027-02-28");
    expect(monthsBefore("2027-01-11", 3)).toBe("2026-10-11");
  });

  it("keeps the last month, three months, or everything", () => {
    const series = days("2026-09-01", 133);
    expect(filterPeriod(series, "Tümü")).toHaveLength(133);
    const month = filterPeriod(series, "1A");
    expect(month[0]?.date).toBe("2026-12-11");
    expect(month[month.length - 1]?.date).toBe("2027-01-11");
    expect(filterPeriod(series, "3A")[0]?.date).toBe("2026-10-11");
  });

  it("never returns fewer than two points and handles an empty series", () => {
    const sparse = [
      { date: "2026-01-01", equity: 1 },
      { date: "2027-01-11", equity: 2 },
    ];
    expect(filterPeriod(sparse, "1A")).toHaveLength(2);
    expect(filterPeriod([], "1A")).toEqual([]);
  });

  it("closes a period that would show the same as everything", () => {
    const short = days("2026-11-22", 50);
    expect(periodIsDistinct(short, "1A")).toBe(true);
    expect(periodIsDistinct(short, "3A")).toBe(false);
    expect(periodIsDistinct(short, "Tümü")).toBe(true);
  });
});

describe("chart geometry", () => {
  it("needs two points", () => {
    expect(chartGeometry([{ date: "2027-01-11", equity: 1 }], null)).toBeNull();
  });

  it("spans the box and keeps the starting money in range", () => {
    const geo = chartGeometry(days("2027-01-01", 5, 1_010_000, 2_000), 1_000_000)!;
    expect(geo.xy[0]?.x).toBe(0);
    expect(geo.xy[4]?.x).toBe(CHART_W);
    expect(geo.min).toBeLessThan(1_000_000);
    const base = geo.yOf(1_000_000);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(CHART_H);
    // Higher money sits higher on screen.
    expect(geo.xy[4]!.y).toBeLessThan(geo.xy[0]!.y);
    expect(geo.line.startsWith("M0.0")).toBe(true);
    expect(geo.area.endsWith("Z")).toBe(true);
  });

  it("picks round ticks and the nearest point", () => {
    expect(niceTicks(1_000_000, 1_020_000)).toEqual([1_000_000, 1_010_000, 1_020_000]);
    expect(niceTicks(0, 0).length).toBeGreaterThan(0);
    expect(nearestPoint(0.49, 3)).toBe(1);
    expect(nearestPoint(2, 3)).toBe(2);
    expect(nearestPoint(-1, 3)).toBe(0);
    expect(nearestPoint(0.5, 1)).toBe(0);
  });
});
