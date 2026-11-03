import { HOWTO_KEY, hasSeenHowTo, markHowToSeen } from "./seen";

const store = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("first visit memory", () => {
  it("is not seen at first, and stays seen once marked", () => {
    const s = store();
    expect(hasSeenHowTo(s)).toBe(false);
    markHowToSeen(s);
    expect(hasSeenHowTo(s)).toBe(true);
    expect(s.getItem(HOWTO_KEY)).toBe("1");
  });

  it("does not nag when the browser refuses storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(hasSeenHowTo(broken)).toBe(true);
    expect(() => markHowToSeen(broken)).not.toThrow();
  });
});
