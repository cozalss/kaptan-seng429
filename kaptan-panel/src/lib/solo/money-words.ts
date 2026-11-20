import { fmtDateTime, fmtTime, NBSP } from "@/lib/format";
import { istanbulDay } from "@/lib/session-day";
import { addDays } from "@/lib/time";
import { ablative } from "@/components/story/turkish";
import type { MoneyMovement } from "./money";

/**
 * The person's own money in plain sentences: what each movement was ("12 Kasım: 5.000 ₺
 * ekledin."), and how old the prices behind a total are ("Fiyatlar bugün 14:05’ten.").
 */
const lira0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const lira2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "5.000 ₺", and the kuruş only when there is some: "1.250,50 ₺". */
export function fmtMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${Number.isInteger(rounded) ? lira0.format(rounded) : lira2.format(rounded)}${NBSP}₺`;
}

const dayMonth = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });
const dayMonthYear = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

/** "12 Kasım"; with the year when it is not this year ("12 Kasım 2025"). `nowMs` null = year unknown, left out. */
export function movementDay(iso: string, nowMs: number | null): string {
  const at = new Date(iso);
  const sameYear = nowMs === null || istanbulDay(at.getTime()).slice(0, 4) === istanbulDay(nowMs).slice(0, 4);
  return (sameYear ? dayMonth : dayMonthYear).format(at);
}

/** What happened, without the day: "5.000 ₺ ekledin." */
export function movementWhat(m: Pick<MoneyMovement, "kind" | "amount_try">): string {
  const amount = fmtMoney(m.amount_try);
  switch (m.kind) {
    case "start":
      return `${amount} ile başladın.`;
    case "deposit":
      return `${amount} ekledin.`;
    case "withdrawal":
      return `${amount} çektin.`;
    case "holding":
      return `Zaten elinde olan bir hisseyi ekledin; alırken ${amount} ödemiştin.`;
  }
}

/** "12 Kasım: 5.000 ₺ ekledin." */
export function movementSentence(m: Pick<MoneyMovement, "kind" | "amount_try" | "occurred_at">, nowMs: number | null): string {
  return `${movementDay(m.occurred_at, nowMs)}: ${movementWhat(m)}`;
}

/** From this Istanbul minute on, yesterday's price is "last evening's" (the market closes at 18:00). */
const EVENING_MIN = 17 * 60 + 30;

function istanbulMinutesOf(ms: number): number {
  const d = new Date(ms + 3 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * How old a price is, in words a person uses: "bugün 14:05’ten", "dün akşamdan", "dün 11:20’den",
 * "8 Ocak gününden". Never a guess: an unreadable time gives null.
 */
export function priceAgePhrase(asOf: string, nowMs: number): string | null {
  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) return null;
  const day = istanbulDay(at);
  const today = istanbulDay(nowMs);
  const clock = ablative(fmtTime(asOf));
  if (day >= today) return `bugün ${clock}`;
  if (day === addDays(today, -1)) return istanbulMinutesOf(at) >= EVENING_MIN ? "dün akşamdan" : `dün ${clock}`;
  return `${movementDay(asOf, nowMs)} gününden`;
}

/**
 * The line near a total: "Fiyatlar bugün 14:05’ten." Null with no holdings (`asOf` null: cash has
 * no price) or while the clock is unknown.
 */
export function pricesAgeSentence(asOf: string | null, nowMs: number | null): string | null {
  if (asOf === null || nowMs === null) return null;
  const phrase = priceAgePhrase(asOf, nowMs);
  return phrase ? `Fiyatlar ${phrase}.` : null;
}

/** The same for one holding. A holding with no price yet says so: it stands at what was paid. */
export function holdingPriceSentence(asOf: string | null, nowMs: number | null): string | null {
  if (asOf === null) return "Fiyatı henüz gelmedi; aldığın fiyattan sayılıyor.";
  if (nowMs === null) return null;
  const phrase = priceAgePhrase(asOf, nowMs);
  return phrase ? `Fiyatı ${phrase}.` : null;
}

/** The exact time behind the plain words, for a hover or a focus: "Tam zamanı: 11.01.2027 13:35". */
export function exactPriceTime(asOf: string): string {
  return `Tam zamanı: ${fmtDateTime(asOf)}`;
}
