import { cn } from "./utils";

describe("cn", () => {
  it("keeps a colour next to a custom text size", () => {
    expect(cn("text-ui text-on-dark")).toBe("text-ui text-on-dark");
    expect(cn("text-dense", "text-north")).toBe("text-dense text-north");
  });
  it("lets a later custom size win over an earlier one", () => {
    expect(cn("text-meta", "text-ui")).toBe("text-ui");
  });
  it("merges the custom hard shadows", () => {
    expect(cn("shadow-ink", "shadow-ink-lg")).toBe("shadow-ink-lg");
  });
});
