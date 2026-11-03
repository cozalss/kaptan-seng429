import { appCsp, LANDING_CSP, newNonce } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("Content-Security-Policy", () => {
  it("runs only this request's scripts in production, with no eval", () => {
    const script = directive(appCsp("abc", false), "script-src");
    expect(script).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(script).not.toContain("unsafe");
  });

  it("adds what React's dev build and HMR need only in dev", () => {
    expect(directive(appCsp("abc", true), "script-src")).toContain("'unsafe-eval'");
    expect(directive(appCsp("abc", true), "connect-src")).toBe("connect-src 'self' ws:");
    expect(directive(appCsp("abc", false), "connect-src")).toBe("connect-src 'self'");
  });

  it("talks to nobody else: the API and its streams are same-origin", () => {
    for (const csp of [appCsp("abc", false), LANDING_CSP]) {
      expect(csp).not.toContain("http");
      expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive(csp, "object-src")).toBe("object-src 'none'");
    }
  });

  it("gives the static landing no nonce and no inline script", () => {
    expect(directive(LANDING_CSP, "script-src")).toBe("script-src 'self'");
  });

  it("makes a new nonce every time", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
