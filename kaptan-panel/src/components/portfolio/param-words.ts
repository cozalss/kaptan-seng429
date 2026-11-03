import type { Position, RiskStatus } from "@/lib/domain";
import { positionReturn } from "./risk-math";

/**
 * The words and the geometry of Param, as pure functions: where the money sits in one sentence,
 * when a holding will be suggested for sale, how far the two brakes are, and the "skyline"
 * (width = money, height above or below the water = how much it gained or lost).
 */

/** "Paran 8 yerde duruyor.": every company is a place and so is the cash. `null` = cash unknown. */
export function placesSentence(holdings: number, cash: number | null): string {
  if (cash === null) return holdings === 0 ? "Şu an hiç hissen yok." : `Paran ${holdings} şirkette duruyor.`;
  const places = holdings + (cash > 0 ? 1 : 0);
  if (places === 0) return "Henüz hiç paran görünmüyor.";
  if (places === 1) return holdings === 1 ? "Paranın hepsi tek şirkette duruyor." : "Paranın hepsi nakit duruyor.";
  return `Paran ${places} yerde duruyor.`;
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;
/** The locative a month's name takes when read aloud: Ocak’ta, Nisan’da, Eylül’de. */
const MONTH_LOC = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"] as const;

function dayMonth(date: string): { day: number; month: number } {
  return { day: Number(date.slice(8, 10)), month: Number(date.slice(5, 7)) - 1 };
}

/** "8 Ocak" for a YYYY-MM-DD. */
export function dateWords(date: string): string {
  const { day, month } = dayMonth(date);
  return `${day} ${MONTHS[month] ?? ""}`;
}

/** "14 Şubat’ta" for a YYYY-MM-DD. */
export function dateLocative(date: string): string {
  const { month } = dayMonth(date);
  return `${dateWords(date)}’${MONTH_LOC[month] ?? "de"}`;
}

/** When KAPtan will suggest selling, from the position's planned date (06 §6, X1). */
export function exitSentence(p: Pick<Position, "planned_exit_date">, today: string): string {
  if (p.planned_exit_date === today) return "KAPtan bunu bugün satmayı önerecek.";
  if (p.planned_exit_date < today) return `Planlanan satış günü geçti (${dateWords(p.planned_exit_date)}).`;
  return `KAPtan bunu ${dateLocative(p.planned_exit_date)} satmayı önerecek.`;
}

/** Above the water what is worth at least what was paid (best first), below it the rest (worst last). */
export function waterSplit<T extends Pick<Position, "avg_cost" | "last_price">>(positions: readonly T[]): { above: T[]; below: T[] } {
  const sorted = [...positions].sort((a, b) => positionReturn(b) - positionReturn(a));
  return { above: sorted.filter((p) => positionReturn(p) >= 0), below: sorted.filter((p) => positionReturn(p) < 0) };
}

export interface SkylineColumn {
  ticker: string;
  name: string;
  value: number;
  paid: number;
  gain: number;
  ratio: number;
  /** Share of all the money: the column's width. */
  share: number;
  /** 0…1 of the tallest column the scale allows: the column's height from the water. */
  height: number;
}

export interface Skyline {
  columns: SkylineColumn[];
  cashShare: number;
  /** How far the drawing reaches above and below the water, as a return. */
  up: number;
  down: number;
}

/** A quiet portfolio stays a quiet picture: the scale never spans less than this return. */
const MIN_REACH = 0.05;

/**
 * Width follows the money and height the return, so a column's area is the lira gained or lost.
 * The same scale serves both sides of the water; a side nothing reaches takes no room.
 */
export function skyline(positions: readonly Position[], cash: number): Skyline {
  const { above, below } = waterSplit(positions);
  const ordered = [...above, ...below];
  const value = (p: Position) => p.qty * p.last_price;
  const total = ordered.reduce((sum, p) => sum + value(p), 0) + Math.max(0, cash);
  const ups = above.map(positionReturn);
  const downs = below.map((p) => -positionReturn(p));
  const reach = Math.max(MIN_REACH, ...ups, ...downs);
  return {
    columns: ordered.map((p) => ({
      ticker: p.ticker,
      name: p.company_name,
      value: value(p),
      paid: p.qty * p.avg_cost,
      gain: p.unrealized_pnl,
      ratio: positionReturn(p),
      share: total > 0 ? value(p) / total : 0,
      height: Math.abs(positionReturn(p)) / reach,
    })),
    cashShare: total > 0 ? Math.max(0, cash) / total : 0,
    up: ups.length ? reach : 0,
    down: downs.length ? reach : 0,
  };
}

export interface Guard {
  /** The lira the rule allows to fall (day guard) or the floor's distance from the peak. */
  limit: number;
  /** The money level where the rule acts. */
  floor: number;
  /** How far the money is from it now. */
  distance: number;
  /** Where the money stood when the measure began (start of the day, or the peak). */
  start: number;
  reached: boolean;
}

/** The daily brake, measured from the money at the start of today. `haltPct` is negative (−0,01). */
export function dayGuard(risk: Pick<RiskStatus, "equity" | "daily_pnl_pct" | "halted_today">, haltPct: number): Guard {
  const start = risk.equity / (1 + risk.daily_pnl_pct);
  const limit = start * Math.abs(haltPct);
  const floor = start - limit;
  const distance = risk.equity - floor;
  return { limit, floor, distance, start, reached: risk.halted_today || distance <= 0 };
}

/** The big brake, measured from the highest the money has ever been. `stopPct` is negative (−0,05). */
export function peakGuard(risk: Pick<RiskStatus, "equity" | "peak_equity">, stopPct: number): Guard {
  const limit = risk.peak_equity * Math.abs(stopPct);
  const floor = risk.peak_equity - limit;
  const distance = risk.equity - floor;
  return { limit, floor, distance, start: risk.peak_equity, reached: distance <= 0 };
}

/** Today's change in lira, from the same two figures the home uses. */
export function todayLira(risk: Pick<RiskStatus, "equity" | "daily_pnl_pct">): number {
  return risk.equity - risk.equity / (1 + risk.daily_pnl_pct);
}
