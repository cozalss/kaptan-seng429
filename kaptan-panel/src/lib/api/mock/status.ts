import type { AlertSettings, SystemProblem, SystemStatus } from "@/lib/domain";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import type { MockState } from "./state";

/**
 * The test double of GET /system/status, GET /me/alerts and POST /me/alerts/test, and of the
 * "waiting for a turn" part of the day's counters. All clear by default; a test picks a state by
 * writing this slice (db.update, or the stored state in a browser test).
 */
export interface MockStatus {
  /** Problem codes the system reports, most important first (the API's own codes). */
  problems: string[];
  /** Disclosures that got no turn today, and the API's sentence for why (null = it cannot say). */
  deferred: number;
  deferredReason: string | null;
  alerts: AlertSettings & {
    /** The next test alert fails to send. */
    failing: boolean;
    /** When the last test was asked for (real ms): one a minute. */
    testedAtReal: number | null;
  };
}

export function initialStatus(): MockStatus {
  return {
    problems: [],
    deferred: 0,
    deferredReason: null,
    alerts: { ntfy: false, email: false, last_sent_at: null, last_error_tr: null, failing: false, testedAtReal: null },
  };
}

/** The slice with every field present: a stored test state may carry only the part it sets. */
export function statusOf(state: MockState): MockStatus {
  const base = initialStatus();
  const mine: Partial<MockStatus> = state.status ?? {};
  return { ...base, ...mine, alerts: { ...base.alerts, ...mine.alerts } };
}

/** The API's own sentences (backend/src/kaptan/ops/system_status.py). */
const MESSAGE: Readonly<Record<string, string>> = {
  ingest_down: "KAPtan şu an bildirim okumuyor.",
  ingest_stale: "KAPtan şu an bildirim okumuyor.",
  warming_up: "KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir.",
  agents_down: "KAPtan bildirimleri okuyor ama şu an değerlendirmiyor.",
  scheduler_down: "Günlük işler (gün sonu fiyatları, hesaplar) şu an çalışmıyor.",
  backup_never: "Henüz yedek alınmadı.",
  backup_stale: "Son yedek 3 gün önce alındı.",
};

const TEST_GAP_MS = 60_000;
const BACKUP_AGE_H = 9.5;
const STALE_BACKUP_AGE_H = 72;

export function systemStatus(state: MockState, nowIso: string): SystemStatus {
  const problems: SystemProblem[] = statusOf(state).problems.map((code) => ({ code, message: MESSAGE[code] ?? code }));
  const has = (...codes: string[]) => problems.some((p) => codes.includes(p.code));
  const now = Date.parse(nowIso);
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const reading = !has("ingest_down", "ingest_stale");
  const backupAgeH = has("backup_never") ? null : has("backup_stale") ? STALE_BACKUP_AGE_H : BACKUP_AGE_H;
  return {
    reading,
    message: problems[0]?.message ?? null,
    checked_at: nowIso,
    ingest: reading ? { ok: true, last_poll_at: ago(20_000), age_s: 20 } : { ok: false, last_poll_at: ago(3_600_000), age_s: 3_600 },
    agents: { ok: !has("agents_down"), last_run_at: ago(240_000), age_s: 240 },
    scheduler: { ok: !has("scheduler_down") },
    backup: { ok: !has("backup_never", "backup_stale"), last_at: backupAgeH === null ? null : ago(backupAgeH * 3_600_000), age_h: backupAgeH },
    problems,
  };
}

function alertSettings(state: MockState): AlertSettings {
  const { ntfy, email, last_sent_at, last_error_tr } = statusOf(state).alerts;
  return { ntfy, email, last_sent_at, last_error_tr };
}

export function createStatus(ctx: MockCtx): Pick<KaptanApi, "systemStatus" | "alertSettings" | "testAlerts"> {
  const { db, me, ok, now } = ctx;
  return {
    async systemStatus() {
      me();
      return ok(systemStatus(db.snapshot, now()), 60);
    },

    async alertSettings() {
      me();
      return ok(alertSettings(db.snapshot), 80);
    },

    async testAlerts() {
      me();
      const { alerts } = statusOf(db.snapshot);
      if (!alerts.ntfy && !alerts.email) return ok(alertSettings(db.snapshot));
      const real = Date.now();
      if (alerts.testedAtReal !== null && real - alerts.testedAtReal < TEST_GAP_MS) {
        throw new ApiError(429, "rate_limited", "Deneme bildirimi dakikada bir kez gönderilir. Biraz sonra yeniden dene.");
      }
      const result = alerts.failing
        ? { last_error_tr: "Telefon bildirimi gönderilemedi." }
        : { last_sent_at: now(), last_error_tr: null };
      db.update((s) => ({ ...s, status: { ...statusOf(s), alerts: { ...alerts, ...result, testedAtReal: real } } }));
      return ok(alertSettings(db.snapshot), 320);
    },
  };
}
