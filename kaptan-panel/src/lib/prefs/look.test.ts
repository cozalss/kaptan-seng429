import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOOK,
  lookAttributes,
  readLook,
  setLook,
  TEXT_KEY,
  THEME_KEY,
} from "./look";
import { LOOK_SCRIPT } from "./look-script";

const store = (entries: Record<string, string>) => ({
  getItem: (k: string) => entries[k] ?? null,
});

describe("the remembered look", () => {
  it("reads what this browser kept and ignores anything else", () => {
    expect(
      readLook(store({ [THEME_KEY]: "dark", [TEXT_KEY]: "xlarge" })),
    ).toEqual({ theme: "dark", text: "xlarge" });
    expect(
      readLook(store({ [THEME_KEY]: "purple", [TEXT_KEY]: "huge" })),
    ).toEqual(DEFAULT_LOOK);
    expect(readLook(null)).toEqual(DEFAULT_LOOK);
    expect(
      readLook({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(DEFAULT_LOOK);
  });

  it("puts nothing on the page for the defaults", () => {
    expect(lookAttributes(DEFAULT_LOOK)).toEqual({ theme: null, text: null });
    expect(lookAttributes({ theme: "light", text: "large" })).toEqual({
      theme: "light",
      text: "large",
    });
  });
});

describe("the first-paint script", () => {
  const run = (entries: Record<string, string>) => {
    const dataset: Record<string, string> = {};
    new Function("document", "localStorage", LOOK_SCRIPT)(
      { documentElement: { dataset } },
      store(entries),
    );
    return dataset;
  };

  it("sets the same attributes as the app would", () => {
    expect(run({ [THEME_KEY]: "dark", [TEXT_KEY]: "large" })).toEqual({
      theme: "dark",
      text: "large",
    });
    expect(run({ [THEME_KEY]: "system" })).toEqual({});
    expect(run({ [THEME_KEY]: "evil", [TEXT_KEY]: "normal" })).toEqual({});
  });

  it("never throws when storage is blocked", () => {
    expect(() =>
      new Function("document", "localStorage", LOOK_SCRIPT)(
        { documentElement: { dataset: {} } },
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
      ),
    ).not.toThrow();
  });
});

describe("setLook", () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.text;
  });

  it("remembers the choice and shows it on <html> at once", () => {
    setLook({ theme: "dark" });
    setLook({ text: "xlarge" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.text).toBe("xlarge");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    setLook({ theme: "system", text: "normal" });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
