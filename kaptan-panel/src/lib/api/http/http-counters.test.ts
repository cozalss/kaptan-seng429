import { createHttpApi, setAccessToken } from "./http-api";

const BODY = {
  as_of: "2026-10-31T10:00:00Z",
  total: 796,
  noise: 60,
  archived: 700,
  processed: 36,
  e_candidates: 151,
  proposals: 0,
  approvals: 0,
  rejections: 0,
  llm_calls: 0,
  llm_tokens: 0,
};

describe("http api · counters", () => {
  beforeEach(() => setAccessToken("t"));
  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("asks for one session's exact counters with ?day=, and today's without it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi();

    expect((await api.counters("2026-10-30")).total).toBe(796);
    await api.counters();

    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0])).filter((u) => u.includes("/counters"));
    expect(urls[0]).toMatch(/\/disclosures\/counters\?day=2026-10-30$/);
    expect(urls[1]).toMatch(/\/disclosures\/counters$/);
  });
});
