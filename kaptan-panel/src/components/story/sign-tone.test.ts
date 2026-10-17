import { describe, expect, it } from "vitest";
import { signTone } from "./sign-tone";

describe("signTone", () => {
  it("colours a gain green and a loss claret", () => {
    expect(signTone(0.21)).toBe("text-gain");
    expect(signTone(-1.1)).toBe("text-loss");
  });
  it("leaves flat, missing and non-finite figures in ink", () => {
    expect(signTone(0)).toBe("text-ink");
    expect(signTone(null)).toBe("text-ink");
    expect(signTone(undefined)).toBe("text-ink");
    expect(signTone(Number.NaN)).toBe("text-ink");
  });
});
