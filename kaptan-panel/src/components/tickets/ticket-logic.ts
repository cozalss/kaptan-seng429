import type { OrderTicket, TicketEntryStatus, TicketMarkInput } from "@/lib/domain";
import { fmtDateTime, fmtInt, fmtPct, fmtPrice, fmtTime } from "@/lib/format";
import { istanbulIso, istanbulMinutes, ISTANBUL_OFFSET_H } from "@/lib/time";

/**
 * Pure logic behind the emir fişi (12 §2, SPEC §2.2): its validity window, the
 * key-field text you copy into your broker app, and the "girildi / dolmadı / iptal" form
 * with the same rules the API enforces (over_qty, over_limit, after_ttl). No React here.
 */
export const TICKET_TTL_MS = 30 * 60_000;

/* ── validity window ─────────────────────────────────────────────────── */
/** When the 30 minutes start: 09:40 for a pre-open ticket, otherwise its creation. */
export function validFrom(t: Pick<OrderTicket, "created_at" | "valid_until">): string {
  const start = Date.parse(t.valid_until) - TICKET_TTL_MS;
  return new Date(Math.max(start, Date.parse(t.created_at))).toISOString();
}

export type TicketPhase = "upcoming" | "valid" | "expired";

export function ticketPhase(t: Pick<OrderTicket, "created_at" | "valid_until">, nowMs: number): TicketPhase {
  if (nowMs >= Date.parse(t.valid_until)) return "expired";
  if (nowMs < Date.parse(validFrom(t))) return "upcoming";
  return "valid";
}

/** A ticket still waiting for your mark (an expired one can still be marked, 12 §2). */
export function isMarkable(t: Pick<OrderTicket, "entry">): boolean {
  return t.entry.status === "awaiting" || t.entry.status === "expired";
}

/**
 * The slips Portföy lists under "Girilecek fişler" (and Bugün counts under "Seni bekleyenler"):
 * still markable and not past their window. Empty until the clock is known.
 */
export function slipsToEnter<T extends Pick<OrderTicket, "entry" | "created_at" | "valid_until">>(
  tickets: readonly T[] | undefined,
  nowMs: number | null,
): T[] {
  if (nowMs === null) return [];
  return (tickets ?? []).filter((t) => isMarkable(t) && ticketPhase(t, nowMs) !== "expired");
}

export const ENTRY_LABEL: Readonly<Record<TicketEntryStatus, string>> = {
  awaiting: "İşaretlenmedi",
  entered: "Girildi",
  unfilled: "Dolmadı",
  canceled: "İptal",
  expired: "Süresi doldu",
};

/* ── reading the slip ────────────────────────────────────────────────── */
export function accountShare(t: Pick<OrderTicket, "est_notional_try" | "account_equity_try">): number {
  return t.account_equity_try > 0 ? t.est_notional_try / t.account_equity_try : 0;
}

/**
 * The key fields, in the order you type them into a broker app (personal use; never shared).
 * Plain spaces only: the screen's no-break spaces ("48,40 TL") paste as odd characters into
 * a broker's price box.
 */
export function ticketCopyText(t: OrderTicket): string {
  return [
    `KAPtan emir fişi ${t.ticket_no}`,
    `AL ${t.ticker} · LİMİT ${fmtPrice(t.limit_price)} · ${fmtInt(t.qty)} lot`,
    `Seans: ${t.session_tr}`,
    `Tahmini tutar: ${fmtInt(t.est_notional_try)} TL (${fmtPct(accountShare(t), 1)} hesap)`,
    `Geçerli: ${fmtTime(validFrom(t))}–${fmtTime(t.valid_until)} · ${fmtDateTime(t.valid_until).slice(0, 10)}`,
    `Fiyat kovalamak yok.`,
  ]
    .join("\n")
    .replace(/ /g, " ");
}

/* ── the mark form ───────────────────────────────────────────────────── */
export type MarkKind = TicketMarkInput["mark"];

export interface MarkDraft {
  kind: MarkKind;
  qty: string;
  price: string;
  time: string;
  note: string;
}

export interface MarkErrors {
  qty: string | null;
  price: string | null;
  time: string | null;
  note: string | null;
}

export const NOTE_MAX = 500;

/** "1.240" or "1240" → 1240; null when not a whole positive-looking number. */
export function parseQty(raw: string): number | null {
  const t = raw.replace(/[\s.]/g, "");
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** "48,32" / "48.32" / "48,32 TL" → 48.32. */
export function parsePrice(raw: string): number | null {
  const t = raw.replace(/\s|TL/gi, "");
  if (!t) return null;
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d{1,4})?$/.test(n) ? Number(n) : null;
}

/** "13:52" → minutes since midnight; null when not a valid 24 h clock. */
export function parseClock(raw: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const istDay = (iso: string) => new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3_600_000).toISOString().slice(0, 10);

/** The fill time on the ticket's own (Istanbul) day as UTC ISO. */
export function fillIso(t: Pick<OrderTicket, "created_at" | "valid_until">, minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return istanbulIso(istDay(validFrom(t)), `${hh}:${mm}`);
}

/** Default "HH:MM" for the fill: now, but never past the ticket's validity. */
export function defaultFillClock(t: Pick<OrderTicket, "created_at" | "valid_until">, nowMs: number): string {
  const at = Math.min(nowMs, Date.parse(t.valid_until) - 60_000);
  const m = istanbulMinutes(new Date(Math.max(at, Date.parse(validFrom(t)))).toISOString());
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function initialDraft(kind: MarkKind, t: OrderTicket, nowMs: number): MarkDraft {
  return {
    kind,
    qty: String(t.qty),
    price: fmtPrice(t.limit_price).replace(/\s?TL$/, ""),
    time: defaultFillClock(t, nowMs),
    note: "",
  };
}

/** Client-side check with the API's own rules (SPEC §2.2). */
export function markErrors(d: MarkDraft, t: Pick<OrderTicket, "qty" | "limit_price" | "created_at" | "valid_until">): MarkErrors {
  const note = d.note.trim().length > NOTE_MAX ? `Not en çok ${NOTE_MAX} karakter.` : null;
  if (d.kind !== "entered") return { qty: null, price: null, time: null, note };
  const qty = parseQty(d.qty);
  const price = parsePrice(d.price);
  const clock = parseClock(d.time);
  return {
    qty: qty === null || qty < 1 ? "Adedi tam sayı olarak yaz." : qty > t.qty ? `Fişteki adetten (${fmtInt(t.qty)} lot) fazla olamaz.` : null,
    price: price === null || price <= 0 ? "Ortalama fiyatı yaz (ör. 48,32)." : price > t.limit_price ? `Limit fiyatı (${fmtPrice(t.limit_price)}) aşamaz.` : null,
    time:
      clock === null
        ? "Saati SS:DD olarak yaz (ör. 13:52)."
        : Date.parse(fillIso(t, clock)) > Date.parse(t.valid_until)
          ? `Geçerlilik ${fmtTime(t.valid_until)}'de bitti; sonrası sayılmaz (R16).`
          : null,
    note,
  };
}

export function hasMarkErrors(e: MarkErrors): boolean {
  return Boolean(e.qty || e.price || e.time || e.note);
}

export function buildMarkInput(d: MarkDraft, t: Pick<OrderTicket, "created_at" | "valid_until">): TicketMarkInput {
  const note = d.note.trim() || undefined;
  if (d.kind !== "entered") return { mark: d.kind, note };
  return {
    mark: "entered",
    filled_qty: parseQty(d.qty) ?? 0,
    avg_price: parsePrice(d.price) ?? 0,
    filled_at: fillIso(t, parseClock(d.time) ?? 0),
    note,
  };
}

/* ── lists ───────────────────────────────────────────────────────────── */
