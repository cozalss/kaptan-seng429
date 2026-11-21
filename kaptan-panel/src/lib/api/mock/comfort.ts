import {
  PauseUntil,
  type AlertPrefs,
  type BackupStatus,
  type Preferences,
} from "@/lib/domain";
import { AlertPrefs as AlertPrefsSchema } from "@/lib/domain";
import { defaultAlertPrefs } from "@/lib/prefs/alert-defaults";
import { TEST_PASSPHRASE } from "@/lib/auth/passphrase";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import type { MockState } from "./state";

/**
 * The test double of the personal settings (backend kaptan.api.routers.preferences and the password
 * endpoints): Tatil modu, alert preferences with quiet hours, "Şimdi yedek al" and the password.
 * Same refusals and sentences as the API; the backup "runs" for a moment, then reports done.
 */
export interface MockComfort {
  pauseUntil: string | null;
  pauseSince: string | null;
  alerts: AlertPrefs;
  /** When "Şimdi yedek al" was pressed (real ms); null = no request open. */
  backupAskedReal: number | null;
  backupLastAt: string | null;
  backupLastOk: boolean | null;
  /** The next backup request fails (a test sets it). */
  backupFailing: boolean;
  /** The password changed in the app; null = the test double's own. */
  password: string | null;
}

export function initialComfort(): MockComfort {
  return {
    pauseUntil: null,
    pauseSince: null,
    alerts: defaultAlertPrefs(),
    backupAskedReal: null,
    backupLastAt: null,
    backupLastOk: null,
    backupFailing: false,
    password: null,
  };
}

/** The slice with every field present: a stored test state may carry only the part it sets. */
export function comfortOf(state: MockState): MockComfort {
  const mine: Partial<MockComfort> = state.comfort ?? {};
  return { ...initialComfort(), ...mine };
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;
const WAIT_MS = 500;
const RUN_MS = 1_800;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;

function preferences(c: MockComfort, nowIso: string): Preferences {
  const active =
    c.pauseUntil !== null && Date.parse(c.pauseUntil) > Date.parse(nowIso);
  return {
    pause: {
      active,
      until: active ? c.pauseUntil : null,
      since: active ? c.pauseSince : null,
    },
    alerts: c.alerts,
  };
}

function pauseEnd(
  input: { days?: number; until?: string },
  nowIso: string,
): string {
  const now = Date.parse(nowIso);
  let end: number;
  if (input.days !== undefined && input.until === undefined) {
    if (
      !Number.isInteger(input.days) ||
      input.days < 1 ||
      input.days > MAX_DAYS
    )
      throw new ApiError(
        422,
        "validation",
        `En fazla ${MAX_DAYS} gün ara verilebilir.`,
      );
    end = now + input.days * DAY_MS;
  } else if (input.until !== undefined && input.days === undefined) {
    if (!PauseUntil.safeParse(input.until).success)
      throw new ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)");
    end = Date.parse(`${input.until}T00:00:00+03:00`);
  } else {
    throw new ApiError(
      422,
      "validation",
      "Kaç gün ya da hangi tarihe kadar olduğunu yaz.",
    );
  }
  if (end <= now)
    throw new ApiError(
      422,
      "validation",
      "Bu tarih geçmişte. Bugünden sonraki bir tarih seç.",
    );
  if (end - now > MAX_DAYS * DAY_MS)
    throw new ApiError(
      422,
      "validation",
      `En fazla ${MAX_DAYS} gün ara verilebilir.`,
    );
  return new Date(end).toISOString();
}

/** What the backup box shows: waiting, then running, then the result (the loop of the real install, in a moment). */
function backup(
  c: MockComfort,
  nowIso: string,
  realNow: number,
): { doc: BackupStatus; settled: Partial<MockComfort> | null } {
  const folder = "D:\\KAPtan-yedek";
  const asked = c.backupAskedReal;
  if (asked !== null) {
    const spent = realNow - asked;
    if (spent < WAIT_MS)
      return {
        doc: {
          state: "waiting",
          last_at: c.backupLastAt,
          last_ok: c.backupLastOk,
          requested_at: nowIso,
          folder,
          message_tr: "Yedek isteğin alındı; birkaç saniye içinde başlar.",
        },
        settled: null,
      };
    if (spent < RUN_MS)
      return {
        doc: {
          state: "running",
          last_at: c.backupLastAt,
          last_ok: c.backupLastOk,
          requested_at: nowIso,
          folder,
          message_tr: "Yedek alınıyor. Bu bir iki dakika sürebilir.",
        },
        settled: null,
      };
    const ok = !c.backupFailing;
    const settled: Partial<MockComfort> = {
      backupAskedReal: null,
      backupLastOk: ok,
      backupLastAt: ok ? nowIso : c.backupLastAt,
    };
    return {
      doc: {
        state: "idle",
        last_at: settled.backupLastAt ?? null,
        last_ok: ok,
        requested_at: null,
        folder,
        message_tr: ok
          ? "Yedek hazır."
          : "Son yedek alınamadı. Yedek klasörünün yerinde olduğunu kontrol et.",
      },
      settled,
    };
  }
  const message =
    c.backupLastOk === false
      ? "Son yedek alınamadı. Yedek klasörünün yerinde olduğunu kontrol et."
      : c.backupLastAt === null
        ? "Henüz yedek alınmadı."
        : "Yedek hazır.";
  return {
    doc: {
      state: "idle",
      last_at: c.backupLastAt,
      last_ok: c.backupLastOk,
      requested_at: null,
      folder,
      message_tr: message,
    },
    settled: null,
  };
}

type ComfortApi = Pick<
  KaptanApi,
  | "preferences"
  | "saveAlertPrefs"
  | "startPause"
  | "endPause"
  | "backupStatus"
  | "runBackup"
  | "changePassword"
  | "signOutEverywhere"
>;

export function createComfort(ctx: MockCtx): ComfortApi {
  const { db, me, ok, now } = ctx;
  const patch = (fn: (c: MockComfort) => Partial<MockComfort>) =>
    db.update((s) => ({
      ...s,
      comfort: { ...comfortOf(s), ...fn(comfortOf(s)) },
    }));
  return {
    async preferences() {
      me();
      return ok(preferences(comfortOf(db.snapshot), now()), 80);
    },

    async saveAlertPrefs(prefs) {
      const a = me();
      const alerts = parse(AlertPrefsSchema, prefs);
      patch(() => ({ alerts }));
      db.audit(
        userActor(a),
        "preferences.alerts_changed",
        "preferences",
        "alerts",
        { quiet_hours: alerts.quiet.on },
      );
      return ok(preferences(comfortOf(db.snapshot), now()), 120);
    },

    async startPause(input) {
      const a = me();
      const at = now(); // one reading: "until" and "since" must come from the same instant
      const until = pauseEnd(
        "days" in input ? { days: input.days } : { until: input.until },
        at,
      );
      patch(() => ({ pauseUntil: until, pauseSince: at }));
      db.audit(userActor(a), "preferences.paused", "preferences", "pause", {
        until,
      });
      return ok(preferences(comfortOf(db.snapshot), now()), 140);
    },

    async endPause() {
      const a = me();
      const was = preferences(comfortOf(db.snapshot), now()).pause.active;
      patch(() => ({ pauseUntil: null, pauseSince: null }));
      if (was)
        db.audit(
          userActor(a),
          "preferences.resumed",
          "preferences",
          "pause",
          {},
        );
      return ok(preferences(comfortOf(db.snapshot), now()), 120);
    },

    async backupStatus() {
      me();
      const { doc, settled } = backup(
        comfortOf(db.snapshot),
        now(),
        Date.now(),
      );
      if (settled) patch(() => settled);
      return ok(doc, 60);
    },

    async runBackup() {
      const a = me();
      const before = backup(comfortOf(db.snapshot), now(), Date.now());
      if (before.doc.state !== "idle") return ok(before.doc, 60);
      patch(() => ({ backupAskedReal: Date.now() }));
      db.audit(userActor(a), "backup.requested", "backup", "now", {});
      return ok(backup(comfortOf(db.snapshot), now(), Date.now()).doc, 100);
    },

    async changePassword(input) {
      const a = me();
      const current = comfortOf(db.snapshot).password ?? TEST_PASSPHRASE;
      if (input.current !== current) {
        db.audit(
          userActor(a),
          "auth.password_change_failed",
          "session",
          "mock",
          {},
        );
        throw new ApiError(
          403,
          "wrong_password",
          "Şimdiki parolan doğru değil.",
        );
      }
      if (input.next.length < MIN_PASSWORD)
        throw new ApiError(
          422,
          "weak_password",
          `Yeni parola en az ${MIN_PASSWORD} karakter olmalı.`,
        );
      if (input.next.length > MAX_PASSWORD)
        throw new ApiError(
          422,
          "weak_password",
          `Yeni parola en fazla ${MAX_PASSWORD} karakter olabilir.`,
        );
      if (input.next === TEST_PASSPHRASE)
        throw new ApiError(
          422,
          "weak_password",
          "Bu parola herkesçe biliniyor. Başka bir parola seç.",
        );
      if (input.next === current)
        throw new ApiError(
          422,
          "weak_password",
          "Yeni parola şimdikiyle aynı. Başka bir parola seç.",
        );
      patch(() => ({ password: input.next }));
      db.audit(userActor(a), "auth.password_changed", "session", "mock", {
        signed_out: 0,
      });
      return ok({ signed_out_others: 0 }, 300);
    },

    async signOutEverywhere() {
      const a = me();
      db.audit(userActor(a), "auth.signed_out_everywhere", "session", "mock", {
        signed_out: 1,
      });
      return ok(undefined, 100);
    },
  };
}
