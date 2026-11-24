/** The 08:45 morning message and the weekend summary (backend telegram/morning.py), plus the "PC was off" line. */
import { eventsIn, lastSent, mineOf, moveEvents, recordSent, setMeta, type Lists, type State } from "./db";
import * as fmt from "./format";
import type { Bot } from "./telegram";
import { addDays, at, local, previousTradingDay } from "./time";
import type { EventRow } from "./types";

export const OFF_AFTER_MS = 12 * 3600_000;
const KEEP_MS = 3 * 86_400_000;

function merge(...groups: EventRow[][]): EventRow[] {
  const seen = new Map<number, EventRow>();
  for (const g of groups) for (const e of g) if (!seen.has(e.idx)) seen.set(e.idx, e);
  return [...seen.values()].sort((a, b) => a.published_at - b.published_at);
}

async function importantSince(db: D1Database, since: number, until: number): Promise<EventRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM events WHERE important = 1 AND published_at >= ? AND published_at <= ? ORDER BY published_at DESC, idx DESC")
    .bind(since, until)
    .all<EventRow>();
  return results;
}

/** True when the PC has been silent for more than 12 hours and this day was not told yet. */
export function wasOff(state: State, now: number): boolean {
  const today = local(now).date;
  return state.lastSyncAt !== null && now - state.lastSyncAt > OFF_AFTER_MS && state.raw.get("off_told_on") !== today;
}

export async function buildMorning(
  db: D1Database,
  state: State,
  lists: Lists,
  now: number,
): Promise<{ text: string; heldIds: number[]; told: boolean }> {
  const today = local(now).date;
  const prev = previousTradingDay(today);
  const weekend = await lastSent(db, "weekend");
  const since = Math.max(at(prev, "18:00"), weekend ?? 0);
  const fresh = (await importantSince(db, since, now)).filter((e) => !lists.muted.has(e.ticker));
  const held = (await eventsIn(db, "held")).filter((e) => !lists.muted.has(e.ticker));
  const mine = merge(
    fresh.filter((e) => mineOf(e.ticker, lists)),
    held.filter((e) => mineOf(e.ticker, lists)),
  );
  const others = fresh.filter((e) => !mineOf(e.ticker, lists)).slice(0, fmt.TOP_OTHERS);
  const off = wasOff(state, now);
  const text = fmt.morning({
    mine,
    others,
    when: prev === addDays(today, -1) ? "Dün akşamdan beri" : "Son iş gününden beri",
    capped: held.some((e) => e.reason === "cap"),
    wasOff: off,
  });
  return { text, heldIds: held.map((e) => e.idx), told: off };
}

/** Sends the morning message once; `true` when it went out. Also prunes old rows (once a day, in the same run). */
export async function sendMorning(db: D1Database, bot: Bot, state: State, lists: Lists, now: number): Promise<boolean> {
  if (state.chatId === null) return false;
  const { text, heldIds, told } = await buildMorning(db, state, lists, now);
  const res = await bot.send(state.chatId, text);
  if (!res.ok) return false;
  const today = local(now).date;
  await moveEvents(db, heldIds, "done", "morning", now);
  await recordSent(db, state, now, "morning", []);
  await setMeta(db, state, { morning_sent_on: today, ...(told ? { off_told_on: today } : {}) });
  await db.batch([
    db.prepare("DELETE FROM events WHERE published_at < ?").bind(now - KEEP_MS),
    db.prepare("DELETE FROM sent WHERE sent_at < ?").bind(now - KEEP_MS),
  ]);
  return true;
}

export async function sendWeekend(db: D1Database, bot: Bot, state: State, lists: Lists, now: number): Promise<boolean> {
  if (state.chatId === null) return false;
  const today = local(now).date;
  const fresh = (await importantSince(db, at(today, "08:45"), now)).filter((e) => !lists.muted.has(e.ticker));
  const held = (await eventsIn(db, "held")).filter((e) => !lists.muted.has(e.ticker));
  const mine = merge(
    fresh.filter((e) => mineOf(e.ticker, lists)),
    held.filter((e) => mineOf(e.ticker, lists)),
  );
  const res = await bot.send(state.chatId, fmt.weekend(mine));
  if (!res.ok) return false;
  await moveEvents(db, held.map((e) => e.idx), "done", "weekend", now);
  await recordSent(db, state, now, "weekend", []);
  await setMeta(db, state, { weekend_sent_on: today });
  return true;
}
