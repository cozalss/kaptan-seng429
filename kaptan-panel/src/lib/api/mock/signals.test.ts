import { afterAll, describe, expect, it } from "vitest";
import { stopLiveTicker } from "./scenarios";
import { createMockApi } from "./mock-api";
import { MockDb } from "./db";

afterAll(() => stopLiveTicker());

const api = () => createMockApi({ db: new MockDb(null), latencyMs: 0, live: false });

describe("the double's signals and triage", () => {
  it("lists the day's important disclosures, mine first, with a line and a tone", async () => {
    const a = api();
    const list = await a.signals();
    expect(list.items.length).toBe(list.mine_count + list.other_count);
    const firstOther = list.items.findIndex((i) => i.mine === null);
    if (firstOther >= 0) expect(list.items.slice(firstOther).every((i) => i.mine === null)).toBe(true);
    for (const s of list.items) {
      expect(s.important).toBe(true);
      expect(s.line_tr.length).toBeGreaterThan(5);
      expect(s.line_tr.length).toBeLessThanOrEqual(140);
      expect(s.panel_path).toBe(`/bildirimler?gun=${s.published_at.slice(0, 10)}&bildirim=${s.disclosure_index}`.replace(/gun=[^&]+/, (m) => m));
    }
    await expect(a.signals("bugun")).rejects.toMatchObject({ status: 422 });
  });

  it("one triage state per disclosure: saved is the state sonra, the same call takes it out", async () => {
    const a = api();
    const first = (await a.signals()).items[0];
    expect(first).toBeDefined();
    const idx = first?.disclosure_index ?? 0;
    const acted = await a.setTriage(idx, "yapilacak");
    expect(acted.triage).toContainEqual({ disclosure_index: idx, state: "yapilacak" });
    expect(acted.act_count).toBe(1);
    expect(acted.unread_indexes).not.toContain(idx);
    const later = await a.setSaved(idx, true);
    expect(later.saved_indexes).toEqual([idx]);
    expect(later.act_count).toBe(0);
    expect((await a.signal(idx)).triage).toBe("sonra");
    expect((await a.setTriage(idx, null)).triage).toEqual([]);
    await expect(a.setTriage(1, "tamam")).rejects.toMatchObject({ status: 404 });
  });

  it("counts unread only for important ones of mine and keeps the others apart", async () => {
    const a = api();
    const state = await a.readingState();
    const list = await a.signals();
    for (const i of state.unread_indexes) expect(list.items.find((s) => s.disclosure_index === i)?.mine).not.toBeNull();
    expect(state.unread_other).toBeGreaterThanOrEqual(0);
  });

  it("carries the new fields in the digest and the brief", async () => {
    const a = api();
    const d = await a.digest();
    for (const i of d.items) expect(["olumlu", "olumsuz", "notr", "belirsiz"]).toContain(i.tone);
    const brief = await a.briefToday();
    if (brief) expect(brief.signals.length).toBeLessThanOrEqual(brief.important_disclosures.length);
  });
});
