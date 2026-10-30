import { act, renderHook } from "@testing-library/react";

// http mode: the UI clock must follow the server's "now" (the backend's demo clock), never the browser's.
vi.mock("@/lib/api/config", () => ({ API_MODE: "http" }));

async function freshClock() {
  vi.resetModules();
  return import("./clock");
}

describe("useNow in http mode", () => {
  it("shows no time until the server's clock is known, then the server's date at once", async () => {
    const { useNow, noteServerTime } = await freshClock();
    const { result } = renderHook(() => useNow(60_000));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    // Before any answer carried the server's time: no wall-clock date flashes on screen.
    expect(result.current).toBeNull();

    // An answer with as_of arrives (counters / risk status): the hook re-renders without waiting a tick.
    act(() => noteServerTime("2027-01-11T10:40:00.000Z"));
    expect(result.current).not.toBeNull();
    expect(new Date(result.current as number).toISOString().startsWith("2027-01-11")).toBe(true);
  });

  it("follows a later jump of the server clock (a demo reset) without waiting for the interval", async () => {
    const { useNow, noteServerTime } = await freshClock();
    noteServerTime("2027-01-11T10:40:00.000Z");
    const { result } = renderHook(() => useNow(60_000));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(new Date(result.current as number).toISOString().startsWith("2027-01-11T10:4")).toBe(true);

    act(() => noteServerTime("2027-01-12T07:00:00.000Z"));
    expect(new Date(result.current as number).toISOString().startsWith("2027-01-12T07:0")).toBe(true);
  });
});
