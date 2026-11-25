import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb } from "@/lib/api/mock/db";
import { dayLabel, daysBetween, groupByDay, inWords } from "@/lib/agenda/agenda";
import { Calendar, MarketStrip } from "@/lib/domain/agenda";
import { renderWithDesk } from "../harness.test-utils";
import { MarketStrip as MarketStripView } from "./market-strip";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

describe("calendar words", () => {
  it("says today, tomorrow, then the date with its weekday", () => {
    expect(dayLabel("2026-11-21", "2026-11-21")).toBe("Bugün");
    expect(dayLabel("2026-11-22", "2026-11-21")).toBe("Yarın");
    expect(dayLabel("2026-11-23", "2026-11-21")).toBe("23 Kasım Pazartesi");
    expect(inWords("2026-11-24", "2026-11-21")).toBe("3 gün sonra");
    expect(daysBetween("2026-12-31", "2027-01-02")).toBe(2);
  });

  it("groups events by day", () => {
    const ev = (id: string, day: string) => ({ id, day, kind: "rate_decision" as const, ticker: null, why: null, title: "t", detail: "d", source_url: null, approximate: false });
    const cal = { from: "2026-11-21", to: "2027-01-01", notes: [], events: [ev("a", "2026-11-22"), ev("b", "2026-11-22"), ev("c", "2026-12-20")] };
    expect(groupByDay(cal.events).map((g) => g.events.length)).toEqual([2, 1]);
  });
});

describe("the double answers the contract", () => {
  it("the calendar and the strip parse, the bounds answer 422", async () => {
    const api = createMockApi({ db: new MockDb(null), latencyMs: 0, live: false });
    const cal = Calendar.parse(await api.calendar(60));
    expect(cal.notes.length).toBeGreaterThan(0);
    expect(cal.events.filter((e) => e.approximate).every((e) => e.kind === "report_window")).toBe(true);
    MarketStrip.parse(await api.marketStrip());
    await expect(api.calendar(0)).rejects.toMatchObject({ status: 422 });
    await expect(api.calendar(121)).rejects.toMatchObject({ status: 422 });
  });
});

describe("home blocks", () => {
  it("the market strip says open or closed with the index and the dollar, each with its day", async () => {
    renderWithDesk(<MarketStripView />);
    expect(await screen.findByText(/BIST 100/)).toBeTruthy();
    expect(screen.getByText(/Borsa (açık|kapalı)/)).toBeTruthy();
    expect(screen.getByText(/kapanışı/)).toBeTruthy();
    expect(screen.getByText(/Merkez Bankası,/)).toBeTruthy();
  });
});
