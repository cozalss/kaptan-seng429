import { moneyHatch, seaStrokes, seaSurface } from "./engrave";

describe("the engraver", () => {
  it("draws the same sea every time, and a different one for another seed", () => {
    expect(seaStrokes(400, 200)).toBe(seaStrokes(400, 200));
    expect(seaStrokes(400, 200, 0, 1)).not.toBe(seaStrokes(400, 200, 0, 2));
  });

  it("starts the sea at the horizon, with tight strokes near it and sparser ones toward the viewer", () => {
    const ys = [...seaStrokes(800, 600, 100).matchAll(/M[-\d.]+ ([-\d.]+)Q/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(100);
    const near = ys.filter((y) => y < 200).length;
    const far = ys.filter((y) => y >= 400 && y < 500).length;
    expect(near).toBeGreaterThan(far);
  });

  const line = [
    { x: 0, y: 100 },
    { x: 100, y: 50 },
    { x: 200, y: 150 },
    { x: 300, y: 100 },
  ];

  it("hatches a rise with one slant and a fall with two, so up and down differ without colour", () => {
    const { up, down } = moneyHatch(line, 100);
    expect(up).not.toBe("");
    expect(down).not.toBe("");
    const count = (d: string) => d.split("M").length - 1;
    const rise = moneyHatch(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      100,
    );
    const fall = moneyHatch(
      [
        { x: 0, y: 150 },
        { x: 100, y: 150 },
      ],
      100,
    );
    expect(fall.up).toBe("");
    expect(rise.down).toBe("");
    expect(count(fall.down)).toBe(count(rise.up) * 2);
  });

  it("thins the hatching toward the waterline: most strokes stop short of it", () => {
    const { up } = moneyHatch(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ],
      100,
    );
    const ends = [...up.matchAll(/L[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(ends.filter((y) => y > 90).length).toBeLessThan(ends.length / 2);
  });

  it("draws nothing for a line that sits on the water, or no line at all", () => {
    expect(
      moneyHatch(
        [
          { x: 0, y: 100 },
          { x: 100, y: 100 },
        ],
        100,
      ),
    ).toEqual({ up: "", down: "" });
    expect(moneyHatch([], 100)).toEqual({ up: "", down: "" });
  });

  it("lets the sea drop with the money and never rise above the waterline", () => {
    const d = seaSurface(line, 100, 400, 300);
    const ys = [...d.matchAll(/[ML][-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBe(100);
    expect(Math.max(...ys)).toBe(150);
    expect(d).toContain("V300");
    expect(seaSurface([], 100, 400, 300)).toBe("M0 100.0H400.0V300.0H0Z");
  });
});
