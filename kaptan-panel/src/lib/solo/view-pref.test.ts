import { homeFor, parseView, readView, rememberView, VIEW_COOKIE, viewFromCookieString } from "./view-pref";

describe("remembered view (personal home or full desk)", () => {
  afterEach(() => {
    document.cookie = `${VIEW_COOKIE}=; Path=/; Max-Age=0`;
  });

  it("accepts only the two known views", () => {
    expect(parseView("benim")).toBe("benim");
    expect(parseView("masa")).toBe("masa");
    expect(parseView("/bugun")).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });

  it("lands where the person last was, else on the mode's default", () => {
    expect(homeFor("benim", false)).toBe("/benim");
    expect(homeFor("masa", true)).toBe("/bugun");
    expect(homeFor(null, false)).toBe("/bugun");
    expect(homeFor(null, true)).toBe("/benim");
  });

  it("reads the view out of a cookie header", () => {
    expect(viewFromCookieString("a=1; kaptan_view=benim; b=2")).toBe("benim");
    expect(viewFromCookieString("kaptan_view=evil")).toBeNull();
    expect(viewFromCookieString("")).toBeNull();
  });

  it("remembers the choice in this browser", () => {
    expect(readView()).toBeNull();
    rememberView("benim");
    expect(readView()).toBe("benim");
    rememberView("masa");
    expect(readView()).toBe("masa");
  });
});
