import type { SettingsReset, TelegramLevel, TelegramStatus } from "@/lib/domain/telegram";
import { defaultAlertPrefs } from "@/lib/prefs/alert-defaults";
import { comfortOf, preferences } from "./comfort";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import { userActor } from "./guard";
import type { MockState } from "./state";

/**
 * The test double of /me/telegram (backend kaptan.api.routers.telegram): same refusals and sentences. The phone is
 * simulated: a connect link made by `pairTelegram` counts as tapped `PAIR_DELAY_MS` later (real time), so the screen's
 * waiting state and its "connected" state can both be seen. The bot code is never stored in clear anywhere readable:
 * the double keeps only that one was accepted.
 */
export interface MockTelegram {
  configured: boolean;
  bot_username: string | null;
  paired: boolean;
  /** Real time (ms) when the pairing link was made; the "phone" taps it PAIR_DELAY_MS later. */
  pairedAtReal: number | null;
  level: TelegramLevel;
  daily_cap: number;
  sentAtReal: number | null;
  lastSent: string | null;
}

export const PAIR_DELAY_MS = 2500;
const TOKEN_SHAPE = /^\d{6,12}:[A-Za-z0-9_-]{30,60}$/;
const BAD_SHAPE = "Bu bir bot kodu gibi görünmüyor. @BotFather’ın verdiği, ortasında iki nokta olan kodu yapıştır.";
const MOCK_BOT = "kaptan_mock_bot";
const SAMPLE_GAP_MS = 60_000;

export function initialTelegram(): MockTelegram {
  return {
    configured: false,
    bot_username: null,
    paired: false,
    pairedAtReal: null,
    level: "normal",
    daily_cap: 8,
    sentAtReal: null,
    lastSent: null,
  };
}

export function telegramOf(state: MockState): MockTelegram {
  return { ...initialTelegram(), ...(state.telegram ?? {}) };
}

/** The double has no .env: a test turns the cloud on with sessionStorage "kaptan-mock-cloud" = "1" (and the KAP state in
 * "kaptan-mock-cloud-kap"). */
function cloudFlag(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function cloudView(t: MockTelegram, nowReal: number): Pick<TelegramStatus, "cloud_on" | "cloud_synced_at" | "cloud_message_at" | "cloud_kap" | "cloud_error"> {
  if (cloudFlag("kaptan-mock-cloud") !== "1") {
    return { cloud_on: false, cloud_synced_at: null, cloud_message_at: null, cloud_kap: null, cloud_error: false };
  }
  const kap = cloudFlag("kaptan-mock-cloud-kap");
  return {
    cloud_on: true,
    cloud_synced_at: new Date(nowReal - 4 * 60_000).toISOString(),
    cloud_message_at: t.lastSent ?? new Date(nowReal - 3 * 3_600_000).toISOString(),
    cloud_kap: kap === "blocked" || kap === "unknown" || kap === "error" ? kap : "ok",
    cloud_error: cloudFlag("kaptan-mock-cloud-error") === "1",
  };
}

function view(t: MockTelegram, nowReal: number): TelegramStatus {
  const waiting = !t.paired && t.pairedAtReal !== null;
  return {
    configured: t.configured,
    token_from_env: false,
    bot_username: t.bot_username,
    paired: t.paired,
    pairing_open: waiting,
    pairing_expires_at: waiting ? new Date(nowReal + 15 * 60_000).toISOString() : null,
    level: t.level,
    daily_cap: t.daily_cap,
    silent_until: null,
    last_sent_at: t.lastSent,
    ...cloudView(t, nowReal),
  };
}

export function createTelegram(
  ctx: MockCtx,
): Pick<KaptanApi, "telegramStatus" | "saveTelegram" | "pairTelegram" | "unlinkTelegram" | "sendTelegramSample" | "resetSettings"> {
  const { db, ok, me } = ctx;
  const write = (fn: (t: MockTelegram) => MockTelegram) =>
    db.update((s) => ({ ...s, telegram: fn(telegramOf(s)) }));
  /** The "phone" taps the link once its delay has passed. */
  const settle = (): MockTelegram => {
    const t = telegramOf(db.snapshot);
    if (!t.paired && t.pairedAtReal !== null && Date.now() - t.pairedAtReal >= PAIR_DELAY_MS) {
      write((x) => ({ ...x, paired: true }));
      return telegramOf(db.snapshot);
    }
    return t;
  };
  return {
    async telegramStatus() {
      me();
      return ok(view(settle(), Date.now()), 80);
    },
    async saveTelegram(input) {
      const a = me();
      const t = settle();
      if (input.token !== undefined && input.token.trim() !== "") {
        if (!TOKEN_SHAPE.test(input.token.trim())) throw new ApiError(422, "validation", BAD_SHAPE);
        write((x) => ({ ...x, configured: true, bot_username: MOCK_BOT, paired: false, pairedAtReal: null }));
      }
      if (input.level !== undefined || input.daily_cap !== undefined) {
        write((x) => ({ ...x, level: input.level ?? t.level, daily_cap: input.daily_cap ?? t.daily_cap }));
      }
      db.audit(userActor(a), "telegram.changed", "telegram", "link", { token_set: input.token !== undefined });
      return ok(view(telegramOf(db.snapshot), Date.now()), 160);
    },
    async pairTelegram() {
      const a = me();
      const t = settle();
      if (!t.configured) throw new ApiError(409, "conflict", "Önce bot kodunu yapıştırıp kaydet.");
      write((x) => ({ ...x, paired: false, pairedAtReal: Date.now() }));
      db.audit(userActor(a), "telegram.pairing_started", "telegram", "link", {});
      const code = Math.random().toString(36).slice(2, 14).padEnd(12, "x");
      return ok(
        { pair_link: `https://t.me/${MOCK_BOT}?start=${code}`, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() },
        160,
      );
    },
    async unlinkTelegram() {
      const a = me();
      write(() => initialTelegram());
      db.audit(userActor(a), "telegram.unlinked", "telegram", "link", {});
      return ok(view(initialTelegram(), Date.now()), 120);
    },
    async resetSettings(): Promise<SettingsReset> {
      const a = me();
      write((x) => ({ ...x, level: "normal", daily_cap: 8 }));
      db.update((s) => ({
        ...s,
        comfort: { ...comfortOf(s), alerts: defaultAlertPrefs(), pauseUntil: null, pauseSince: null },
      }));
      db.audit(userActor(a), "settings.reset", "settings", "all", {});
      return ok(
        { preferences: preferences(comfortOf(db.snapshot), db.nowIso()), telegram: view(telegramOf(db.snapshot), Date.now()) },
        160,
      );
    },
    async sendTelegramSample() {
      me();
      const t = settle();
      if (!t.paired) throw new ApiError(409, "conflict", "Önce Telegram’ı bağla.");
      if (t.sentAtReal !== null && Date.now() - t.sentAtReal < SAMPLE_GAP_MS) {
        throw new ApiError(429, "rate_limited", "Bu mesaj en fazla dakikada bir gönderilir. Biraz sonra yeniden dene.");
      }
      write((x) => ({ ...x, sentAtReal: Date.now(), lastSent: db.nowIso() }));
      return ok(view(telegramOf(db.snapshot), Date.now()), 200);
    },
  };
}
