import { act, renderHook } from "@testing-library/react";
import { HOLDS_KEY, readHolds, useHolds } from "./holds";

describe("hold answers on this device", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads only well-formed entries", () => {
    const store = { getItem: () => JSON.stringify([{ id: "a", symbol: "X", at: "t" }, { id: 1 }, null, { id: "b", symbol: "Y", at: "t", answer: "nope" }]) };
    expect(readHolds(store)).toEqual([{ id: "a", symbol: "X", at: "t" }]);
    expect(readHolds({ getItem: () => "{" })).toEqual([]);
    expect(readHolds({ getItem: () => JSON.stringify({}) })).toEqual([]);
    expect(readHolds(null)).toEqual([]);
  });

  it("adds an answer once, newest first, and keeps it across visits", () => {
    const { result } = renderHook(() => useHolds());
    act(() => result.current.addHold({ id: "tut-A", symbol: "A", at: "2027-01-11T10:00:00Z", answer: "held" }));
    act(() => result.current.addHold({ id: "tut-B", symbol: "B", at: "2027-01-11T10:05:00Z", answer: "skipped" }));
    act(() => result.current.addHold({ id: "tut-A", symbol: "A", at: "2027-01-11T10:10:00Z", answer: "held" }));
    expect(result.current.holds.map((h) => h.id)).toEqual(["tut-A", "tut-B"]);
    expect(readHolds(window.localStorage)).toHaveLength(2);
    expect(window.localStorage.getItem(HOLDS_KEY)).toContain("tut-B");
    const again = renderHook(() => useHolds());
    expect(again.result.current.holds).toHaveLength(2);
  });
});
