import { squarify } from "./treemap";

describe("the map of the money", () => {
  it("gives every tile exactly its share of the area, inside the box, with no overlap", () => {
    const values = [683, 80, 52, 51, 51, 50, 49];
    const total = values.reduce((s, v) => s + v, 0);
    const rects = squarify(values, 1100, 480);
    expect(rects).toHaveLength(values.length);
    for (const r of rects) {
      expect(r.w * r.h).toBeCloseTo(((values[r.index] ?? 0) / total) * 1100 * 480, 3);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1100.001);
      expect(r.y + r.h).toBeLessThanOrEqual(480.001);
    }
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x + 0.001 || b.x + b.w <= a.x + 0.001 || a.y + a.h <= b.y + 0.001 || b.y + b.h <= a.y + 0.001;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps tiles near square, so labels fit", () => {
    for (const r of squarify([50, 50, 50, 50], 400, 400)) expect(r.w / r.h).toBeCloseTo(1, 5);
  });

  it("skips nothing-at-all and copes with an empty or sizeless box", () => {
    expect(squarify([0, 10, 0], 100, 100).map((r) => r.index)).toEqual([1]);
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify([1], 0, 100)).toEqual([]);
  });
});
