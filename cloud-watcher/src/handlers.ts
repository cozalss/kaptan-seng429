/**
 * What the bot does with an update (backend telegram/handlers.py): /start <code>, /ayar, /sessiz, /durum and the
 * buttons. Only the paired chat is listened to; before pairing the only thing accepted is `/start <live code>`.
 * No button approves a suggestion: approving moves money and stays in the app.
 */
import { sha256Hex } from "./crypto";
import { loadLists, loadState, pushAction, setMeta, type State } from "./db";
import { dayBounds, nextMorning } from "./dispatch";
import { CB_LATER, CB_MUTE, CB_READ, CB_READ_ALL, esc, HELP, LEVEL_TR } from "./format";
import type { Bot, Markup } from "./telegram";
import type { Level } from "./types";

const TICKER_RE = /^[A-Z0-9]{3,6}$/;
const CODE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_MUTED = 50;
const READ_ALL_LIMIT = 20;
const LEVEL_WORDS: Record<string, Level> = { az: "less", "daha az": "less", normal: "normal", çok: "more", cok: "more", "daha çok": "more" };
const LEVEL_KEYS: Level[] = ["less", "normal", "more"];
const PC_OFF_MS = 12 * 3600_000;

interface TgChat {
  id?: number;
  type?: string;
}
interface TgMessage {
  message_id?: number;
  chat?: TgChat;
  text?: string;
  reply_markup?: { inline_keyboard?: Array<Array<{ url?: string }>> };
}
export interface TgUpdate {
  message?: TgMessage;
  callback_query?: { id?: string; data?: string; message?: TgMessage };
}

function privateChat(m: TgMessage | undefined): number | null {
  return m?.chat?.type === "private" && typeof m.chat.id === "number" ? m.chat.id : null;
}

function levelKeyboard(): Markup {
  return { inline_keyboard: [LEVEL_KEYS.map((k) => ({ text: LEVEL_TR[k] as string, callback_data: `lvl:${k}` }))] };
}

export async function statusText(db: D1Database, state: State, now: number): Promise<string> {
  const [start, end] = dayBounds(now);
  const sent = await db
    .prepare("SELECT count(*) AS n FROM sent WHERE kind = 'instant' AND sent_at >= ? AND sent_at < ?")
    .bind(start, end)
    .first<{ n: number }>();
  const held = await db.prepare("SELECT count(*) AS n FROM events WHERE state = 'held'").first<{ n: number }>();
  const rows = [
    `Bugün ${sent?.n ?? 0} anlık mesaj gönderdim (günlük sınır ${state.dailyCap}).`,
    `Sabaha kalan: ${held?.n ?? 0}. Seviye: ${LEVEL_TR[state.level]}.`,
  ];
  if (state.silentUntil !== null && now < state.silentUntil) rows.push("Şu an sessizdeyim; sabah mesajıyla devam ederim.");
  if (state.lastSyncAt !== null && now - state.lastSyncAt > PC_OFF_MS) {
    rows.push("Bilgisayardaki KAPtan kapalı görünüyor; öneriler için açman gerek.");
  }
  return rows.join("\n");
}

export async function handleUpdate(env: Env, update: TgUpdate, now: number, bot: Bot): Promise<void> {
  const state = await loadState(env.DB);
  if (update.callback_query) await callback(env, state, update.callback_query, now, bot);
  else if (update.message) await message(env, state, update.message, now, bot);
}

async function message(env: Env, state: State, msg: TgMessage, now: number, bot: Bot): Promise<void> {
  const chat = privateChat(msg);
  if (chat === null || (state.chatId !== null && chat !== state.chatId)) return;
  const [first = "", ...rest] = String(msg.text ?? "").trim().split(/\s+/);
  const command = (first.split("@")[0] ?? "").toLowerCase();
  const arg = rest.join(" ").trim();
  if (state.chatId === null) {
    if (command === "/start" && (await codeMatches(state, arg, now))) {
      const used = state.raw.get("pair_hash") ?? null; // remembered, so a later sync of the same code is not a new pairing
      await setMeta(env.DB, state, { chat_id: chat, paired_at: now, pair_used: used, pair_hash: null, pair_expires: null });
      await bot.send(chat, `Bağlandı. Senin hisselerindeki önemli duyuruları artık buraya yazarım.\n\n${HELP}`);
    }
    return;
  }
  if (command === "/start") await bot.send(chat, HELP);
  else if (command === "/ayar") await ayar(env, state, bot, chat, arg.toLowerCase());
  else if (command === "/sessiz") {
    await setMeta(env.DB, state, { silent_until: nextMorning(now) });
    await bot.send(chat, "Tamam. Sabah mesajına kadar anlık mesaj göndermem; kalanlar sabah mesajında olur.");
  } else if (command === "/durum") await bot.send(chat, await statusText(env.DB, state, now));
}

async function codeMatches(state: State, code: string, now: number): Promise<boolean> {
  const stored = state.raw.get("pair_hash");
  const expires = Number(state.raw.get("pair_expires") ?? 0);
  if (!stored || now >= expires || !CODE_RE.test(code)) return false;
  return (await sha256Hex(code)) === stored;
}

async function ayar(env: Env, state: State, bot: Bot, chat: number, arg: string): Promise<void> {
  const level = LEVEL_WORDS[arg];
  if (!level) {
    await bot.send(chat, `Şu an: ${LEVEL_TR[state.level]}. Değiştirmek için seç:`, levelKeyboard());
    return;
  }
  await setMeta(env.DB, state, { level });
  await bot.send(chat, `Tamam: ${LEVEL_TR[level]}.`);
}

function after(msg: TgMessage): Markup {
  const links = (msg.reply_markup?.inline_keyboard ?? []).flat().filter((b) => typeof b.url === "string") as Array<Record<string, string>>;
  return { inline_keyboard: links.length ? [links] : [] };
}

async function callback(env: Env, state: State, cb: NonNullable<TgUpdate["callback_query"]>, now: number, bot: Bot): Promise<void> {
  const msg = cb.message ?? {};
  const chat = privateChat(msg);
  if (state.chatId === null || chat !== state.chatId) return;
  const [kind = "", ...parts] = String(cb.data ?? "").split(":");
  const done = await act(env, state, kind, parts, now);
  await bot.answer(String(cb.id ?? ""), done ? done[0] : "");
  if (!done || typeof msg.message_id !== "number") return;
  await bot.edit(chat, msg.message_id, `${esc(String(msg.text ?? ""))}\n\n<i>${esc(done[1])}</i>`, after(msg));
}

/** (toast, line added to the message) or null for an unknown or failed button. */
async function act(env: Env, state: State, kind: string, parts: string[], now: number): Promise<[string, string] | null> {
  const arg = parts[0] ?? "";
  if (kind === CB_READ && /^\d+$/.test(arg)) {
    await pushAction(env.DB, "read", Number(arg), null, now);
    return ["Okundu", "✓ Okundu"];
  }
  if (kind === CB_LATER && /^\d+$/.test(arg)) {
    await pushAction(env.DB, "later", Number(arg), null, now);
    return ["Sonra okunacaklara eklendi", "Sonra oku listesinde"];
  }
  if (kind === CB_READ_ALL && TICKER_RE.test(arg) && /^\d+$/.test(parts[1] ?? "")) {
    const stamp = Number(parts[1]) * 1000;
    const { results } = await env.DB
      .prepare("SELECT idx FROM events WHERE ticker = ? AND published_at <= ? AND published_at > ? ORDER BY published_at DESC LIMIT ?")
      .bind(arg, stamp, stamp - 86_400_000, READ_ALL_LIMIT)
      .all<{ idx: number }>();
    for (const r of results) await pushAction(env.DB, "read", r.idx, null, now);
    return ["Okundu", "✓ Hepsi okundu"];
  }
  if (kind === CB_MUTE && TICKER_RE.test(arg)) return mute(env, arg, now);
  if (kind === "lvl" && LEVEL_KEYS.includes(arg as Level)) {
    await setMeta(env.DB, state, { level: arg });
    return [LEVEL_TR[arg] as string, `Seviye: ${LEVEL_TR[arg]}`];
  }
  return null;
}

async function mute(env: Env, ticker: string, now: number): Promise<[string, string] | null> {
  const lists = await loadLists(env.DB);
  if (!lists.muted.has(ticker)) {
    if (lists.muted.size >= MAX_MUTED) return null;
    await env.DB.prepare("INSERT OR IGNORE INTO muted (ticker) VALUES (?)").bind(ticker).run(); // applies at once
    await pushAction(env.DB, "mute", null, ticker, now); // the PC applies it to its own list when it runs
  }
  return [`${ticker} susturuldu`, `🔕 ${ticker} susturuldu. Ayarlar'dan geri açabilirsin.`];
}
