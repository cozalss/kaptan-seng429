import type { Quiet } from "./time";
import type { EventRow, Level, Mine } from "./types";

/** Everything small the Worker remembers lives in one `meta` table; it is read once per run. */
export interface State {
  raw: Map<string, string>;
  chatId: number | null;
  pairedAt: number | null;
  level: Level;
  dailyCap: number;
  silentUntil: number | null;
  quiet: Quiet;
  lastSyncAt: number | null;
}

export const DEFAULT_CAP = 8;
const LEVELS = new Set<string>(["less", "normal", "more"]);
const NO_QUIET: Quiet = { on: false, start: "22:00", end: "08:00" };

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadState(db: D1Database): Promise<State> {
  const { results } = await db.prepare("SELECT key, value FROM meta").all<{ key: string; value: string }>();
  const raw = new Map(results.map((r) => [r.key, r.value]));
  let quiet = NO_QUIET;
  try {
    const q = JSON.parse(raw.get("quiet") ?? "null") as Partial<Quiet> | null;
    if (q && typeof q === "object") quiet = { on: q.on === true, start: q.start ?? "22:00", end: q.end ?? "08:00" };
  } catch {
    quiet = NO_QUIET;
  }
  const level = raw.get("level") ?? "normal";
  return {
    raw,
    chatId: num(raw.get("chat_id")),
    pairedAt: num(raw.get("paired_at")),
    level: (LEVELS.has(level) ? level : "normal") as Level,
    dailyCap: num(raw.get("daily_cap")) ?? DEFAULT_CAP,
    silentUntil: num(raw.get("silent_until")),
    quiet,
    lastSyncAt: num(raw.get("last_sync_at")),
  };
}

/** Writes only what changed (a D1 write is a counted resource); returns the statements for `db.batch`. */
export function metaStatements(db: D1Database, state: State, values: Record<string, string | number | null>): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(values)) {
    const text = value === null ? null : String(value);
    if ((state.raw.get(key) ?? null) === text) continue;
    if (text === null) {
      out.push(db.prepare("DELETE FROM meta WHERE key = ?").bind(key));
      state.raw.delete(key);
    } else {
      out.push(db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, text));
      state.raw.set(key, text);
    }
  }
  return out;
}

export async function setMeta(db: D1Database, state: State, values: Record<string, string | number | null>): Promise<void> {
  const statements = metaStatements(db, state, values);
  if (statements.length) await db.batch(statements);
}

export interface Lists {
  held: Set<string>;
  watched: Set<string>;
  muted: Set<string>;
}

export async function loadLists(db: D1Database): Promise<Lists> {
  const [lists, muted] = await db.batch<{ ticker: string; kind?: string }>([
    db.prepare("SELECT ticker, kind FROM lists"),
    db.prepare("SELECT ticker FROM muted"),
  ]);
  const held = new Set<string>();
  const watched = new Set<string>();
  for (const r of lists?.results ?? []) (r.kind === "held" ? held : watched).add(r.ticker);
  return { held, watched, muted: new Set((muted?.results ?? []).map((r) => r.ticker)) };
}

/** Held wins over watched (backend `mine_of`). */
export function mineOf(ticker: string, lists: Lists): Mine {
  if (lists.held.has(ticker)) return "held";
  return lists.watched.has(ticker) ? "watched" : null;
}

export async function recordSent(db: D1Database, state: State, now: number, kind: string, tickers: string[]): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO sent (sent_at, kind, tickers) VALUES (?, ?, ?)").bind(now, kind, JSON.stringify([...new Set(tickers)].sort())),
    ...metaStatements(db, state, { last_message_at: now }),
  ]);
}

export async function sentToday(db: D1Database, start: number, end: number): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM sent WHERE kind = 'instant' AND sent_at >= ? AND sent_at < ?")
    .bind(start, end)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function lastInstant(db: D1Database, ticker: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT max(sent_at) AS at FROM sent WHERE kind = 'instant' AND tickers LIKE ?")
    .bind(`%"${ticker}"%`)
    .first<{ at: number | null }>();
  return row?.at ?? null;
}

export async function lastSent(db: D1Database, kind: string): Promise<number | null> {
  const row = await db.prepare("SELECT max(sent_at) AS at FROM sent WHERE kind = ?").bind(kind).first<{ at: number | null }>();
  return row?.at ?? null;
}

export async function eventsIn(db: D1Database, state: string): Promise<EventRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM events WHERE state = ? ORDER BY published_at, idx")
    .bind(state)
    .all<EventRow>();
  return results;
}

export async function moveEvents(db: D1Database, ids: number[], state: string, reason: string | null, now: number): Promise<void> {
  if (!ids.length) return;
  const sentAt = state === "done" ? now : null;
  await db.batch(ids.map((id) => db.prepare("UPDATE events SET state = ?, reason = ?, sent_at = ? WHERE idx = ?").bind(state, reason, sentAt, id)));
}

export async function pushAction(db: D1Database, action: string, idx: number | null, ticker: string | null, now: number): Promise<void> {
  await db.prepare("INSERT INTO actions (action, idx, ticker, created_at) VALUES (?, ?, ?, ?)").bind(action, idx, ticker, now).run();
}
