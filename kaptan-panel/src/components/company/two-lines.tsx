"use client";

import type { PricePoint } from "@/lib/company/company";
import { rebaseTo100, rebasedChange } from "@/lib/company/rebase";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";
import { keepFigures } from "@/components/story/num";
import { axisEnds, crossesYear, fmtChartDay, fmtSignedFigurePct } from "@/lib/format";
import { CHART_PAD as PAD, CHART_W as W, ChartFrame, chartX } from "./chart-frame";

const H = 220;

/** "+%3,1" / "−%1,8" / "%0": the app's Turkish percent, sign in front. */
const pct = (n: number | null) => (n === null ? "—" : fmtSignedFigurePct(n / 100));

/** The sentence under the lines: who ended higher, both rebased to the same start. Pure; also used in tests. */
export function twoLinesSentence(a: string, b: string, changeA: number | null, changeB: number | null, from: string | null): string {
  if (changeA === null || changeB === null || !from) return "İki fiyatın birlikte kayıtlı olduğu yeterli gün yok.";
  const lead = changeA === changeB ? "İkisi aynı yerde." : changeA > changeB ? `${a} önde.` : `${b} önde.`;
  return `${fmtChartDay(from, true)} gününden beri ${a} ${pct(changeA)}, ${b} ${pct(changeB)}. ${lead}`;
}

/**
 * Two price lines on one scale: both start at 100 on the first day both have a close, so the one that ends
 * higher did better over those days. The first is ink with a round end, the second indigo with a square end, and
 * each line's end carries its code, so the two differ without colour. Both read off the same gutter scale
 * (change since the start). A pointer shows both values on a day.
 */
export function TwoLines({ a, b, labelA, labelB }: { a: readonly PricePoint[]; b: readonly PricePoint[]; labelA: string; labelB: string }) {
  const r = rebaseTo100(a, b);
  const changeA = rebasedChange(r.a);
  const changeB = rebasedChange(r.b);
  const sentence = twoLinesSentence(labelA, labelB, changeA, changeB, r.from);
  if (r.days.length < 2) return <p className="co-empty">{sentence}</p>;
  const all = [...r.a, ...r.b];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const n = r.days.length;
  const x = (i: number) => chartX(i, n);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const path = (vs: readonly number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const yearly = crossesYear(r.days[0]!, r.days.at(-1)!);
  const [from, to] = axisEnds(r.days[0]!, r.days.at(-1)!);
  const since = (v: number) => pct(Math.round((v - 100) * 100) / 100);
  return (
    <figure className="co-line co-two">
      <ChartFrame
        h={H}
        count={n}
        ticks={[
          { y: y(hi), label: since(hi) },
          { y: y(lo), label: since(lo) },
          { y: y(100), label: "Başlangıç", strong: true },
        ]}
        ends={[
          { y: y(r.b.at(-1)!), series: "b", label: labelB },
          { y: y(r.a.at(-1)!), series: "a", label: labelA },
        ]}
        marksAt={(i) => [
          { y: y(r.b[i]!), series: "b" },
          { y: y(r.a[i]!), series: "a" },
        ]}
        tipAt={(i) => (
          <>
            <span>{fmtChartDay(r.days[i]!, yearly)}</span>
            <span className="co-tip-row">
              <i className="co-key-a" /> {labelA} <b>{since(r.a[i]!)}</b>
            </span>
            <span className="co-tip-row">
              <i className="co-key-b" /> {labelB} <b>{since(r.b[i]!)}</b>
            </span>
          </>
        )}
      >
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={sentence} preserveAspectRatio="none">
          <line x1={PAD} x2={W - PAD} y1={y(hi)} y2={y(hi)} className="co-grid" vectorEffect="non-scaling-stroke" />
          <line x1={PAD} x2={W - PAD} y1={y(lo)} y2={y(lo)} className="co-grid" vectorEffect="non-scaling-stroke" />
          <line x1={PAD} x2={W - PAD} y1={y(100)} y2={y(100)} className="co-water" vectorEffect="non-scaling-stroke" />
          <path d={path(r.b)} fill="none" className="co-stroke-b" vectorEffect="non-scaling-stroke" />
          <path d={path(r.a)} fill="none" className="co-stroke" vectorEffect="non-scaling-stroke" />
        </svg>
      </ChartFrame>
      <div aria-hidden className="co-line-cap">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      <figcaption className="co-two-cap">
        <span className="co-key">
          <i aria-hidden className="co-key-a" /> {labelA} <b className={cn("tabular-nums", signTone(changeA ?? 0))}>{pct(changeA)}</b>
        </span>
        <span className="co-key">
          <i aria-hidden className="co-key-b" /> {labelB} <b className={cn("tabular-nums", signTone(changeB ?? 0))}>{pct(changeB)}</b>
        </span>
        <span className="co-two-note">{keepFigures(sentence)}</span>
      </figcaption>
    </figure>
  );
}
