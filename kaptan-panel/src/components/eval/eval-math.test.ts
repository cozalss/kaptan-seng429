import { evalSummary } from "@/mocks/eval";
import { bulletFraction, canSeeCost, codeShares, commonPeriodReturn, excessVsBist, fmtRatio, heatCell, isPrimary, rowShares } from "./eval-math";
import { parseBriefDate, recentSessions, sortWarnings, briefIndex } from "../brief/brief-math";

describe("eval maths", () => {
  it("marks only the pre-registered primary windows", () => {
    expect(isPrimary({ event_type: "E1" }, "car_20")).toBe(true);
    expect(isPrimary({ event_type: "E3" }, "car_5")).toBe(true);
    expect(isPrimary({ event_type: "E3" }, "car_20")).toBe(false);
    expect(isPrimary({ event_type: "ALL" }, "car_20")).toBe(false);
  });
  it("row-normalises the confusion matrix and survives an empty row", () => {
    expect(rowShares([[3, 1], [0, 0]])).toEqual([[0.75, 0.25], [0, 0]]);
  });
  it("keeps AA text on heat cells: ink up to 60 % wash, light text from 80 %", () => {
    expect(heatCell(0)).toEqual({ background: "rgb(43 66 97 / 0)", dark: false });
    expect(heatCell(0.49).dark).toBe(false);
    expect(heatCell(0.49).background).toBe("rgb(43 66 97 / 0.59)");
    expect(heatCell(0.5)).toEqual({ background: "rgb(43 66 97 / 0.8)", dark: true });
    expect(heatCell(2).background).toBe("rgb(43 66 97 / 0.95)");
  });
  it("clamps bullet positions", () => {
    expect(bulletFraction(0.5, 1)).toBe(0.5);
    expect(bulletFraction(2, 1)).toBe(1);
    expect(bulletFraction(-1, 1)).toBe(0);
    expect(bulletFraction(1, 0)).toBe(0);
  });
  it("computes the common-period return and the excess over BIST-100", () => {
    const e = evalSummary();
    const k = commonPeriodReturn(e.l4.series, "kaptan:v1.1-fwd", e.l4.since.v1_1);
    const b = commonPeriodReturn(e.l4.series, "baseline:xu100_bh", e.l4.since.v1_1);
    expect(k).not.toBeNull();
    expect(excessVsBist(e)).toBeCloseTo((k as number) - (b as number));
    expect(commonPeriodReturn(e.l4.series, "ablation:none", "2026-11-23")).toBeNull();
    expect(excessVsBist({ l4: { ...e.l4, series: [] } })).toBeNull();
  });
  it("hides the cost panel from the Analyst only", () => {
    expect(canSeeCost("analyst")).toBe(false);
    expect(canSeeCost("auditor")).toBe(true);
    expect(canSeeCost("risk_officer")).toBe(true);
    expect(canSeeCost("admin")).toBe(true);
  });
  it("shares red-team behaviour codes", () => {
    expect(codeShares({ Q: 3, N: 1, H: 0, F: 0 })).toEqual([
      { code: "Q", n: 3, share: 0.75 },
      { code: "N", n: 1, share: 0.25 },
      { code: "H", n: 0, share: 0 },
      { code: "F", n: 0, share: 0 },
    ]);
    expect(codeShares({ Q: 0, N: 0, H: 0, F: 0 })[0]?.share).toBe(0);
  });
  it("formats ratios the Turkish way", () => {
    expect(fmtRatio(0.86)).toBe("0,86");
    expect(fmtRatio(2.3, 1)).toBe("2,3");
  });
});

describe("brief maths", () => {
  it("accepts only real calendar dates", () => {
    expect(parseBriefDate("2027-01-08")).toBe("2027-01-08");
    expect(parseBriefDate("2027-02-30")).toBeNull();
    expect(parseBriefDate("08.01.2027")).toBeNull();
    expect(parseBriefDate(undefined)).toBeNull();
  });
  it("lists the last sessions, skipping weekends and holidays", () => {
    expect(recentSessions("2027-01-11", 4)).toEqual(["2027-01-11", "2027-01-08", "2027-01-07", "2027-01-06"]);
    expect(recentSessions("2027-01-04", 2)).toEqual(["2027-01-04", "2026-12-31"]);
  });
  it("orders warnings critical → warn → info, stable within a level", () => {
    const ws = [
      { level: "info" as const, text_tr: "a" },
      { level: "warn" as const, text_tr: "b" },
      { level: "critical" as const, text_tr: "c" },
      { level: "warn" as const, text_tr: "d" },
    ];
    expect(sortWarnings(ws).map((w) => w.text_tr)).toEqual(["c", "b", "d", "a"]);
  });
  it("indexes the brief sections", () => {
    const idx = briefIndex({
      date: "2027-01-11",
      generated_at: "2027-01-11T05:45:00.000Z",
      important_disclosures: [],
      orders_for_open: [],
      pending_approvals: [],
      open_positions: [],
      expiring_today: [],
      risk_warnings: [],
      restriction_changes: [{ ticker: "TMSLJ", kind: "spk_tedbir", change: "added", at: "2027-01-07T15:20:00.000Z" }],
      summary_tr: "",
      is_sample: true,
    });
    expect(idx.find((i) => i.label === "tedbir değişikliği")?.n).toBe(1);
    expect(idx).toHaveLength(5);
  });
});
