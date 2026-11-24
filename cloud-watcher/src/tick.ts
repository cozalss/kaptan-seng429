/** What one cron run does: look at KAP, keep what matters, send what is due. Never throws. */
import { instantPass, type Sleep } from "./dispatch";
import { loadLists, loadState, setMeta } from "./db";
import { sendMorning, sendWeekend } from "./digest";
import { ingest } from "./ingest";
import { fetchKap, KAP_BASE } from "./kap";
import { makeBot, type Bot } from "./telegram";
import { addDays, isTradingDay, local } from "./time";

const MAX_BACKOFF_MIN = 30;
const MORNING_FROM = 8 * 60 + 45;
const MORNING_UNTIL = 12 * 60;
const WEEKEND_FROM = 18 * 60 + 30;
const WEEKEND_UNTIL = 23 * 60;
const SESSION_FROM = 8 * 60;
const SESSION_TO = 19 * 60;

export interface TickResult {
  polled: boolean;
  stored: number;
  sent: number;
  skipped?: string;
}

export interface TickDeps {
  bot?: Bot;
  sleep?: Sleep;
}

/** Market hours every run (2 min); otherwise every 10 minutes: the same shape as the backend poller, a little slower. */
export function shouldPoll(now: number, nextTryAt: number | null): boolean {
  if (nextTryAt !== null && now < nextTryAt) return false;
  const l = local(now);
  const session = l.weekday >= 1 && l.weekday <= 5 && l.minutes >= SESSION_FROM && l.minutes < SESSION_TO;
  return session || l.minutes % 10 === 0;
}

export async function runTick(env: Env, now: number = Date.now(), deps: TickDeps = {}): Promise<TickResult> {
  const state = await loadState(env.DB);
  if (state.chatId === null) return { polled: false, stored: 0, sent: 0, skipped: "not paired" };
  const bot = deps.bot ?? makeBot(env.TELEGRAM_BOT_TOKEN);
  const lists = await loadLists(env.DB);
  const l = local(now);
  const result: TickResult = { polled: false, stored: 0, sent: 0 };

  if (shouldPoll(now, state.raw.has("next_try_at") ? Number(state.raw.get("next_try_at")) : null)) {
    result.polled = true;
    const got = await fetchKap(env.KAP_BASE_URL ?? KAP_BASE, l.date, l.minutes < 10);
    if (got.ok) {
      result.stored = await ingest(env, env.DB, state, lists, got.rows, now);
      await setMeta(env.DB, state, { kap_status: "ok", kap_reason: null, kap_fail: 0, next_try_at: null, last_poll_at: now });
    } else {
      const fails = Number(state.raw.get("kap_fail") ?? 0) + 1;
      const waitMin = Math.min(MAX_BACKOFF_MIN, 2 ** fails * 2);
      await setMeta(env.DB, state, {
        kap_status: got.blocked ? "blocked" : "error",
        kap_reason: got.reason,
        kap_fail: fails,
        next_try_at: now + waitMin * 60_000,
        last_poll_at: now,
      });
    }
  }

  result.sent += await instantPass(env.DB, bot, state, lists, now, deps.sleep);

  const trading = isTradingDay(l.date);
  if (trading && l.minutes >= MORNING_FROM && l.minutes < MORNING_UNTIL && state.raw.get("morning_sent_on") !== l.date) {
    if (await sendMorning(env.DB, bot, state, lists, now)) result.sent += 1;
  }
  if (trading && !isTradingDay(addDays(l.date, 1)) && l.minutes >= WEEKEND_FROM && l.minutes < WEEKEND_UNTIL && state.raw.get("weekend_sent_on") !== l.date) {
    if (await sendWeekend(env.DB, bot, state, lists, now)) result.sent += 1;
  }
  return result;
}
