import type { PricePoint } from "@/lib/company/company";
import { rebaseTo100, rebasedChange } from "@/lib/company/rebase";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

const W = 640;
const H = 220;
const PAD = 8;

const pct = (n: number | null) => (n === null ? "—" : `%${n > 0 ? "+" : ""}${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`);

/** The sentence under the lines: who ended higher, both rebased to the same start. Pure; also used in tests. */
export function twoLinesSentence(a: string, b: string, changeA: number | null, changeB: number | null, from: string | null): string {
  if (changeA === null || changeB === null || !from) return "İki fiyatın birlikte kayıtlı olduğu yeterli gün yok.";
  const lead = changeA === changeB ? "İkisi aynı yerde." : changeA > changeB ? `${a} önde.` : `${b} önde.`;
  return `${from} gününden beri ${a} ${pct(changeA)}, ${b} ${pct(changeB)}. ${lead}`;
}

/**
 * Two price lines on one scale: both start at 100 on the first day both have a close, so the one that ends
 * higher did better over those days. The first is solid ink, the second dashed. Pure SVG, no animation.
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
  const x = (i: number) => PAD + (i / (r.days.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const path = (vs: readonly number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <figure className="co-line co-two">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={sentence} preserveAspectRatio="none">
        <line x1={PAD} x2={W - PAD} y1={y(100)} y2={y(100)} className="co-water" />
        <path d={path(r.b)} fill="none" className="co-stroke-b" vectorEffect="non-scaling-stroke" />
        <path d={path(r.a)} fill="none" className="co-stroke" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="co-two-cap">
        <span className="co-key">
          <i aria-hidden className="co-key-a" /> {labelA} <b className={cn("tabular-nums", signTone(changeA ?? 0))}>{pct(changeA)}</b>
        </span>
        <span className="co-key">
          <i aria-hidden className="co-key-b" /> {labelB} <b className={cn("tabular-nums", signTone(changeB ?? 0))}>{pct(changeB)}</b>
        </span>
        <span className="co-two-note">{sentence}</span>
      </figcaption>
    </figure>
  );
}
