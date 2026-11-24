import { describe, expect, it } from "vitest";
import type { SignalItem, SignalList } from "@/lib/domain/signal";
import { burstAlert, listenLines, moveFocus, otherCount, signalAlertBody, stripItems, swipeState, triageForKey, withoutStrip } from "./signal";

const item = (n: number, over: Partial<SignalItem> = {}): SignalItem => ({
  disclosure_index: n,
  ticker: `TK${n}`,
  company_name: `Şirket ${n} A.Ş.`,
  published_at: "2026-11-24T09:00:00.000Z",
  kind: "buyback",
  important: true,
  mine: "held",
  line_tr: "Kendi hissesinden aldı.",
  tone: "olumlu",
  so_what_tr: "Yapman gereken bir şey yok.",
  suggestion_tr: "KAPtan: tut",
  kap_url: `https://www.kap.org.tr/tr/Bildirim/${n}`,
  panel_path: `/bildirimler?gun=2026-11-24&bildirim=${n}`,
  triage: null,
  ...over,
});
const list = (items: SignalItem[], other = 0): SignalList => ({ day: "2026-11-24", note: null, mine_count: items.length, other_count: other, items });

describe("the strip", () => {
  it("keeps only mine and drops the ones already done", () => {
    const l = list([item(1), item(2, { mine: null }), item(3, { triage: "tamam" }), item(4, { mine: "watched" })], 1);
    expect(stripItems(l).map((i) => i.disclosure_index)).toEqual([1, 4]);
    expect(stripItems(null)).toEqual([]);
    expect(otherCount(l)).toBe(1);
  });
  it("leaves out of the card what the strip shows", () => {
    expect(withoutStrip([{ disclosure_index: 1 }, { disclosure_index: 2 }], [item(1)])).toEqual([{ disclosure_index: 2 }]);
  });
});

describe("keys and swipes", () => {
  it("maps a / s / d to the three states and ignores modifiers", () => {
    expect(triageForKey({ key: "a" })).toBe("yapilacak");
    expect(triageForKey({ key: "S" })).toBe("sonra");
    expect(triageForKey({ key: "d" })).toBe("tamam");
    expect(triageForKey({ key: "d", ctrlKey: true })).toBeNull();
    expect(triageForKey({ key: "x" })).toBeNull();
  });
  it("moves with j and k and stays inside the list", () => {
    expect(moveFocus(-1, 3, "j")).toBe(0);
    expect(moveFocus(2, 3, "j")).toBe(2);
    expect(moveFocus(0, 3, "k")).toBe(0);
    expect(moveFocus(2, 3, "k")).toBe(1);
    expect(moveFocus(-1, 0, "j")).toBe(-1);
  });
  it("swipes right for Tamam and left for Sonra oku, only when clearly sideways", () => {
    expect(swipeState(120, 10)).toBe("tamam");
    expect(swipeState(-120, 10)).toBe("sonra");
    expect(swipeState(30, 0)).toBeNull();
    expect(swipeState(100, 90)).toBeNull();
  });
});

describe("the desktop alert", () => {
  it("names the company and says the line", () => {
    expect(signalAlertBody(item(1))).toBe("TK1: Kendi hissesinden aldı.");
  });
  it("opens that disclosure when there is one", () => {
    expect(burstAlert([item(7)])).toEqual({ body: "TK7: Kendi hissesinden aldı.", path: "/bildirimler?gun=2026-11-24&bildirim=7" });
    expect(burstAlert([])).toBeNull();
  });
  it("groups a burst into one alert with a link to the list", () => {
    expect(burstAlert([item(1), item(2), item(3)])).toEqual({ body: "TK1 ve 2 şirket daha", path: "/bildirimler" });
    expect(burstAlert([item(1), item(1, { disclosure_index: 9 })])?.body).toBe("TK1: 2 yeni önemli duyuru");
  });
});

describe("Dinle", () => {
  it("reads company, line, so-what and suggestion, with a lead first", () => {
    const lines = listenLines([item(1)], "Sabah.");
    expect(lines[0]).toBe("Sabah.");
    expect(lines[1]).toBe("Şirket 1. Kendi hissesinden aldı. Yapman gereken bir şey yok. KAPtan: tut");
  });
});
