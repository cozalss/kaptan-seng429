import { AlertSettings, DayCounters, deferredCount, SystemStatus } from "@/lib/domain";
import { isApiError } from "../types";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";

function setup() {
  const db = new MockDb(null);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock · system status", () => {
  it("is all clear by default, in the API's own shape", async () => {
    const { api } = setup();
    const s = await api.systemStatus();
    expect(SystemStatus.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({ reading: true, message: null, problems: [] });
    expect(s.ingest.ok && s.agents.ok && s.scheduler.ok && s.backup.ok).toBe(true);
  });

  it("reports the problems a test picked, most important first, with the API's sentences", async () => {
    const { db, api } = setup();
    db.update((s) => ({ ...s, status: { ...s.status, problems: ["ingest_down", "agents_down", "backup_never"] } }));
    const s = await api.systemStatus();
    expect(s.reading).toBe(false);
    expect(s.message).toBe("KAPtan şu an bildirim okumuyor.");
    expect(s.problems.map((p) => p.code)).toEqual(["ingest_down", "agents_down", "backup_never"]);
    expect(s.ingest.ok).toBe(false);
    expect(s.agents.ok).toBe(false);
    expect(s.backup).toMatchObject({ ok: false, last_at: null, age_h: null });
  });

  it("needs a session", async () => {
    const api = createMockApi({ db: new MockDb(null), user: null, latencyMs: 0, live: false });
    await expect(api.systemStatus()).rejects.toMatchObject({ status: 401 });
    await expect(api.alertSettings()).rejects.toMatchObject({ status: 401 });
  });
});

describe("mock · counters", () => {
  it("has nothing waiting by default, and says how many wait and why when a test sets it", async () => {
    const { db, api } = setup();
    const calm = await api.counters();
    expect(DayCounters.safeParse(calm).success).toBe(true);
    expect(deferredCount(calm)).toBe(0);
    expect(calm.deferred_reason_tr).toBeNull();
    db.update((s) => ({ ...s, status: { ...s.status, deferred: 3, deferredReason: "Bugünkü ücretsiz okuma hakkı doldu." } }));
    const busy = await api.counters();
    expect(deferredCount(busy)).toBe(3);
    expect(busy.deferred_reason_tr).toBe("Bugünkü ücretsiz okuma hakkı doldu.");
    // What waits is today's: another day has none.
    expect(deferredCount(await api.counters("2026-01-08"))).toBe(0);
  });
});

describe("mock · alerts", () => {
  it("has no channel set up by default", async () => {
    const { api } = setup();
    const a = await api.alertSettings();
    expect(AlertSettings.safeParse(a).success).toBe(true);
    expect(a).toEqual({ ntfy: false, email: false, last_sent_at: null, last_error_tr: null });
  });

  it("a test alert records when it was sent", async () => {
    const { db, api } = setup();
    db.update((s) => ({ ...s, status: { ...s.status, alerts: { ...s.status.alerts, ntfy: true } } }));
    const a = await api.testAlerts();
    expect(a.ntfy).toBe(true);
    expect(a.last_sent_at).not.toBeNull();
    expect(a.last_error_tr).toBeNull();
  });

  it("a failing channel records the reason instead", async () => {
    const { db, api } = setup();
    db.update((s) => ({ ...s, status: { ...s.status, alerts: { ...s.status.alerts, ntfy: true, failing: true } } }));
    const a = await api.testAlerts();
    expect(a.last_sent_at).toBeNull();
    expect(a.last_error_tr).toMatch(/gönderilemedi/);
  });

  it("allows one test a minute", async () => {
    const { db, api } = setup();
    db.update((s) => ({ ...s, status: { ...s.status, alerts: { ...s.status.alerts, email: true } } }));
    await api.testAlerts();
    const second = await api.testAlerts().catch((e: unknown) => e);
    expect(isApiError(second) && second.status === 429 && second.code === "rate_limited").toBe(true);
  });

  it("sends nothing when no channel is set up", async () => {
    const { api } = setup();
    expect(await api.testAlerts()).toEqual({ ntfy: false, email: false, last_sent_at: null, last_error_tr: null });
  });
});
