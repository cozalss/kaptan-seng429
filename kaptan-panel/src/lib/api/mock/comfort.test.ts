import { BackupStatus, Preferences } from "@/lib/domain";
import { defaultAlertPrefs } from "@/lib/prefs/alert-defaults";
import { isApiError } from "../types";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";

function setup() {
  const db = new MockDb(null);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  vi.useRealTimers();
  stopAllTimers();
  stopLiveTicker();
});

const actions = (db: MockDb) => db.auditChain().map((e) => e.action);

describe("mock · Tatil modu", () => {
  it("starts off, pauses for days or until a date, and resumes (each audited once)", async () => {
    const { db, api } = setup();
    const start = await api.preferences();
    expect(Preferences.safeParse(start).success).toBe(true);
    expect(start.pause).toEqual({ active: false, until: null, since: null });

    const paused = await api.startPause({ days: 3 });
    expect(paused.pause.active).toBe(true);
    expect(
      Date.parse(paused.pause.until ?? "") -
        Date.parse(paused.pause.since ?? ""),
    ).toBe(3 * 86_400_000);

    const byDate = await api
      .startPause({ until: "2999-01-01" })
      .catch((e: unknown) => e);
    expect(isApiError(byDate) && byDate.status).toBe(422); // more than 90 days away

    expect((await api.endPause()).pause.active).toBe(false);
    await api.endPause(); // nothing running: no second record
    expect(actions(db).filter((a) => a === "preferences.paused")).toHaveLength(
      1,
    );
    expect(actions(db).filter((a) => a === "preferences.resumed")).toHaveLength(
      1,
    );
  });

  it("refuses what the API refuses", async () => {
    const { api } = setup();
    for (const input of [
      { days: 0 },
      { days: 91 },
      { until: "2000-01-01" },
      { until: "not-a-date" },
    ]) {
      await expect(api.startPause(input)).rejects.toMatchObject({
        status: 422,
      });
    }
  });
});

describe("mock · alert preferences", () => {
  it("keep what was saved and refuse an impossible clock time", async () => {
    const { db, api } = setup();
    expect((await api.preferences()).alerts).toEqual(defaultAlertPrefs());
    const next = {
      ...defaultAlertPrefs(),
      quiet: { on: true, start: "23:00", end: "07:30" },
    };
    expect((await api.saveAlertPrefs(next)).alerts).toEqual(next);
    expect((await api.preferences()).alerts.quiet.end).toBe("07:30");
    await expect(
      api.saveAlertPrefs({
        ...next,
        quiet: { on: true, start: "25:00", end: "07:30" },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(actions(db)).toContain("preferences.alerts_changed");
  });
});

describe("mock · backup", () => {
  it("is asked once, runs, then reports the result", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { db, api } = setup();
    const first = await api.backupStatus();
    expect(BackupStatus.safeParse(first).success).toBe(true);
    expect(first).toMatchObject({ state: "idle", last_at: null });

    expect((await api.runBackup()).state).toBe("waiting");
    expect((await api.runBackup()).state).toBe("waiting"); // already asked: no second request
    expect(actions(db).filter((a) => a === "backup.requested")).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect((await api.backupStatus()).state).toBe("running");
    vi.advanceTimersByTime(2_000);
    const done = await api.backupStatus();
    expect(done).toMatchObject({
      state: "idle",
      last_ok: true,
      message_tr: "Yedek hazır.",
    });
    expect(done.last_at).not.toBeNull();
  });

  it("says so when it fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { db, api } = setup();
    db.update((s) => ({
      ...s,
      comfort: { ...s.comfort, backupFailing: true },
    }));
    await api.runBackup();
    vi.advanceTimersByTime(3_000);
    expect(await api.backupStatus()).toMatchObject({
      state: "idle",
      last_ok: false,
    });
  });
});

describe("mock · password", () => {
  it("needs the current one and a fresh, long enough new one", async () => {
    const { db, api } = setup();
    await expect(
      api.changePassword({ current: "yanlış", next: "yeni-parolam" }),
    ).rejects.toMatchObject({ status: 403, code: "wrong_password" });
    for (const next of ["kısa", "kaptan2026", "x".repeat(201)]) {
      await expect(
        api.changePassword({ current: "kaptan2026", next }),
      ).rejects.toMatchObject({ status: 422 });
    }
    expect(
      await api.changePassword({ current: "kaptan2026", next: "yeni-parolam" }),
    ).toEqual({ signed_out_others: 0 });
    // the new one is now the current one
    await expect(
      api.changePassword({ current: "kaptan2026", next: "bir-baska-parola" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(actions(db)).toContain("auth.password_changed");
  });

  it("signs out everywhere with a record", async () => {
    const { db, api } = setup();
    await api.signOutEverywhere();
    expect(actions(db)).toContain("auth.signed_out_everywhere");
  });
});

describe("mock · needs a session", () => {
  it("answers 401 signed out", async () => {
    const api = createMockApi({
      db: new MockDb(null),
      user: null,
      latencyMs: 0,
      live: false,
    });
    await expect(api.preferences()).rejects.toMatchObject({ status: 401 });
    await expect(api.runBackup()).rejects.toMatchObject({ status: 401 });
  });
});
