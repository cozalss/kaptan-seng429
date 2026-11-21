import { describe, expect, it } from "vitest";
import { rebaseTo100, rebasedChange } from "./rebase";

const pts = (xs: Array<[string, number]>) => xs.map(([d, close]) => ({ d, close }));

describe("rebaseTo100", () => {
  it("starts both lines at 100 on the first shared day", () => {
    const r = rebaseTo100(pts([["2026-01-02", 10], ["2026-01-05", 12]]), pts([["2026-01-02", 200], ["2026-01-05", 190]]));
    expect(r.from).toBe("2026-01-02");
    expect(r.a).toEqual([100, 120]);
    expect(r.b).toEqual([100, 95]);
    expect(rebasedChange(r.a)).toBe(20);
    expect(rebasedChange(r.b)).toBe(-5);
  });

  it("drops days only one series has and starts at the first shared one", () => {
    const r = rebaseTo100(pts([["2026-01-01", 5], ["2026-01-02", 10], ["2026-01-05", 11]]), pts([["2026-01-02", 4], ["2026-01-05", 6]]));
    expect(r.days).toEqual(["2026-01-02", "2026-01-05"]);
    expect(r.a[0]).toBe(100);
  });

  it("is empty rather than guessing with fewer than two shared days", () => {
    expect(rebaseTo100(pts([["2026-01-01", 5]]), pts([["2026-01-01", 5]])).days).toEqual([]);
    expect(rebaseTo100([], [])).toEqual({ from: null, days: [], a: [], b: [] });
    expect(rebasedChange([])).toBeNull();
  });
});
