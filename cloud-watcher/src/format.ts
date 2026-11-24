/**
 * What a message looks like: the same words as backend/src/kaptan/telegram/format.py and morning.py.
 * HTML parse mode, every dynamic text escaped. No money, amounts or share counts, and no approve button.
 */
import { clock } from "./time";
import type { Markup } from "./telegram";
import type { EventRow } from "./types";

export const KAP_URL = "https://www.kap.org.tr/tr/Bildirim/";
export const TONE_MARK: Record<string, string> = { olumlu: "▲ olumlu", olumsuz: "▼ olumsuz", notr: "• nötr", belirsiz: "• nötr" };
export const MAX_LINES = 8;
export const MAX_MINE = 12;
export const TOP_OTHERS = 5;
export const NOTHING_MINE = "Senin hisselerinde önemli bir şey yok.";
export const CAP_NOTE = "Günlük mesaj sınırı dolduğu için bazıları sabaha kaldı; hepsi yukarıda.";
export const WAS_OFF_NOTE = "Bilgisayardaki KAPtan dünden beri kapalı; öneriler için açman gerek.";
export const CB_READ = "ok";
export const CB_LATER = "later";
export const CB_MUTE = "mute";
export const CB_READ_ALL = "okt";
export const LEVEL_TR: Record<string, string> = { less: "Daha az", normal: "Normal", more: "Daha çok" };
export const HELP =
  "KAPtan bu sohbete bağlı. Önemli duyuruları buraya yazarım.\n" +
  "/ayar az | normal | çok: kaç mesaj geleceği\n" +
  "/sessiz: sabaha kadar mesaj gönderme (uygulama çalışmaya devam eder)\n" +
  "/durum: bugünün sayıları";

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const toneMark = (tone: string): string => TONE_MARK[tone] ?? "• nötr";

function head(e: EventRow): string {
  return `<b>${esc(e.ticker)}</b> · ${esc(e.company)}`;
}

/** One disclosure: head, line + tone, the so-what, the time. */
export function one(e: EventRow): string {
  const rows = [head(e), `${esc(e.line)} (${toneMark(e.tone)})`];
  if (e.so_what) rows.push(esc(e.so_what));
  rows.push(`<i>${clock(e.published_at)}</i>`);
  return rows.join("\n");
}

/** A burst for one company: "THYAO · Şirket: 3 yeni duyuru" and one line each. */
export function group(ticker: string, company: string, events: EventRow[]): string {
  const rows = [`<b>${esc(ticker)}</b> · ${esc(company)}: ${events.length} yeni duyuru`];
  for (const e of events.slice(0, MAX_LINES)) rows.push(`• ${esc(e.line)} (${toneMark(e.tone)}) <i>${clock(e.published_at)}</i>`);
  if (events.length > MAX_LINES) rows.push(`… ve ${events.length - MAX_LINES} duyuru daha`);
  return rows.join("\n");
}

/** Okudum / Sonra oku / Aç (the KAP page) / Bu şirketi sustur. callback_data stays under 64 bytes. */
export function keyboard(events: EventRow[]): Markup {
  const last = events.reduce((a, b) => (b.published_at >= a.published_at ? b : a));
  const read =
    events.length === 1
      ? { text: "Okudum", callback_data: `${CB_READ}:${last.idx}` }
      : { text: "Okudum", callback_data: `${CB_READ_ALL}:${last.ticker}:${Math.floor(last.published_at / 1000)}` };
  return {
    inline_keyboard: [
      [read, { text: "Sonra oku", callback_data: `${CB_LATER}:${last.idx}` }],
      [
        { text: "Aç", url: `${KAP_URL}${last.idx}` },
        { text: "Bu şirketi sustur", callback_data: `${CB_MUTE}:${last.ticker}` },
      ],
    ],
  };
}

function bullet(e: EventRow): string {
  return `• <b>${esc(e.ticker)}</b>: ${esc(e.line)} (${toneMark(e.tone)})`;
}

function section(title: string, events: EventRow[], limit: number): string[] {
  const rows = [title, ...events.slice(0, limit).map(bullet)];
  if (events.length > limit) rows.push(`… ve ${events.length - limit} duyuru daha (uygulamada)`);
  return rows;
}

export interface MorningInput {
  mine: EventRow[];
  others: EventRow[];
  /** "Dün akşamdan beri" or "Son iş gününden beri". */
  when: string;
  capped: boolean;
  wasOff: boolean;
}

export function morning(input: MorningInput): string {
  const rows = ["Günaydın."];
  if (input.mine.length) rows.push(...section(`${input.when} senin hisselerinde:`, input.mine, MAX_MINE));
  else rows.push(NOTHING_MINE);
  if (input.others.length) rows.push("", ...section("Günün öne çıkanları:", input.others, TOP_OTHERS));
  if (input.capped) rows.push("", CAP_NOTE);
  if (input.wasOff) rows.push("", WAS_OFF_NOTE);
  return rows.join("\n");
}

export function weekend(mine: EventRow[]): string {
  const rows = ["İyi akşamlar. Borsa yarın kapalı."];
  rows.push(...(mine.length ? section("Bugün senin hisselerinde:", mine, MAX_MINE) : [NOTHING_MINE]));
  rows.push("Bir sonraki iş günü sabahı yine yazarım.");
  return rows.join("\n");
}
