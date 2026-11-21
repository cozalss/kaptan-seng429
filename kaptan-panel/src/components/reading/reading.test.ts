import { describe, expect, it } from "vitest";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { afterEach } from "vitest";
import { statsNotes } from "@/components/company/stats-strip";
import { twoLinesSentence } from "@/components/company/two-lines";
import { insiderSentence } from "@/components/company/insider-strip";
import { periodChange } from "@/components/company/compare-screen";
import type { PriceStats } from "@/lib/company/company";

const stats = (over: Partial<PriceStats>): PriceStats => ({
  as_of: "2026-11-20",
  day_low: 10,
  day_high: 11,
  volume: 1000,
  year_low: 5,
  year_high: 12,
  year_low_day: "2026-02-01",
  year_high_day: "2026-09-01",
  year_days: 250,
  from_high_pct: -8.3,
  adjusted: false,
  ...over,
});

describe("price statistics notes", () => {
  it("says nothing when a full year is stored and nothing was adjusted", () => {
    expect(statsNotes(stats({}))).toEqual([]);
  });
  it("admits a short history and a bonus-issue correction", () => {
    const notes = statsNotes(stats({ year_days: 90, adjusted: true }));
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("90 borsa gününün");
  });
});

describe("sentences", () => {
  it("names who ended higher", () => {
    expect(twoLinesSentence("AAAA", "BIST 100", 12.3, 4.1, "2026-01-02")).toContain("AAAA önde.");
    expect(twoLinesSentence("AAAA", "BIST 100", null, 4.1, null)).toContain("yeterli gün yok");
  });
  it("says honestly when there is no insider or buyback disclosure", () => {
    expect(insiderSentence([])).toContain("yok");
  });
  it("measures the change over the period and refuses with one close", () => {
    const side = { price: { period: "1y" as const, points: [{ d: "2026-01-01", close: 10 }, { d: "2026-01-02", close: 11 }], last_close: 11, last_day: "2026-01-02", change_pct: 10 } };
    expect(periodChange(side)).toBe(10);
    expect(periodChange({ price: { ...side.price, points: [] } })).toBeNull();
  });
});

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("the double's reading marks", () => {
  const api = () => createMockApi({ db: new MockDb(null), latencyMs: 0, live: false });

  it("saves, lists, un-saves and refuses an unknown disclosure", async () => {
    const a = api();
    const day = (await a.disclosures({ limit: 5 }))[0];
    expect(day).toBeDefined();
    const idx = day?.disclosure_index ?? 0;
    expect((await a.setSaved(idx, true)).saved_indexes).toEqual([idx]);
    expect((await a.setSaved(idx, true)).saved_indexes).toEqual([idx]);
    expect((await a.savedDisclosures()).map((d) => d.disclosure_index)).toEqual([idx]);
    expect((await a.setSaved(idx, false)).saved_indexes).toEqual([]);
    await expect(a.setSaved(1, true)).rejects.toMatchObject({ status: 404 });
  });

  it("clears unread with read-all and one open at a time", async () => {
    const a = api();
    const before = await a.readingState();
    const one = before.unread_indexes[0];
    if (one !== undefined) {
      const after = await a.markRead(one);
      expect(after.unread).toBe(before.unread - 1);
    }
    expect((await a.readAll()).unread).toBe(0);
  });

  it("undoes read-all: the mark goes back, an opened one stays read", async () => {
    const a = api();
    const before = await a.readingState();
    const [one] = before.unread_indexes;
    if (one !== undefined) await a.markRead(one);
    await a.readAll();
    const back = await a.restoreReadThrough(before.read_through);
    expect(back.read_through).toBe(before.read_through);
    expect(back.unread).toBe(Math.max(0, before.unread - (one === undefined ? 0 : 1)));
    if (one !== undefined) expect(back.unread_indexes).not.toContain(one);
    await expect(a.restoreReadThrough("2999-01-01T00:00:00.000Z")).rejects.toMatchObject({ status: 422 });
  });

  it("compares two companies and refuses the same one twice", async () => {
    const a = api();
    await expect(a.compare("ORNEK", "ORNEK")).rejects.toMatchObject({ status: 422 });
    const c = await a.compare("ORNEK", "ORNCM", "1m");
    expect(c.a.ticker).toBe("ORNEK");
    expect(c.b.price.points.length).toBeGreaterThan(5);
  });
});
