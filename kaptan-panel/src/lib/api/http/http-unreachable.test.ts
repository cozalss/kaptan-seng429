import { isUnreachable, MSG_UNREACHABLE } from "../types";
import { createHttpApi, httpLogin, httpReachable, setAccessToken } from "./http-api";

const refused = () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
/** What Next's rewrite answers when nothing listens behind it. */
const proxyError = () => vi.fn().mockImplementation(async () => new Response("Internal Server Error", { status: 500 }));
const apiError = (status: number, detail: string) => vi.fn().mockImplementation(async () => new Response(JSON.stringify({ detail }), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => setAccessToken("t"));
afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
});

describe("the API does not answer", () => {
  it.each([
    ["a refused connection", refused],
    ["the rewrite's own error page", proxyError],
  ])("says so on a screen's request, for %s", async (_name, fetchImpl) => {
    vi.stubGlobal("fetch", fetchImpl());
    const failure = await createHttpApi().me().catch((e: unknown) => e);
    expect(isUnreachable(failure)).toBe(true);
    expect((failure as Error).message).toBe(MSG_UNREACHABLE);
  });

  it.each([
    ["a refused connection", refused],
    ["the rewrite's own error page", proxyError],
  ])("says so on sign-in, not that the password is wrong, for %s", async (_name, fetchImpl) => {
    vi.stubGlobal("fetch", fetchImpl());
    await expect(httpLogin("parola")).rejects.toThrow(MSG_UNREACHABLE);
  });

  it("answers the health question for both", async () => {
    vi.stubGlobal("fetch", refused());
    expect(await httpReachable()).toBe(false);
    vi.stubGlobal("fetch", proxyError());
    expect(await httpReachable()).toBe(false);
    vi.stubGlobal("fetch", apiError(200, "ok"));
    expect(await httpReachable()).toBe(true);
  });
});

describe("the API answers with a failure of its own", () => {
  it("keeps its message: that is not an unreachable API", async () => {
    vi.stubGlobal("fetch", apiError(500, "Veritabanı meşgul."));
    const failure = await createHttpApi().me().catch((e: unknown) => e);
    expect(isUnreachable(failure)).toBe(false);
    expect((failure as Error).message).toBe("Veritabanı meşgul.");
  });

  it("tells a wrong password from too many tries and a server problem", async () => {
    vi.stubGlobal("fetch", apiError(401, "x"));
    await expect(httpLogin("yanlis")).rejects.toThrow("Parola doğrulanamadı.");
    vi.stubGlobal("fetch", apiError(429, "x"));
    await expect(httpLogin("yanlis")).rejects.toThrow("Çok fazla deneme oldu. Biraz sonra yeniden dene.");
    vi.stubGlobal("fetch", apiError(500, "x"));
    await expect(httpLogin("yanlis")).rejects.toThrow("Giriş şu an yapılamıyor. Biraz sonra yeniden dene.");
  });

  it("keeps the token in memory after a good sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ access_token: "yeni", user: { id: "sen", display_name: "Sahip" } }), { status: 200 })));
    await expect(httpLogin("parola")).resolves.toBeUndefined();
  });
});
