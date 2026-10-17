import { cn, prefersReducedMotion } from "./utils";

describe("cn", () => {
  it("keeps a colour next to a custom text size", () => {
    expect(cn("text-ui text-on-dark")).toBe("text-ui text-on-dark");
    expect(cn("text-dense", "text-north")).toBe("text-dense text-north");
    expect(cn("text-display-lg text-ink")).toBe("text-display-lg text-ink");
  });
  it("lets a later custom size win over an earlier one", () => {
    expect(cn("text-meta", "text-ui")).toBe("text-ui");
    expect(cn("text-display", "text-title")).toBe("text-title");
  });
  it("lets a later Bodoni cut win and keeps the weight", () => {
    expect(cn("font-display", "font-display-text")).toBe("font-display-text");
    expect(cn("font-display-text font-medium")).toBe("font-display-text font-medium");
  });
  it("merges the custom hard shadows", () => {
    expect(cn("shadow-ink", "shadow-ink-lg")).toBe("shadow-ink-lg");
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the OS setting", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
