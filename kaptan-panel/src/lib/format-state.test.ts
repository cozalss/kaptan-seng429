import {
  fmtBps,
  fmtCompact,
  fmtDate,
  fmtDateLong,
  fmtDateTime,
  fmtDec,
  fmtDuration,
  fmtLatency,
  fmtPct,
  fmtPrice,
  fmtShortDate,
  fmtSignedPct,
  fmtTime,
  shortHash,
} from "./format";
import { evalClassOf, routeLabel } from "./domain/labels";
import { initialState, loadState, saveState } from "./api/mock/state";
import { MockDb, getMockDb, __setMockDb } from "./api/mock/db";
import { EventBus } from "./sse/bus";

describe("format · the rest of the tr-TR helpers", () => {
  const iso = "2027-01-11T10:40:05.000Z";
  it("formats decimals, prices, compact counts and basis points", () => {
    expect(fmtDec(48.3215)).toBe("48,32");
    expect(fmtDec(0.5, 1)).toBe("0,5");
    expect(fmtPrice(48.32)).toBe("48,32 TL");
    expect(fmtCompact(1_200_000)).toMatch(/1,2/);
    expect(fmtBps(37.6)).toBe("38 bp");
  });
  it("never prints a negative zero percent", () => {
    expect(fmtPct(-0.00001)).toBe("%0");
    expect(fmtSignedPct(0)).toBe("%0");
  });
  it("shows Istanbul wall time and dates", () => {
    expect(fmtTime(iso)).toBe("13:40");
    expect(fmtTime(iso, true)).toBe("13:40:05");
    expect(fmtDate(iso)).toBe("11.01.2027");
    expect(fmtDateTime(iso)).toBe("11.01.2027 13:40");
    expect(fmtDateLong(iso)).toMatch(/11 Ocak 2027/);
    expect(fmtShortDate("2027-01-11")).toMatch(/11 Oca/);
    expect(fmtShortDate(iso)).toMatch(/11/);
  });
  it("writes durations and latencies in Turkish", () => {
    expect(fmtDuration(0)).toBe("süresi doldu");
    expect(fmtDuration(65_000)).toBe("1 dk 05 sn");
    expect(fmtDuration(2 * 3_600_000 + 14 * 60_000)).toBe("2 sa 14 dk");
    expect(fmtDuration(26 * 3_600_000)).toBe("1 gün 2 sa");
    expect(fmtLatency(820)).toBe("820 ms");
    expect(fmtLatency(2_400)).toBe("2,4 sn");
  });
  it("leaves short hashes alone", () => {
    expect(shortHash("abc")).toBe("abc");
  });
});

describe("labels", () => {
  it("maps FILTER/IGNORE to the eval classes X/O (Ç-2)", () => {
    expect(evalClassOf("FILTER")).toBe("X");
    expect(evalClassOf("IGNORE")).toBe("O");
    expect(evalClassOf("E3")).toBe("E3");
  });
  it("labels every subject route", () => {
    expect(routeLabel("noise")).toMatch(/elendi/);
    expect(routeLabel("archive_only")).toBe("Arşivlendi");
    expect(routeLabel("llm")).toMatch(/LLM/);
    expect(routeLabel("avoid:spk_tedbir" as never)).toBe("Kaçınma filtresi");
    expect(routeLabel("E3" as never)).toBe("E3 adayı");
  });
});

describe("mock state persistence", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it("round-trips session changes through storage", () => {
    const store = memory();
    const s = { ...initialState(1_000), tamperOn: true };
    saveState(store, s);
    expect(loadState(store, 2_000).tamperOn).toBe(true);
  });
  it("starts fresh on missing, stale or malformed data", () => {
    const store = memory();
    expect(loadState(null, 5).startedAtReal).toBe(5);
    expect(loadState(store, 5).tamperOn).toBe(false);
    store.setItem("kaptan-mock-state", "{not json");
    expect(loadState(store, 5).tamperOn).toBe(false);
    store.setItem("kaptan-mock-state", JSON.stringify({ v: 1, startedAtReal: 1, tamperOn: true }));
    expect(loadState(store, 5).tamperOn).toBe(false);
  });
  it("survives a storage that throws", () => {
    expect(() =>
      saveState(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        initialState(1),
      ),
    ).not.toThrow();
  });
  it("MockDb reloads, resets and keeps one instance per tab", () => {
    const db = new MockDb(window.localStorage);
    db.update((s) => ({ ...s, tamperOn: true }));
    const twin = new MockDb(window.localStorage);
    expect(twin.snapshot.tamperOn).toBe(true);
    db.reset();
    twin.reload();
    expect(twin.snapshot.tamperOn).toBe(false);
    __setMockDb(null);
    expect(getMockDb()).toBe(getMockDb());
    __setMockDb(null);
  });
});

describe("EventBus", () => {
  it("delivers to subscribers, isolates failures and unsubscribes", () => {
    const bus = new EventBus();
    const got: string[] = [];
    const off = bus.subscribe("desk", (m) => got.push(m.event));
    bus.subscribe("desk", () => {
      throw new Error("boom");
    });
    bus.emit("desk", "halt", {});
    off();
    bus.emit("desk", "halt", {});
    bus.emit("feed", "counters", {});
    expect(got).toEqual(["halt"]);
  });
});
