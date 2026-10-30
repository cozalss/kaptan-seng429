import { singleUserFromHealth } from "./mode";

describe("single-user mode", () => {
  it("reads single_user from /health and treats anything else as no", () => {
    expect(singleUserFromHealth({ status: "ok", single_user: true })).toBe(true);
    expect(singleUserFromHealth({ single_user: false })).toBe(false);
    expect(singleUserFromHealth({ single_user: "true" })).toBe(false);
    expect(singleUserFromHealth(null)).toBe(false);
    expect(singleUserFromHealth("ok")).toBe(false);
  });

  describe("isSingleUser", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    async function load(env: Record<string, string>) {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      vi.resetModules();
      return (await import("./mode.server")).isSingleUser;
    }

    it("follows the env flag in mock mode without calling anything", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      expect(await (await load({ NEXT_PUBLIC_SINGLE_USER: "true", NEXT_PUBLIC_API_MODE: "" }))()).toBe(true);
      expect(await (await load({ NEXT_PUBLIC_SINGLE_USER: "", NEXT_PUBLIC_API_MODE: "" }))()).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("asks the backend's /health in http mode and fails closed", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ single_user: true })));
      vi.stubGlobal("fetch", fetchSpy);
      const isSingleUser = await load({ NEXT_PUBLIC_SINGLE_USER: "", NEXT_PUBLIC_API_MODE: "http", KAPTAN_API_ORIGIN: "http://api.local" });
      expect(await isSingleUser()).toBe(true);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://api.local/api/v1/health");
      fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 503 }));
      expect(await isSingleUser()).toBe(false);
      fetchSpy.mockRejectedValueOnce(new Error("down"));
      expect(await isSingleUser()).toBe(false);
    });
  });
});
