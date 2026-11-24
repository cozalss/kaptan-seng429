/**
 * What the PC KAPtan tells the Worker (POST /sync) and fetches from it (GET /actions): outbound from the PC only.
 * The lists hold TICKERS only: never amounts, share counts, prices or anything about the person's money.
 */
import { safeEqual } from "./crypto";
import { loadState, metaStatements, type State } from "./db";
import { clockMinutes } from "./time";
import { sha256Hex } from "./crypto";

export const MAX_TICKERS = 400;
export const MAX_ACTIONS = 200;
const TICKER_RE = /^[A-Z0-9]{3,6}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const LEVELS = ["less", "normal", "more"];
const MAX_BODY = 64 * 1024;

export class BadRequest extends Error {}

export async function authorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return safeEqual(token, env.CLOUD_SYNC_SECRET ?? "");
}

function tickers(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TICKERS) throw new BadRequest(`${field}: expected a short list`);
  const out = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !TICKER_RE.test(v)) throw new BadRequest(`${field}: not a ticker`);
    out.add(v);
  }
  return [...out].sort();
}

export interface SyncBody {
  held: string[];
  watched: string[];
  muted: string[];
  quiet: { on: boolean; start: string; end: string } | null;
  level: string | null;
  dailyCap: number | null;
  pair: { hash: string; expiresAt: number } | null;
  unlink: boolean;
  chatId: number | null;
}

export function parseSync(raw: unknown): SyncBody {
  if (!raw || typeof raw !== "object") throw new BadRequest("expected a JSON object");
  const o = raw as Record<string, unknown>;
  const q = o.quiet as Record<string, unknown> | undefined;
  let quiet: SyncBody["quiet"] = null;
  if (q && typeof q === "object") {
    if (clockMinutes(q.start) === null || clockMinutes(q.end) === null) throw new BadRequest("quiet: bad clock");
    quiet = { on: q.on === true, start: String(q.start), end: String(q.end) };
  }
  const level = o.level === undefined || o.level === null ? null : String(o.level);
  if (level !== null && !LEVELS.includes(level)) throw new BadRequest("level: unknown");
  const cap = o.daily_cap === undefined || o.daily_cap === null ? null : Number(o.daily_cap);
  if (cap !== null && !(Number.isInteger(cap) && cap >= 1 && cap <= 50)) throw new BadRequest("daily_cap: 1..50");
  const p = o.pair as Record<string, unknown> | null | undefined;
  let pair: SyncBody["pair"] = null;
  if (p && typeof p === "object") {
    if (typeof p.hash !== "string" || !HEX64.test(p.hash) || !Number.isFinite(Number(p.expires_at))) throw new BadRequest("pair: bad code");
    pair = { hash: p.hash, expiresAt: Number(p.expires_at) };
  }
  return {
    held: tickers(o.held, "held"),
    watched: tickers(o.watched, "watched"),
    muted: tickers(o.muted, "muted"),
    quiet,
    level,
    dailyCap: cap,
    pair,
    unlink: o.unlink === true,
    chatId: Number.isSafeInteger(o.chat_id) ? Number(o.chat_id) : null,
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new BadRequest("body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("not JSON");
  }
}

export interface SyncReply {
  ok: true;
  chat_id: number | null;
  paired_at: number | null;
  level: string;
  daily_cap: number;
  silent_until: number | null;
  last_message_at: number | null;
  last_poll_at: number | null;
  kap_status: string;
  kap_reason: string | null;
}

export function replyOf(state: State): SyncReply {
  const n = (k: string): number | null => (state.raw.has(k) ? Number(state.raw.get(k)) : null);
  return {
    ok: true,
    chat_id: state.chatId,
    paired_at: state.pairedAt,
    level: state.level,
    daily_cap: state.dailyCap,
    silent_until: state.silentUntil,
    last_message_at: n("last_message_at"),
    last_poll_at: n("last_poll_at"),
    kap_status: state.raw.get("kap_status") ?? "unknown",
    kap_reason: state.raw.get("kap_reason") ?? null,
  };
}

/** Applies one sync. Lists are only rewritten when they changed (a D1 write is a counted resource). */
export async function applySync(db: D1Database, body: SyncBody, now: number): Promise<SyncReply> {
  const state = await loadState(db);
  const { results: pending } = await db.prepare("SELECT ticker FROM actions WHERE action = 'mute'").all<{ ticker: string }>();
  // A mute pressed on the phone that the PC has not pulled yet must survive this sync.
  const muted = [...new Set([...body.muted, ...pending.map((r) => r.ticker)])].sort();
  const held = body.held;
  const watched = body.watched.filter((t) => !held.includes(t));
  const digest = await sha256Hex(JSON.stringify([held, watched, muted]));
  const statements: D1PreparedStatement[] = [];
  if (state.raw.get("lists_hash") !== digest) {
    statements.push(db.prepare("DELETE FROM lists"), db.prepare("DELETE FROM muted"));
    for (const t of held) statements.push(db.prepare("INSERT INTO lists (ticker, kind) VALUES (?, 'held')").bind(t));
    for (const t of watched) statements.push(db.prepare("INSERT INTO lists (ticker, kind) VALUES (?, 'watched')").bind(t));
    for (const t of muted) statements.push(db.prepare("INSERT INTO muted (ticker) VALUES (?)").bind(t));
  }
  const meta: Record<string, string | number | null> = { lists_hash: digest, last_sync_at: now };
  if (body.quiet) meta.quiet = JSON.stringify(body.quiet);
  // The PC's value wins only when it changed there; otherwise what /ayar set on the phone stays.
  if (body.level !== null && state.raw.get("pc_level") !== body.level) {
    meta.level = body.level;
    meta.pc_level = body.level;
  }
  if (body.dailyCap !== null && state.raw.get("pc_cap") !== String(body.dailyCap)) {
    meta.daily_cap = body.dailyCap;
    meta.pc_cap = body.dailyCap;
  }
  if (body.unlink) Object.assign(meta, { chat_id: null, paired_at: null, pair_hash: null, pair_expires: null });
  else if (body.pair && body.pair.hash !== state.raw.get("pair_used") && body.pair.hash !== state.raw.get("pair_hash")) {
    Object.assign(meta, { pair_hash: body.pair.hash, pair_expires: body.pair.expiresAt, chat_id: null, paired_at: null });
  }
  // A chat the PC paired before the cloud existed carries over (only into an unpaired Worker, never over a new pairing).
  if (state.chatId === null && !body.unlink && !body.pair && body.chatId !== null) {
    Object.assign(meta, { chat_id: body.chatId, paired_at: now });
  }
  statements.push(...metaStatements(db, state, meta));
  if (statements.length) await db.batch(statements);
  return replyOf(await loadState(db));
}
