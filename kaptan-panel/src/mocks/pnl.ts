import type { PnlPoint, PnlStrategy } from "@/lib/domain";
import { tradingDaysBetween } from "@/lib/time";
import { PAPER_EQUITY_TRY } from "./explain-builder";
import { createRng, round } from "./rng";

/**
 * Forward paper P&L (örnek değer · gerçek sonuç değil): 1.000.000 TL virtual capital,
 * v1.0-fwd from 9 Nov 2026, v1.1-fwd from 23 Nov 2026, against BIST-100 buy-and-hold and
 * the equal-weight universe (08 §8.1 panel 2). Ends on the last session before the demo day.
 */
export const PAPER_START = "2026-11-09";
export const V11_START = "2026-11-23";
export const PNL_END = "2027-01-08";
const CAPITAL = 1_000_000;

interface SeriesSpec {
  strategy: PnlStrategy;
  from: string;
  seed: number;
  drift: number;
  vol: number;
  target: number | null;
  trades: number;
}

const SPECS: readonly SeriesSpec[] = [
  { strategy: "kaptan:v1.1-fwd", from: V11_START, seed: 11, drift: 0.0004, vol: 0.0045, target: PAPER_EQUITY_TRY, trades: 14 },
  { strategy: "kaptan:v1.0-fwd", from: PAPER_START, seed: 10, drift: 0.0002, vol: 0.006, target: 1_009_900, trades: 19 },
  { strategy: "baseline:xu100_bh", from: PAPER_START, seed: 100, drift: 0.0003, vol: 0.011, target: 1_021_700, trades: 1 },
  { strategy: "baseline:ew_universe", from: PAPER_START, seed: 101, drift: 0.0002, vol: 0.009, target: 1_012_300, trades: 1 },
];

function series(s: SeriesSpec): PnlPoint[] {
  const days = tradingDaysBetween(s.from, PNL_END);
  const rng = createRng(s.seed);
  const raw: number[] = [];
  let eq = CAPITAL;
  for (let i = 0; i < days.length; i += 1) {
    eq *= 1 + s.drift + rng.normal(0, s.vol);
    raw.push(eq);
  }
  // Pin the last value to the target with a linear correction (keeps the shape, fixes the end).
  const last = raw[raw.length - 1] ?? CAPITAL;
  const fix = s.target === null ? 0 : s.target - last;
  let peak = CAPITAL;
  let prev = CAPITAL;
  return days.map((d, i) => {
    const equity = round((raw[i] ?? CAPITAL) + (fix * (i + 1)) / days.length, 0);
    peak = Math.max(peak, equity);
    const point: PnlPoint = {
      d,
      strategy: s.strategy,
      equity,
      daily_return: round(equity / prev - 1, 5),
      peak_equity: peak,
      drawdown: round(Math.min(0, equity / peak - 1), 5),
      n_positions: s.strategy.startsWith("kaptan") ? Math.min(6, 1 + Math.floor(i / 5)) : 0,
      n_trades: s.strategy.startsWith("kaptan") ? Math.round((s.trades * (i + 1)) / days.length) : 0,
    };
    prev = equity;
    return point;
  });
}

let cache: PnlPoint[] | null = null;

export function paperPnl(): readonly PnlPoint[] {
  cache ??= SPECS.flatMap(series);
  return cache;
}

export function lastPoint(strategy: PnlStrategy): PnlPoint | undefined {
  const pts = paperPnl().filter((p) => p.strategy === strategy);
  return pts[pts.length - 1];
}

/** The strategy the desk trades live today (risk status, kill switch, live chart point). */
export const LIVE_STRATEGY: PnlStrategy = "kaptan:v1.1-fwd";

/**
 * Today's intraday equity of the live strategy: the last close compounded by the daily P&L,
 * measured against the same running peak the P&L fixture uses. The single source for
 * `riskStatus` (equity, peak, drawdown) and the charts' "bugün" point, so the drawdown
 * never jumps between yesterday's close and today.
 */
export function liveEquity(dailyPnlPct: number): { equity: number; peak: number; drawdown: number } {
  const last = lastPoint(LIVE_STRATEGY);
  const prevClose = last?.equity ?? PAPER_EQUITY_TRY;
  const prevPeak = last?.peak_equity ?? prevClose;
  const equity = Math.round(prevClose * (1 + dailyPnlPct));
  const peak = Math.max(prevPeak, equity);
  return { equity, peak, drawdown: round(Math.min(0, equity / peak - 1), 5) };
}
