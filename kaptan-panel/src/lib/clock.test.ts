import { noteServerTime, serverNowMs } from "./clock";

describe("server clock (http mode)", () => {
  afterEach(() => noteServerTime(new Date(1_000).toISOString(), 1_000));

  it("follows the server's as_of, e.g. the backend's demo clock", () => {
    const browser = Date.parse("2026-10-18T09:00:00.000Z");
    noteServerTime("2027-01-11T10:40:00.000Z", browser);
    expect(new Date(serverNowMs(browser + 60_000)).toISOString()).toBe("2027-01-11T10:41:00.000Z");
  });

  it("ignores a malformed as_of", () => {
    noteServerTime("2027-01-11T10:40:00.000Z", 0);
    const before = serverNowMs(0);
    noteServerTime("dün", 0);
    expect(serverNowMs(0)).toBe(before);
  });
});
