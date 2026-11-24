/**
 * The instant tier (backend telegram/routing.py + dispatch.py): new important disclosures of the person's own stocks,
 * one message per company per 30 minutes, a daily cap, quiet hours, one message a second.
 * Nothing is dropped: what cannot go now is `held` for the morning message.
 */
import { eventsIn, lastInstant, mineOf, moveEvents, recordSent, sentToday, type Lists, type State } from "./db";
import * as fmt from "./format";
import type { Bot } from "./telegram";
import { addDays, at, inQuiet, local } from "./time";
import type { EventRow, Level, Mine } from "./types";

export const GROUP_WINDOW_MS = 30 * 60_000;
export const SEND_GAP_MS = 1100;
/** Subrequests are capped at 50 per run on the free plan: the KAP fetch and a few model calls use some. */
export const MAX_SENDS_PER_RUN = 15;

export type Tier = "instant" | "morning" | "skip";

export function tier(e: Pick<EventRow, "important" | "tone">, mine: Mine, level: Level): Tier {
  if (!e.important) return level === "more" && mine === "watched" ? "instant" : "skip";
  if (level === "less") return mine === "held" && (e.tone === "olumlu" || e.tone === "olumsuz") ? "instant" : "morning";
  return mine ? "instant" : "morning";
}

export function isQuiet(state: State, now: number): boolean {
  return (state.silentUntil !== null && now < state.silentUntil) || inQuiet(state.quiet, now);
}

/** The next 08:45 Istanbul after `now` (the end of /sessiz). */
export function nextMorning(now: number): number {
  const l = local(now);
  const today = at(l.date, "08:45");
  return today > now ? today : at(addDays(l.date, 1), "08:45");
}

export function dayBounds(now: number): [number, number] {
  const start = at(local(now).date, "00:00");
  return [start, start + 86_400_000];
}

async function intake(db: D1Database, state: State, lists: Lists, now: number): Promise<void> {
  for (const e of await eventsIn(db, "new")) {
    const mine = mineOf(e.ticker, lists);
    const t = tier(e, mine, state.level);
    if (t === "instant" && lists.muted.has(e.ticker)) await moveEvents(db, [e.idx], "done", "muted", now);
    else if (t === "instant") await moveEvents(db, [e.idx], "queued", null, now);
    else if (t === "morning") await moveEvents(db, [e.idx], "morning", null, now);
    else await moveEvents(db, [e.idx], "done", "skip", now);
  }
}

export type Sleep = (ms: number) => Promise<void>;

/** One pass; returns how many messages went out. A failed send leaves its events queued for the next pass. */
export async function instantPass(
  db: D1Database,
  bot: Bot,
  state: State,
  lists: Lists,
  now: number,
  sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<number> {
  if (state.chatId === null) return 0;
  await intake(db, state, lists, now);
  const byTicker = new Map<string, EventRow[]>();
  for (const e of await eventsIn(db, "queued")) {
    if (lists.muted.has(e.ticker)) {
      await moveEvents(db, [e.idx], "done", "muted", now);
      continue;
    }
    byTicker.set(e.ticker, [...(byTicker.get(e.ticker) ?? []), e]);
  }
  const [start, end] = dayBounds(now);
  let today = await sentToday(db, start, end);
  let sent = 0;
  for (const [ticker, events] of byTicker) {
    const ids = events.map((e) => e.idx);
    if (isQuiet(state, now)) {
      await moveEvents(db, ids, "held", "quiet", now);
    } else if (today >= state.dailyCap) {
      await moveEvents(db, ids, "held", "cap", now);
    } else {
      const last = await lastInstant(db, ticker);
      if (last !== null && now - last < GROUP_WINDOW_MS) continue; // they go together later as one grouped message
      if (sent >= MAX_SENDS_PER_RUN) break;
      if (sent) await sleep(SEND_GAP_MS);
      const text = events.length === 1 ? fmt.one(events[0] as EventRow) : fmt.group(ticker, (events[0] as EventRow).company, events);
      const res = await bot.send(state.chatId, text, fmt.keyboard(events));
      if (!res.ok) {
        if (res.retryAfter) await sleep(Math.min(res.retryAfter, 30) * 1000);
        continue;
      }
      await moveEvents(db, ids, "done", "instant", now);
      await recordSent(db, state, now, "instant", [ticker]);
      sent += 1;
      today += 1;
    }
  }
  return sent;
}
