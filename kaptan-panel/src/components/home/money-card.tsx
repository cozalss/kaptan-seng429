"use client";

import { smoothArea, smoothPath } from "@/components/ui/curve";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useNow } from "@/lib/clock";
import { fmtFigurePct, fmtSignedFigurePct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";
import type { EquityPoint, Overview } from "@/lib/solo/overview";
import { liraParts } from "@/lib/solo/words";
import { filterPeriod, PERIOD_LABEL, PERIODS, periodIsDistinct, type Period } from "@/lib/solo/period";
import { isTradingDay } from "@/lib/time";
import { Boat } from "@/components/ufuk/boat";
import { Figure } from "@/components/ui/figure";
import { PriceAge } from "@/components/solo/price-age";
import { isFlat } from "@/components/solo/money-hero";
import { daySentence, differenceWords, todayAmount, type DayMood } from "@/components/solo/horizon";

/** The line's box in viewBox units; the boat sits at the right end, so the line stops short of the edge. */
const W = 300;
const H = 64;
const LINE_END = 0.86;
const PAD_Y = 6;

export interface Spark {
  /** The money line, in viewBox units. */
  line: string;
  /** The area between the line and the waterline (filled green above, claret below by clipping). */
  area: string;
  /** The waterline (where the person started), in viewBox units. */
  waterY: number;
  /** Today's point, as fractions of the box (for the boat, which is HTML so it never stretches). */
  end: { x: number; y: number };
}

/** The money line in a small box, with the starting amount as the waterline. Null under two points. Pure. */
export function sparkGeometry(points: readonly EquityPoint[], capitalStart: number): Spark | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.equity);
  const lo = Math.min(capitalStart, ...values);
  const hi = Math.max(capitalStart, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => PAD_Y + (1 - (v - lo) / span) * (H - 2 * PAD_Y);
  const x = (i: number) => (i / (points.length - 1)) * W * LINE_END;
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = smoothPath(pts);
  const last = values[values.length - 1] ?? capitalStart;
  const waterY = y(capitalStart);
  const area = smoothArea(pts, waterY);
  return { line, area, waterY, end: { x: LINE_END, y: y(last) / H } };
}

const MOOD_MARK: Partial<Record<DayMood, string>> = { up: "▲", down: "▼" };

/** "▲ 2.135 ₺ · %0,21 bugün", or the plain word for a closed, flat, unknown or first day. */
function DayChange({ equityNow, todayPct, started }: { equityNow: number; todayPct: number | null; started: boolean }) {
  const now = useNow(60_000);
  const tradingDay = now === null || isTradingDay(istanbulDay(now));
  const s = daySentence({ equityNow, todayPct, tradingDay, started });
  if ((s.mood === "up" || s.mood === "down") && todayPct !== null) {
    return (
      <p className="hm-money-day hm-chip" data-mood={s.mood}>
        <span aria-hidden>{MOOD_MARK[s.mood]} </span>
        <span className="sr-only">{s.mood === "up" ? "Bugün arttı: " : "Bugün azaldı: "}</span>
        <Figure value={Math.abs(todayAmount(equityNow, todayPct))} kind="lira" />{" "}<span className="hm-money-pct">{fmtSignedFigurePct(todayPct)}</span>
        <span aria-hidden> bugün</span>
      </p>
    );
  }
  const words: Record<DayMood, string> = {
    up: "",
    down: "",
    flat: "Bugün yerinde duruyor.",
    closed: "Borsa bugün kapalı; paran yerinde.",
    unknown: "Bugünün rakamları henüz gelmedi.",
    new: "Henüz hisse yok; paranın hepsi nakit.",
  };
  return <p className="hm-money-day">{words[s.mood]}</p>;
}

/**
 * "Paran şu an": the money in one calm card on the ink sea. The total, today's move, the money's line as
 * a small horizon with the boat on today, how old the prices are, and the way to Param. The whole card
 * opens Param; the one link inside says so.
 */
const PERIOD_WORD: Readonly<Record<Period, string>> = { "1A": "1 ay", "3A": "3 ay", Tümü: "Tümü" };

export function MoneyCard({ overview, todayPct }: { overview: Overview; todayPct: number | null }) {
  const { whole, cents } = liraParts(overview.equity_now);
  const [period, setPeriod] = useState<Period>("Tümü");
  const clip = useId().replace(/:/g, "");
  const points = useMemo(() => filterPeriod(overview.equity_series, period), [overview.equity_series, period]);
  const spark = useMemo(() => sparkGeometry(points, overview.capital_start), [points, overview.capital_start]);
  const started = overview.equity_series.length >= 2 || overview.allocations.length > 0;
  const invested = overview.allocations.reduce((sum, a) => sum + a.amount, 0);
  const noShares = overview.allocations.length === 0;
  // A line only says something once the money has moved: a flat or one-day line and its range pills stay hidden.
  const moved = !isFlat(overview.equity_series);
  return (
    <section aria-labelledby="paran-su-an" className="hm-money-wrap">
      <div className="hm-money">
        <h2 id="paran-su-an" className="hm-money-label">
          Paran
        </h2>
        <p className="hm-money-about">Kasandaki ve hisselerdeki toplam</p>
        <p className="hm-money-total" data-testid="toplam-para">
          <Figure value={Number(whole.replace(/\D/g, ""))} kind="int" className="solo-figure" />
          <span className="solo-figure hm-money-minor">,{cents}</span>
          <span className="solo-figure hm-money-minor hm-money-lira">₺</span>
        </p>
        {noShares ? (
          <p className="hm-money-status hm-money-status--new">Henüz hisse yok, paranın tamamı nakitte. Öneri gelince burada değişimi görürsün.</p>
        ) : (
          <>
            <DayChange equityNow={overview.equity_now} todayPct={todayPct} started={started} />
            <p className="hm-money-status">{differenceWords(overview.equity_now, overview.capital_start)}</p>
          </>
        )}
        {spark && moved ? (
          <div className="hm-spark" aria-hidden>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hm-spark-svg" focusable="false">
              <defs>
                <clipPath id={`${clip}-up`}>
                  <rect x={0} y={0} width={W} height={spark.waterY} />
                </clipPath>
                <clipPath id={`${clip}-down`}>
                  <rect x={0} y={spark.waterY} width={W} height={H} />
                </clipPath>
              </defs>
              <path d={spark.area} className="hm-spark-fill hm-spark-fill--up" clipPath={`url(#${clip}-up)`} />
              <path d={spark.area} className="hm-spark-fill hm-spark-fill--down" clipPath={`url(#${clip}-down)`} />
              <line x1={0} x2={W} y1={spark.waterY} y2={spark.waterY} className="hm-spark-water" vectorEffect="non-scaling-stroke" />
              <path d={spark.line} className="hm-spark-line" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="hm-spark-at" style={{ left: `${(spark.end.x * 100).toFixed(2)}%`, top: `${(spark.end.y * 100).toFixed(2)}%` }}>
              <Boat className="hm-spark-boat" />
            </span>
          </div>
        ) : null}
        {moved ? (
          <div role="group" aria-label="Dönem" className="hm-pills">
            {PERIODS.map((p) => {
              const distinct = periodIsDistinct(overview.equity_series, p);
              return (
                <button key={p} type="button" className="hm-pill" aria-pressed={period === p} disabled={!distinct} aria-label={distinct ? PERIOD_LABEL[p] : `${PERIOD_LABEL[p]}: henüz bu kadar uzun bir geçmiş yok`} onClick={() => setPeriod(p)}>
                  {PERIOD_WORD[p]}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="hm-money-foot">
          <PriceAge asOf={overview.prices_as_of} className="hm-money-age" />
          <Link href={ROUTES.portfoy} className="hm-money-link">
            Param’da gör <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
      {noShares ? null : (
      <dl className="hm-figs">
        <div>
          <dt>Başladığından beri</dt>
          <dd data-mood={Math.round(overview.pnl_abs) > 0 ? "up" : Math.round(overview.pnl_abs) < 0 ? "down" : undefined}>{Math.round(overview.pnl_abs) === 0 ? "Değişim yok" : <Figure value={overview.pnl_abs} kind="signedLira" />}</dd>
        </div>
        <div>
          <dt>Nakit</dt>
          <dd>
            <Figure value={overview.cash} kind="lira" />
          </dd>
        </div>
        <div>
          <dt>Yatırımda</dt>
          <dd>
            <Figure value={invested} kind="lira" />
            {overview.equity_now > 0 ? <span className="hm-figs-pct"> {fmtFigurePct(invested / overview.equity_now)}</span> : null}
          </dd>
        </div>
      </dl>
      )}
    </section>
  );
}
