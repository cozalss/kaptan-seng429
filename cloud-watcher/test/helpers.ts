import { env } from "cloudflare:workers";
import schema from "../migrations/0001_init.sql?raw";
import { at } from "../src/time";
import type { Bot, Markup, SendResult } from "../src/telegram";

export const testEnv = env as unknown as Env;
export const CHAT = 4242;
export const SECRET = "sync-secret-for-tests";
export const HOOK = "hook-secret-for-tests";

/** Tuesday, a trading day. */
export const TUE = "2026-11-24";
export const FRI = "2026-11-27";
export const MON = "2026-11-30";
export const SAT = "2026-11-28";

export const ist = (date: string, hhmm: string): number => at(date, hhmm);

export async function resetDb(): Promise<void> {
  const db = testEnv.DB;
  const statements = schema
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await db.prepare(s).run();
  for (const t of ["meta", "lists", "muted", "events", "sent", "actions"]) await db.prepare(`DELETE FROM ${t}`).run();
}

export async function setMeta(values: Record<string, string | number>): Promise<void> {
  for (const [k, v] of Object.entries(values)) {
    await testEnv.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(k, String(v)).run();
  }
}

export async function meta(key: string): Promise<string | null> {
  const r = await testEnv.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function pair(now: number, extra: Record<string, string | number> = {}): Promise<void> {
  await setMeta({ chat_id: CHAT, paired_at: now - 24 * 3600_000, ...extra });
}

export async function setLists(held: string[], watched: string[], muted: string[] = []): Promise<void> {
  for (const t of held) await testEnv.DB.prepare("INSERT INTO lists (ticker, kind) VALUES (?, 'held')").bind(t).run();
  for (const t of watched) await testEnv.DB.prepare("INSERT INTO lists (ticker, kind) VALUES (?, 'watched')").bind(t).run();
  for (const t of muted) await testEnv.DB.prepare("INSERT INTO muted (ticker) VALUES (?)").bind(t).run();
}

export interface Sent {
  chat: number;
  text: string;
  markup?: Markup;
}

export function fakeBot(): Bot & { sent: Sent[]; edits: Array<{ text: string; markup: Markup }>; answers: string[]; fail: boolean } {
  const bot = {
    sent: [] as Sent[],
    edits: [] as Array<{ text: string; markup: Markup }>,
    answers: [] as string[],
    fail: false,
    async send(chat: number, text: string, markup?: Markup): Promise<SendResult> {
      if (bot.fail) return { ok: false, reason: "http_500" };
      bot.sent.push({ chat, text, markup });
      return { ok: true };
    },
    async edit(_chat: number, _id: number, text: string, markup: Markup): Promise<SendResult> {
      bot.edits.push({ text, markup });
      return { ok: true };
    },
    async answer(_id: string, text: string): Promise<SendResult> {
      bot.answers.push(text);
      return { ok: true };
    },
  };
  return bot;
}

export interface RowSpec {
  index: number;
  title: string;
  ticker: string;
  company?: string;
  summary?: string;
  /** "dd.MM.yyyy HH:mm:ss" in Istanbul. */
  at: string;
  related?: boolean;
  year?: number;
  period?: string;
  related_stocks?: string;
}

export function kapItem(r: RowSpec): unknown {
  return {
    disclosureBasic: {
      title: r.title,
      stockCode: r.ticker,
      relatedStocks: r.related_stocks ?? null,
      companyTitle: r.company ?? `${r.ticker} A.Ş.`,
      disclosureClass: "ODA",
      publishDate: r.at,
      disclosureIndex: r.index,
      summary: r.summary ?? "",
      year: r.year ?? null,
      period: r.period ?? null,
      relatedDisclosureOid: r.related ? "abc" : null,
    },
    disclosureDetail: { relatedDisclosureIndex: null },
  };
}

export const BUYBACK = "Payların Geri Alınmasına İlişkin Bildirim";
export const CONTRACT = "Yeni İş İlişkisi";
export const NOISE = "Pay Bazında Devre Kesici Bildirimi";

/** "2026-11-24" + "09:10:05" -> "24.11.2026 09:10:05" */
export const kapTime = (date: string, hhmmss: string): string => `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)} ${hhmmss}`;
