import { smoothArea, smoothPath } from "./curve";

describe("smooth curves", () => {
  it("draws nothing under two points", () => {
    expect(smoothPath([[0, 1]])).toBe("");
    expect(smoothArea([], 10)).toBe("");
  });

  it("starts and ends on the real points and never overshoots a peak", () => {
    const d = smoothPath([[0, 10], [50, 0], [100, 10]]);
    expect(d.startsWith("M0,10C")).toBe(true);
    expect(d.endsWith(",100,10")).toBe(true);
    const ys = d.replace(/[MC]/g, ",").split(",").filter(Boolean).map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it("closes the wash to the baseline", () => {
    const d = smoothArea([[0, 5], [10, 2]], 20);
    expect(d).toContain("L10,20");
    expect(d.endsWith("Z")).toBe(true);
  });
});
