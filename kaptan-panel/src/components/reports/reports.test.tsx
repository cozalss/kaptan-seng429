import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Karne } from "@/lib/domain";
import { summarizeTrack } from "@/lib/api/mock/reports";
import { currentPeriod, karneSentence, moneyRows, shiftPeriod } from "./report-words";
import { TrackSummaryBlock } from "./track-record";

const base: Karne = {
  period: "month", label_tr: "Kasım 2026", start: "2026-11-01", end: "2026-11-30", is_current: true, started: true,
  put_in_net: 10000, value_start: 0, value_end: 10420, gain_try: 420, realized_try: 120, unrealized_try: 300,
  commissions_try: 18.5, dividends_try: null,
  suggestions: { made: 0, took: 0, skipped: 0, declined: 0, expired: 0, waiting: 0 }, decisions: 0,
  track: summarizeTrack([]),
  benchmark: { start: null, end: null, available: false, you_ratio: null, index_ratio: null, sentence_tr: null, reason_tr: null },
  notes_tr: [],
};

describe("Karne words", () => {
  it("moves a month and a year, across the year edge", () => {
    expect(shiftPeriod("month", "2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("month", "2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("year", "2026", -1)).toBe("2025");
    expect(currentPeriod("month", "2026-11-21")).toBe("2026-11");
    expect(currentPeriod("year", "2026-11-21")).toBe("2026");
  });

  it("opens with what the money did, or why we cannot say", () => {
    expect(karneSentence(base)).toMatch(/^Kasım 2026 döneminde paran 420\s₺ arttı\.$/);
    expect(karneSentence({ ...base, gain_try: -80 })).toContain("azaldı");
    expect(karneSentence({ ...base, gain_try: null })).toContain("hesaplayamadım");
    expect(karneSentence({ ...base, started: false })).toContain("başlangıç paran yok");
  });

  it("leaves a row out when its figure is not known, dividends included", () => {
    const keys = moneyRows(base).map((r) => r.key);
    expect(keys).toEqual(["put-in", "start", "end", "gain", "realized", "unrealized", "commission"]);
    expect(moneyRows({ ...base, dividends_try: 40, unrealized_try: null }).map((r) => r.key)).toContain("dividends");
    expect(moneyRows({ ...base, value_end: null, gain_try: null }).map((r) => r.key)).not.toContain("gain");
  });
});

describe("TrackSummaryBlock", () => {
  it("shows the headline and the honest caveat, and no figures when nothing is finished", () => {
    render(<TrackSummaryBlock summary={summarizeTrack([])} />);
    expect(screen.getByText("KAPtan henüz sana öneri vermedi.")).toBeTruthy();
    expect(screen.queryByTestId("track-caveat")).toBeNull();
    expect(screen.queryByText("Ortalama sonuç")).toBeNull();
  });
});
