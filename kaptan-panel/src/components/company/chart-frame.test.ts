import { endNameOffsets } from "./chart-frame";

describe("end names on the compare chart", () => {
  it("keeps each name on its line's end when the ends are apart", () => {
    expect(endNameOffsets([{ y: 20, series: "b" }, { y: 180, series: "a" }], 220)).toEqual([20, 180]);
  });

  it("pushes the two names apart when the ends nearly meet, keeping their order", () => {
    const [b, a] = endNameOffsets([{ y: 100, series: "b" }, { y: 104, series: "a" }], 220);
    expect(a! - b!).toBeCloseTo(220 * 0.12);
    expect(b!).toBeLessThan(a!);
  });
});
