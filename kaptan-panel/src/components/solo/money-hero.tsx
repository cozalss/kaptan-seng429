"use client";

import { useMemo, useState } from "react";
import type { Position } from "@/lib/domain";
import { fmtFigurePct, fmtSignedFigurePct } from "@/lib/format";
import type { EquityPoint, Overview } from "@/lib/solo/overview";
import { filterPeriod, PERIOD_LABEL, PERIODS, periodIsDistinct, type Period } from "@/lib/solo/period";
import { dayLabel, fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/ui/figure";
import { HeroPlot } from "./hero-plot";
import { differenceWords, moneyMarks } from "./horizon";

/** Few days, or the money has not moved yet: a short plot and a promise instead of a flat box. */
export function isFlat(points: readonly EquityPoint[]): boolean {
  return points.length < 3 || new Set(points.map((p) => Math.round(p.equity))).size < 2;
}

/** The switch's words: what the person reads; the API's period names stay in lib/solo/period. */
const PERIOD_WORD: Readonly<Record<Period, string>> = { "1A": "1 ay", "3A": "3 ay", Tümü: "Tümü" };

/**
 * The money's line on Param, full bleed, no card: a small heading over the line drawn as a horizon where the
 * starting amount is the waterline and the boat sits on today. The sea below carries the plain facts a person
 * checks next.
 */
export function MoneyHero({ overview, positions }: { overview: Overview; positions: readonly Position[] }) {
  const series = overview.equity_series;
  const [period, setPeriod] = useState<Period>("Tümü");
  const [tableOpen, setTableOpen] = useState(false);
  const points = useMemo(() => filterPeriod(series, period), [series, period]);
  const marks = useMemo(() => moneyMarks(points, positions), [points, positions]);
  const invested = overview.allocations.reduce((s, a) => s + a.amount, 0);

  return (
    <section aria-labelledby="paran-baslik" className="relative isolate">
      <div className="hz-stage">
        <div className={cn("hz-top", isFlat(points) && "hz-top--short")}>
          <HeroPlot key={period} points={points} capitalStart={overview.capital_start} marks={marks} flat={isFlat(points)} />
          <div className="hz-head u-page">
            <h2 id="paran-baslik" data-hz-words className="u-caption w-fit pt-2">
              Paran gün gün
            </h2>
          </div>
        </div>
        <div className="hz-sea">
          <div className="u-page">
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              {points.length >= 2 ? (
                <div className="flex flex-wrap items-center gap-x-5">
                  <button type="button" aria-expanded={tableOpen} onClick={() => setTableOpen((v) => !v)} className="hz-table-toggle">
                    <svg aria-hidden viewBox="0 0 10 10" className={cn("size-2.5 transition-transform duration-[var(--dur-quick)]", tableOpen && "rotate-90")} fill="currentColor">
                      <path d="M3 1.5 7.5 5 3 8.5Z" />
                    </svg>
                    Tablo olarak göster
                  </button>
                  <p className="text-dense text-on-sea-soft max-lg:hidden">Grafiğin üstünde gezin; o gün paran ne kadarmış, gör.</p>
                </div>
              ) : null}
              <PeriodSwitch series={series} period={period} onChoose={setPeriod} />
            </div>
            {tableOpen ? <SeriesTable points={points} capitalStart={overview.capital_start} marks={marks} /> : null}
            <dl className="hz-facts">
              <Fact label="Başladığından beri" meaning="Koyduğun paranın üstüne ne kazandın ya da kaybettin. Para eklemek ya da çekmek bunu değiştirmez.">
                {Math.round(overview.pnl_abs) === 0 ? (
                  <span>Henüz değişim yok</span>
                ) : (
                  <>
                    <Figure value={overview.pnl_abs} kind="signedLira" /> <span className="text-[17px] font-medium text-on-sea-soft">{fmtSignedFigurePct(overview.pnl_pct)}</span>
                  </>
                )}
              </Fact>
              <Fact label="Kullanılabilir nakit" meaning="Hazırda bekleyen, kullanıma hazır para.">
                <Figure value={overview.cash} kind="lira" />
              </Fact>
              <Fact label="Yatırımda" meaning="Şu an hisse senetlerinde duran para.">
                <Figure value={invested} kind="lira" /> {overview.equity_now > 0 ? <span className="text-[17px] font-medium text-on-sea-soft">{fmtFigurePct(invested / overview.equity_now)}</span> : null}
              </Fact>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, meaning, children }: { label: string; meaning: string; children: React.ReactNode }) {
  return (
    <div className="hz-fact">
      <dt className="text-ui font-semibold text-on-sea">{label}</dt>
      <dd className="mt-1 text-[26px] leading-8 font-semibold tracking-[-0.02em] whitespace-nowrap text-on-sea tabular-nums sm:text-[30px] sm:leading-9">{children}</dd>
      <dd className="mt-1 text-dense text-on-sea-soft">{meaning}</dd>
    </div>
  );
}

function PeriodSwitch({ series, period, onChoose }: { series: readonly EquityPoint[]; period: Period; onChoose: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Dönem" className="-mr-3 ml-auto flex">
      {PERIODS.map((p) => {
        const distinct = periodIsDistinct(series, p);
        const word = PERIOD_WORD[p];
        return (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            disabled={!distinct}
            title={distinct ? PERIOD_LABEL[p] : "Yeterli geçmiş yok"}
            aria-label={p === "Tümü" ? "Tümü: başından beri" : distinct ? PERIOD_LABEL[p] : `${PERIOD_LABEL[p]}: henüz bu kadar uzun bir geçmiş yok`}
            onClick={() => onChoose(p)}
            className="hz-period"
          >
            {word}
          </button>
        );
      })}
    </div>
  );
}

function SeriesTable({ points, capitalStart, marks }: { points: readonly EquityPoint[]; capitalStart: number; marks: ReturnType<typeof moneyMarks> }) {
  const byIndex = new Map(marks.map((m) => [m.index, m.sentence]));
  const rows = points.map((p, i) => ({ p, what: byIndex.get(i) ?? null })).reverse();
  return (
    <div className="mt-1 max-h-[340px] overflow-y-auto text-dense">
      <table className="w-full text-left text-on-sea tabular-nums">
          <caption className="sr-only">Gün gün paranın değeri</caption>
          <thead>
            <tr className="border-b-2 border-sea-rule text-on-sea-soft">
              <th scope="col" className="py-1.5 font-semibold">
                Gün
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Değer
              </th>
              <th scope="col" className="py-1.5 pl-4 font-semibold max-sm:sr-only">
                Başlangıca göre
              </th>
              <th scope="col" className="py-1.5 pl-4 font-semibold max-sm:sr-only">
                Ne oldu
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, what }) => (
              <tr key={p.date} className="border-b border-sea-rule">
                <td className="py-1.5 whitespace-nowrap">{dayLabel(p.date)}</td>
                <td className="py-1.5 text-right whitespace-nowrap">{fmtLira(p.equity)}</td>
                <td className="py-1.5 pl-4 max-sm:sr-only">{differenceWords(p.equity, capitalStart)}</td>
                <td className="py-1.5 pl-4 max-sm:sr-only">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
