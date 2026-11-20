import { deferredCount } from "@/lib/domain";
import { createHttpApi, setAccessToken } from "./http-api";

/** Bodies as the backend sends them (ops/system_status.py, disclosures/counters.py, API.md §3.5). */
const NOT_READING = {
  reading: false,
  message: "KAPtan şu an bildirim okumuyor.",
  checked_at: "2026-11-19T11:32:00.123Z",
  ingest: { ok: false, last_poll_at: null, age_s: null },
  agents: { ok: false, last_run_at: "2026-11-19T08:00:00.000Z", age_s: 12_720 },
  scheduler: { ok: false },
  backup: { ok: false, last_at: null, age_h: null },
  problems: [
    { code: "ingest_down", message: "KAPtan şu an bildirim okumuyor." },
    { code: "agents_down", message: "KAPtan bildirimleri okuyor ama şu an değerlendirmiyor." },
    { code: "scheduler_down", message: "Günlük işler (gün sonu fiyatları, hesaplar) şu an çalışmıyor." },
    { code: "backup_never", message: "Henüz yedek alınmadı." },
  ],
  // A part a later backend may add: it must not break the panel.
  alerts: { ok: true, ntfy: false, email: false, last_sent_at: null },
};

const ALL_CLEAR = {
  reading: true,
  message: null,
  checked_at: "2026-11-19T11:32:00.123Z",
  ingest: { ok: true, last_poll_at: "2026-11-19T11:31:40.000Z", age_s: 20 },
  agents: { ok: true, last_run_at: "2026-11-19T11:20:00.000Z", age_s: 720 },
  scheduler: { ok: true },
  backup: { ok: true, last_at: "2026-11-19T00:00:10.000Z", age_h: 0.1 },
  problems: [],
};

const COUNTERS_OLD = {
  as_of: "2026-11-19T11:32:00.123Z",
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

function serve(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      const hit = Object.entries(routes).find(([path]) => url.endsWith(path));
      if (!hit) return new Response(JSON.stringify({ detail: "yok" }), { status: 404 });
      return new Response(JSON.stringify(hit[1].body), { status: hit[1].status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

describe("http api · system status, alerts and what waits for a turn", () => {
  beforeEach(() => setAccessToken("t"));
  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("reads GET /system/status in both of the backend's states", async () => {
    serve({ "/system/status": { body: NOT_READING } });
    const down = await createHttpApi().systemStatus();
    expect(down.reading).toBe(false);
    expect(down.problems.map((p) => p.code)).toEqual(["ingest_down", "agents_down", "scheduler_down", "backup_never"]);
    serve({ "/system/status": { body: ALL_CLEAR } });
    expect(await createHttpApi().systemStatus()).toMatchObject({ reading: true, message: null, problems: [], backup: { age_h: 0.1 } });
  });

  it("reads the alert channels and sends a test with POST", async () => {
    const settings = { ntfy: true, email: false, last_sent_at: "2026-11-19T11:00:00.000Z", last_error_tr: null };
    const calls = serve({ "/me/alerts": { body: settings }, "/me/alerts/test": { body: settings } });
    const api = createHttpApi();
    expect(await api.alertSettings()).toEqual(settings);
    await api.testAlerts();
    expect(calls.map((c) => `${c.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual(["GET /me/alerts", "POST /me/alerts/test"]);
  });

  it("passes on the API's own sentence when a test alert is asked for too soon", async () => {
    serve({ "/me/alerts/test": { status: 429, body: { detail: "Dakikada bir deneme bildirimi gönderebilirsin.", code: "rate_limited" } } });
    await expect(createHttpApi().testAlerts()).rejects.toMatchObject({ status: 429, code: "rate_limited", message: "Dakikada bir deneme bildirimi gönderebilirsin." });
  });

  it("still reads the counters of a backend that knows none of the new fields", async () => {
    serve({ "/disclosures/counters": { body: COUNTERS_OLD } });
    const c = await createHttpApi().counters();
    expect(c).toMatchObject({ waiting_for_money: false, deferred: 0, deferred_reason_tr: null });
    expect(deferredCount(c)).toBe(0);
  });

  it("finds what waits for a turn inside `agent_feed`, where the backend puts it, or at the top", async () => {
    const feed = { read: 40, ran: 12, vetoed: 3, deferred: 3, window_closed: 0, expired_unrun: 1, failed: 0 };
    serve({ "/disclosures/counters": { body: { ...COUNTERS_OLD, agent_feed: feed, deferred_reason_tr: "Bugünkü okuma hakkı doldu.", waiting_for_money: true } } });
    const nested = await createHttpApi().counters();
    expect(deferredCount(nested)).toBe(3);
    expect(nested.deferred_reason_tr).toBe("Bugünkü okuma hakkı doldu.");
    expect(nested.waiting_for_money).toBe(true);
    serve({ "/disclosures/counters": { body: { ...COUNTERS_OLD, deferred: 5 } } });
    expect(deferredCount(await createHttpApi().counters())).toBe(5);
  });
});
